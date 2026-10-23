// ============================================================
// scripts/aiCostReport.ts — Ước tính chi phí NẾU các việc của quiz-worker chạy qua Claude API
// ============================================================
//   npm run ai-cost-report                 -> ../reports/chi-phi-claude-<ngày>.xlsx
//   npm run ai-cost-report -- <đường dẫn>  -> ghi ra file chỉ định
//
// Worker chạy bằng Claude Code (gói Team) nên KHÔNG có hóa đơn theo token. Script
// này lấy TỪNG yêu cầu đã làm trong DB (nhập PowerPoint, dịch bài, tạo đề), dựng lại
// đúng prompt mà việc đó cần rồi ước tính token nếu gọi thẳng Claude API:
//   - Token VÀO: dựng lại prompt bằng chính hàm server dùng (buildImportParts,
//     planParts, prepareQuizPrompt) + ~200 token khung API mỗi lần gọi.
//   - Token RA: đo từ kết quả đã lưu (bài tạo ra, bản dịch, đề), nhân hệ số thinking
//     theo loại việc (xem THINKING).
// Số token là ƯỚC TÍNH theo số ký tự (xem estTokens). Giá 9 model và tỷ giá nằm ở
// sheet "Giả định" — sửa ở đó là mọi cột tiền tự tính lại.
//
// CHỈ ĐỌC: toàn câu SELECT, không ghi gì vào DB.

import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { config } from '../config.ts';
import { closeDb, connectDb, query, queryOne } from '../db/pool.ts';
import type { ParsedBlock } from '../blocks/schemas.ts';
import { findDocumentById } from '../repositories/documents.ts';
import { docMarkdown } from '../services/ai/docText.ts';
import { buildImportParts, type ImportPayload } from '../services/pptx/importPrompt.ts';
import { prepareQuizPrompt } from '../services/quiz/generate.ts';
import type { QuizLang } from '../services/quiz/types.ts';
import { planParts, planTranslation } from '../services/translate/engine.ts';
import { TITLE_KEY, extractTexts } from '../services/translate/texts.ts';

// ---------- Ước tính token ----------
// Tokenizer của Claude không có sẵn offline -> đếm theo loại ký tự:
//   ASCII (tiếng Anh, JSON, URL)   ~3,5 ký tự / token
//   chữ Việt có dấu (ắ, ồ, ư...)   ~1 token / ký tự  -> cả câu tiếng Việt ~2,4 ký tự / token
//   kana / kanji                   ~0,85 token / ký tự
function estTokens(s: string): number {
  let ascii = 0;
  let latin = 0;
  let cjk = 0;
  let other = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 128) ascii++;
    else if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x3400 && c <= 0x9fff) || (c >= 0xff00 && c <= 0xffef)) cjk++;
    else if (c < 0x2000) latin++;
    else other++;
  }
  return Math.ceil(ascii / 3.5 + latin + cjk * 0.85 + other);
}

// Mỗi lần gọi API thêm ~200 token: khung tin nhắn + khuôn JSON của structured outputs.
const CALL_OVERHEAD = 200;
// Token ra = chữ trả lời × hệ số thinking (phần suy nghĩ tính tiền như token ra).
// Chuyển slide / dịch là việc làm theo mẫu -> nghĩ ít. Ra đề phải kiểm đáp án,
// nghĩ phương án nhiễu, chọn nguồn -> nghĩ nhiều hơn hẳn.
const THINKING = { import: 1.3, translate: 1.2, quiz: 2.0 };

type Prompt = { system: string; prompt: string; schema: object };
const promptTokens = (p: Prompt) => estTokens(p.system) + estTokens(p.prompt) + estTokens(JSON.stringify(p.schema)) + CALL_OVERHEAD;

// Chữ trong khối (đã trích như lúc gửi dịch) -> token, kèm ~20 token khung JSON mỗi khối.
const blocksOutputTokens = (blocks: ParsedBlock[]) =>
  blocks.reduce((sum, b) => sum + estTokens(Object.values(extractTexts(b)).join('\n')) + 20, 0);

const STATUS: Record<string, string> = {
  done: 'Xong',
  failed: 'Lỗi',
  pending: 'Đang chờ',
  processing: 'Đang làm',
  expired: 'Quá hạn',
  cancelled: 'Đã hủy',
};
// Việc đã xong -> tính đủ. Việc lỗi -> vẫn tính (có thể đã gọi Claude rồi mới lỗi). Còn lại -> 0.
const billable = (status: string) => status === 'done' || status === 'failed';

type Row = {
  cells: (string | number | Date | null)[]; // các cột riêng của từng loại việc
  calls: number;
  tokensIn: number;
  tokensOut: number;
  note: string;
};

// ---------- 1. Nhập PowerPoint ----------
async function importRows(): Promise<Row[]> {
  const jobs = await query<{
    Id: number;
    FileName: string;
    Language: string;
    SlideCount: number;
    Status: string;
    DocumentId: number | null;
    CreatedAt: Date;
    Payload: string;
  }>(`SELECT Id, FileName, Language, SlideCount, Status, DocumentId, CreatedAt, Payload FROM WebManualImportJobs ORDER BY CreatedAt`);

  const rows: Row[] = [];
  for (const j of jobs) {
    const parts = buildImportParts(JSON.parse(j.Payload) as ImportPayload, j.Language);
    const chars = parts.reduce((s, p) => s + p.prompt.length, 0); // chữ + bảng + ghi chú của mọi slide
    const cells = [j.Id, j.FileName, j.SlideCount, chars, j.Language, STATUS[j.Status] ?? j.Status, j.CreatedAt];
    if (!billable(j.Status)) {
      rows.push({ cells, calls: 0, tokensIn: 0, tokensOut: 0, note: 'Chưa gọi Claude' });
      continue;
    }
    const tokensIn = parts.reduce((s, p) => s + promptTokens(p), 0);
    const doc = j.DocumentId ? await findDocumentById(j.DocumentId) : null;
    let tokensOut: number;
    let note = j.Status === 'failed' ? 'Lỗi: có thể đã tốn một phần (ước tính tối đa). ' : '';
    if (doc?.blocks) {
      tokensOut = Math.round(blocksOutputTokens(doc.blocks) * THINKING.import);
      note += `${parts.length} lần gọi (~10 slide/lần). Token ra đo từ bài đã tạo.`;
    } else {
      // Không còn bài -> giả định đầu ra dài bằng phần nội dung slide.
      tokensOut = Math.round((tokensIn - parts.length * CALL_OVERHEAD) * 0.9 * THINKING.import);
      note += 'Không còn bài kết quả: token ra ước theo đầu vào.';
    }
    rows.push({ cells, calls: parts.length, tokensIn, tokensOut, note });
  }
  return rows;
}

// ---------- 2. Dịch bài ----------
// Mỗi dòng = một bài + một ngôn ngữ đích đang có bản dịch. Chỉ thấy được LẦN DỊCH
// GẦN NHẤT; các lần dịch lại từng khối khi sửa bài không được lưu nên không tính.
async function translationRows(): Promise<Row[]> {
  const list = await query<{
    DocumentId: number;
    Lang: string;
    SourceLang: string;
    SourceVersion: number;
    Blocks: string;
    Title: string;
    UpdatedAt: Date;
    EditedAt: Date | null;
  }>(
    `SELECT t.DocumentId, t.Lang, t.SourceLang, t.SourceVersion, t.Blocks, t.Title, t.UpdatedAt, t.EditedAt
     FROM WebManualDocTranslations t ORDER BY t.DocumentId, t.Lang`,
  );

  const rows: Row[] = [];
  const docCache = new Map<number, Awaited<ReturnType<typeof findDocumentById>>>();
  for (const t of list) {
    if (!docCache.has(t.DocumentId)) docCache.set(t.DocumentId, await findDocumentById(t.DocumentId));
    const doc = docCache.get(t.DocumentId);
    if (!doc) continue;

    // Dựng lại việc "dịch cả bài" sang đúng ngôn ngữ này bằng chính hàm của server.
    const source = { id: t.DocumentId, version: doc.version, title: doc.title, blocks: doc.blocks ?? [] };
    const plan = planTranslation(source, [], true);
    const parts = planParts(plan, config.translate.maxCharsPerPart).filter((p) => p.lang === t.Lang);
    const tokensIn = parts.reduce((s, p) => s + promptTokens(p), 0);
    const chars = (plan.targets.find((x) => x.lang === t.Lang)?.items ?? []).reduce(
      (s, i) => s + Object.values(i.texts).join('').length,
      0,
    );
    const cells = [t.DocumentId, doc.title, `${t.SourceLang} → ${t.Lang}`, chars, t.SourceVersion, t.UpdatedAt];

    // Token ra: chữ đã dịch, đúng khuôn { items: [{ id, texts: [{ key, text }] }] }.
    const translated = JSON.parse(t.Blocks) as ParsedBlock[];
    const items = [
      { id: TITLE_KEY, texts: [{ key: 'title', text: t.Title }] },
      ...translated.map((b) => ({ id: b.id, texts: Object.entries(extractTexts(b)).map(([key, text]) => ({ key, text })) })),
    ].filter((i) => i.texts.length);
    const tokensOut = Math.round(estTokens(JSON.stringify({ items })) * THINKING.translate);

    const notes = ['Tính 1 lần dịch toàn bài.'];
    if (doc.version !== t.SourceVersion) notes.push(`Bài gốc đã sửa (v${t.SourceVersion} → v${doc.version}), đầu vào tính theo bản hiện tại.`);
    if (t.EditedAt) notes.push('Bản dịch đã được sửa tay.');
    rows.push({ cells, calls: parts.length, tokensIn, tokensOut, note: notes.join(' ') });
  }
  return rows;
}

// ---------- 3. Tạo đề ----------
async function quizRows(): Promise<Row[]> {
  const jobs = await query<{
    Id: number;
    SourceDocs: string;
    Language: string;
    QuestionCount: number;
    Status: string;
    QuizId: number | null;
    CreatedAt: Date;
  }>(`SELECT Id, SourceDocs, Language, QuestionCount, Status, QuizId, CreatedAt FROM WebManualQuizJobs ORDER BY CreatedAt`);

  const rows: Row[] = [];
  for (const j of jobs) {
    const sourceDocs = JSON.parse(j.SourceDocs) as { id: string; title: string }[];
    const notes: string[] = j.Status === 'failed' ? ['Lỗi: có thể đã tốn một phần (ước tính tối đa).'] : [];

    // Tài liệu nguồn gửi cho Claude (dựng lại kể cả khi việc bị hủy, để biết quy mô).
    let tokensIn: number;
    let chars: number;
    try {
      const p = await prepareQuizPrompt(sourceDocs.map((d) => Number(d.id)), j.QuestionCount, j.Language as QuizLang, config.quiz.claudeMaxChars);
      tokensIn = promptTokens({ system: p.system, prompt: p.user, schema: p.schema });
      chars = p.user.length;
    } catch {
      // Tài liệu nguồn đã bị xóa / về nháp -> dựng tay từ những bài còn lại.
      const perDoc = Math.floor(config.quiz.claudeMaxChars / Math.max(1, sourceDocs.length));
      let material = '';
      for (const d of sourceDocs) {
        const doc = await findDocumentById(Number(d.id));
        if (doc) material += docMarkdown(doc).slice(0, perDoc);
      }
      tokensIn = estTokens(material) + 450 + CALL_OVERHEAD;
      chars = material.length;
      notes.push('Có tài liệu nguồn đã xóa / về nháp: token vào chỉ tính phần còn lại.');
    }
    const cells = [j.Id, sourceDocs.map((d) => d.title).join('; '), chars, j.QuestionCount, j.Language, STATUS[j.Status] ?? j.Status, j.CreatedAt];
    if (!billable(j.Status)) {
      rows.push({ cells, calls: 0, tokensIn: 0, tokensOut: 0, note: 'Chưa gọi Claude' });
      continue;
    }

    const quiz = j.QuizId ? await queryOne<{ Questions: string }>('SELECT Questions FROM WebManualQuizzes WHERE Id = @id', { id: j.QuizId }) : null;
    let tokensOut: number;
    if (quiz) {
      tokensOut = Math.round(estTokens(quiz.Questions) * THINKING.quiz);
      notes.push('Token ra đo từ đề đã lưu.');
    } else {
      tokensOut = Math.round(j.QuestionCount * 150 * THINKING.quiz);
      notes.push('Đề đã bị xóa: chữ trả lời ước ~150 token / câu.');
    }
    rows.push({ cells, calls: 1, tokensIn, tokensOut, note: notes.join(' ') });
  }
  return rows;
}

// ---------- Ghi Excel ----------
// Giá Anthropic API (USD / 1 triệu token). Thứ tự = thứ tự dòng trong sheet "Giả định".
const MODELS = [
  { name: 'Fable 5.1', in: 10, out: 50, note: 'Mạnh nhất, đắt nhất — không cần cho các việc này' },
  { name: 'Opus 5.5', in: 4, out: 20, note: 'Chất lượng cao nhất trong mức giá hợp lý' },
  { name: 'Opus 5', in: 5, out: 25, note: 'Đời trước, đắt hơn Opus 5.5' },
  { name: 'Opus 4.8', in: 5, out: 25, note: 'Đời cũ, đắt hơn Opus 5.5' },
  { name: 'Sonnet 5.5', in: 2, out: 10, note: 'CÂN BẰNG — đề xuất' },
  { name: 'Sonnet 5', in: 2, out: 10, note: 'Đời trước của Sonnet 5.5, cùng giá' },
  { name: 'Sonnet 4.6', in: 3, out: 15, note: 'Đời cũ, đắt hơn Sonnet 5.5' },
  { name: 'Haiku 5.5', in: 0.1, out: 0.5, note: 'RẺ NHẤT — cần thử chất lượng dịch tiếng Nhật' },
  { name: 'Haiku 4.5', in: 1, out: 5, note: 'Đời cũ, đắt gấp 10 lần Haiku 5.5' },
];
const ASSUME = "'Giả định'";
const FIRST_PRICE_ROW = 4;
const priceIn = (m: number) => `${ASSUME}!$B$${FIRST_PRICE_ROW + m}`;
const priceOut = (m: number) => `${ASSUME}!$C$${FIRST_PRICE_ROW + m}`;
const RATE_ROW = FIRST_PRICE_ROW + MODELS.length + 1;
const RATE = `${ASSUME}!$B$${RATE_ROW}`;

const vnd = (inCell: string, outCell: string, m: number) => `(${inCell}*${priceIn(m)}+${outCell}*${priceOut(m)})/1000000*${RATE}`;
const usd = (inCell: string, outCell: string, m: number) => `(${inCell}*${priceIn(m)}+${outCell}*${priceOut(m)})/1000000`;

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { wrapText: true, vertical: 'middle' };
  row.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });
}

const colLetter = (n: number) => {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

type Col = { header: string; width: number; date?: boolean; number?: boolean };

// Trả về địa chỉ các ô tổng (để sheet Tổng hợp tham chiếu).
function detailSheet(wb: ExcelJS.Workbook, name: string, title: string, own: Col[], rows: Row[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 2, ySplit: 3 }] });
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow(['Mỗi dòng là một yêu cầu thật trong hệ thống. Token là ước tính nếu gọi Claude API; tiền tính bằng VND theo giá + tỷ giá ở sheet "Giả định".']).font = {
    italic: true,
    color: { argb: 'FF64748B' },
  };
  const header = ws.addRow([
    ...own.map((o) => o.header),
    'Số lần gọi Claude',
    'Token vào',
    'Token ra (gồm thinking)',
    ...MODELS.map((m) => `${m.name} (VND)`),
    'Ghi chú',
  ]);
  styleHeader(header);
  header.height = 32;

  const k = own.length; // số cột riêng
  const cIn = colLetter(k + 2);
  const cOut = colLetter(k + 3);
  const first = 4;
  rows.forEach((r, i) => {
    const n = first + i;
    ws.addRow([...r.cells, r.calls, r.tokensIn, r.tokensOut, ...MODELS.map((_, m) => ({ formula: vnd(`${cIn}${n}`, `${cOut}${n}`, m) })), r.note]);
  });
  const last = first + rows.length - 1;
  const total = ws.addRow(['TỔNG']);
  for (let c = k + 1; c <= k + 3 + MODELS.length; c++) {
    const L = colLetter(c);
    total.getCell(c).value = rows.length ? { formula: `SUM(${L}${first}:${L}${last})` } : 0;
  }
  total.font = { bold: true };

  own.forEach((o, i) => {
    ws.getColumn(i + 1).width = o.width;
    if (o.date) ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy hh:mm';
    if (o.number) ws.getColumn(i + 1).numFmt = '#,##0';
  });
  for (let c = k + 1; c <= k + 3; c++) {
    ws.getColumn(c).width = 12;
    ws.getColumn(c).numFmt = '#,##0';
  }
  for (let c = k + 4; c <= k + 3 + MODELS.length; c++) {
    ws.getColumn(c).width = 12;
    ws.getColumn(c).numFmt = '#,##0';
  }
  const noteCol = ws.getColumn(k + 4 + MODELS.length);
  noteCol.width = 60;
  noteCol.alignment = { wrapText: true, vertical: 'top' };

  const ref = (c: number) => `'${name}'!$${colLetter(c)}$${total.number}`;
  return { done: rows.filter((r) => r.calls > 0).length, calls: ref(k + 1), tokensIn: ref(k + 2), tokensOut: ref(k + 3) };
}

function assumptionSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('Giả định');
  ws.addRow(['Giá model + tỷ giá — sửa ô màu vàng, các sheet khác tự tính lại']).font = { bold: true, size: 14 };
  ws.addRow([]);
  styleHeader(ws.addRow(['Model', 'Giá token vào (USD / 1 triệu)', 'Giá token ra (USD / 1 triệu)', 'Nhận xét']));
  for (const m of MODELS) ws.addRow([`Claude ${m.name}`, m.in, m.out, m.note]); // dòng 4..12
  ws.addRow([]);
  ws.addRow(['Tỷ giá (VND / 1 USD)', 26300]); // dòng RATE_ROW
  const yellow = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFEF3C7' } };
  for (let r = FIRST_PRICE_ROW; r < FIRST_PRICE_ROW + MODELS.length; r++) {
    ws.getCell(`B${r}`).fill = yellow;
    ws.getCell(`C${r}`).fill = yellow;
    ws.getCell(`B${r}`).numFmt = ws.getCell(`C${r}`).numFmt = '$#,##0.00';
  }
  ws.getCell(`B${RATE_ROW}`).fill = yellow;
  ws.getCell(`B${RATE_ROW}`).numFmt = '#,##0';
  ws.addRow([]);
  const notes = [
    'Cách ước tính (tham khảo, cố gắng sát thực tế):',
    '• Giá theo bảng giá Anthropic API (cập nhật 06/10/2026), gọi API thường — KHÔNG dùng Batch.',
    '• Token VÀO: dựng lại đúng prompt của từng yêu cầu (lời dặn + nội dung slide / bài / tài liệu + khuôn JSON) bằng code của server, cộng ~200 token khung API mỗi lần gọi.',
    '• Token RA: đo từ kết quả đã lưu (bài nhập từ PPT, bản dịch, đề), nhân thêm phần suy nghĩ (thinking, tính tiền như token ra):',
    `     – Nhập PowerPoint ×${THINKING.import}  (làm theo mẫu, ít phải nghĩ)`,
    `     – Dịch bài ×${THINKING.translate}  (dịch sát, ít phải nghĩ)`,
    `     – Tạo đề ×${THINKING.quiz}  (phải kiểm đáp án, nghĩ phương án nhiễu, chọn nguồn)`,
    '• Đếm token theo ký tự: ASCII ~3,5 ký tự/token, chữ Việt có dấu ~1 token/ký tự (câu tiếng Việt ~2,4 ký tự/token), kana/kanji ~0,85 token/ký tự. Sai số ±30%.',
    '• Model đời mới (Opus 4.7 trở lên, Fable) dùng bộ đếm token mới, có thể ra nhiều token hơn đời cũ tới ~1,35 lần với cùng nội dung — bảng chưa tính chênh lệch này.',
    '• Dịch bài: chỉ thấy lần dịch toàn bài gần nhất; các lần dịch lại từng đoạn khi sửa bài không được lưu → chi phí thật có thể cao hơn một chút.',
    '• Việc bị hủy / đang chờ: 0đ. Việc lỗi: vẫn tính (có thể đã gọi Claude trước khi lỗi).',
    '• Con số "tương đương ~$" trong log worker (Claude Code) không khớp giá API nên KHÔNG dùng ở đây.',
    `• Lập lúc: ${new Date().toLocaleString('vi-VN')}`,
  ];
  for (const n of notes) ws.addRow([n]);
  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 24;
  ws.getColumn(3).width = 24;
  ws.getColumn(4).width = 50;
}

// ---------- Chạy ----------
const outFile = path.resolve(process.argv[2] ?? path.join('..', 'reports', `chi-phi-claude-${new Date().toISOString().slice(0, 10)}.xlsx`));

await connectDb();
try {
  const [imports, translations, quizzes] = [await importRows(), await translationRows(), await quizRows()];

  const wb = new ExcelJS.Workbook();
  wb.calcProperties.fullCalcOnLoad = true; // Excel tự tính công thức khi mở
  const summary = wb.addWorksheet('Tổng hợp');

  const sImport = detailSheet(
    wb,
    'Nhập PowerPoint',
    'Nhập bài từ PowerPoint — từng file đã gửi',
    [
      { header: 'Mã việc', width: 8 },
      { header: 'Tên file', width: 42 },
      { header: 'Số slide', width: 8 },
      { header: 'Số ký tự nội dung slide', width: 12, number: true },
      { header: 'Dịch sang', width: 8 },
      { header: 'Trạng thái', width: 10 },
      { header: 'Ngày gửi (UTC)', width: 16, date: true },
    ],
    imports,
  );
  const sTranslate = detailSheet(
    wb,
    'Dịch bài',
    'Dịch tài liệu — mỗi dòng là một bài × một ngôn ngữ',
    [
      { header: 'Mã bài', width: 8 },
      { header: 'Tên bài', width: 46 },
      { header: 'Ngôn ngữ', width: 9 },
      { header: 'Số ký tự cần dịch', width: 11, number: true },
      { header: 'Phiên bản đã dịch', width: 9 },
      { header: 'Cập nhật (UTC)', width: 16, date: true },
    ],
    translations,
  );
  const sQuiz = detailSheet(
    wb,
    'Tạo đề',
    'Tạo đề trắc nghiệm — từng yêu cầu',
    [
      { header: 'Mã việc', width: 8 },
      { header: 'Tài liệu nguồn', width: 46 },
      { header: 'Số ký tự tài liệu gửi kèm', width: 12, number: true },
      { header: 'Số câu', width: 7 },
      { header: 'Ngôn ngữ', width: 8 },
      { header: 'Trạng thái', width: 10 },
      { header: 'Ngày gửi (UTC)', width: 16, date: true },
    ],
    quizzes,
  );
  assumptionSheet(wb);

  // ----- Sheet Tổng hợp -----
  summary.addRow(['Chi phí ước tính nếu chạy các yêu cầu đã làm qua Claude API (không Batch)']).font = { bold: true, size: 14 };
  summary.addRow(['Chi tiết từng yêu cầu ở các sheet bên cạnh; giá, tỷ giá và cách ước tính ở sheet "Giả định".']).font = {
    italic: true,
    color: { argb: 'FF64748B' },
  };
  summary.addRow([]);

  // Bảng A: khối lượng + token theo loại việc (dòng 5..7, tổng dòng 8)
  summary.addRow(['A. KHỐI LƯỢNG ĐÃ LÀM']).font = { bold: true };
  styleHeader(summary.addRow(['Loại việc', 'Số yêu cầu đã gọi Claude', 'Số lần gọi', 'Token vào', 'Token ra']));
  const types: [string, typeof sImport][] = [
    ['Nhập PowerPoint', sImport],
    ['Dịch bài', sTranslate],
    ['Tạo đề', sQuiz],
  ];
  const typeRow: number[] = [];
  for (const [label, s] of types) {
    const r = summary.addRow([label, s.done, { formula: s.calls }, { formula: s.tokensIn }, { formula: s.tokensOut }]);
    typeRow.push(r.number);
  }
  const tA = summary.addRow(['TỔNG', ...['B', 'C', 'D', 'E'].map((c) => ({ formula: `SUM(${c}${typeRow[0]}:${c}${typeRow[2]})` }))]);
  tA.font = { bold: true };
  summary.addRow([]);

  // Bảng B: chi phí theo model (mỗi dòng một model)
  summary.addRow(['B. CHI PHÍ THEO MODEL (VND) — chọn MỘT model, đọc MỘT dòng']).font = { bold: true };
  styleHeader(summary.addRow(['Model', 'Nhập PowerPoint', 'Dịch bài', 'Tạo đề', 'TỔNG (VND)', 'TỔNG (USD)', 'Nhận xét']));
  MODELS.forEach((m, i) => {
    const cells = typeRow.map((tr) => ({ formula: vnd(`$D$${tr}`, `$E$${tr}`, i) }));
    const r = summary.addRow([`Claude ${m.name}`, ...cells, null, { formula: usd(`$D$${tA.number}`, `$E$${tA.number}`, i) }, m.note]);
    r.getCell(5).value = { formula: `SUM(B${r.number}:D${r.number})` };
    r.getCell(5).font = { bold: true };
    if (m.name === 'Sonnet 5.5' || m.name === 'Haiku 5.5' || m.name === 'Opus 5.5') r.getCell(1).font = { bold: true };
  });

  summary.getColumn(1).width = 22;
  for (let c = 2; c <= 5; c++) {
    summary.getColumn(c).width = 16;
    summary.getColumn(c).numFmt = '#,##0';
  }
  summary.getColumn(6).width = 12;
  summary.getColumn(6).numFmt = '$#,##0.00';
  summary.getColumn(7).width = 46;

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await wb.xlsx.writeFile(outFile);

  // In tóm tắt ra màn hình.
  const sum = (rs: Row[]) => [rs.reduce((s, r) => s + r.tokensIn, 0), rs.reduce((s, r) => s + r.tokensOut, 0)];
  const groups: [string, Row[]][] = [
    ['Nhập PowerPoint', imports],
    ['Dịch bài', translations],
    ['Tạo đề', quizzes],
  ];
  for (const [label, rs] of groups) {
    const [tin, tout] = sum(rs);
    console.log(`📊 ${label}: ${rs.filter((r) => r.calls).length} yêu cầu, ${rs.reduce((s, r) => s + r.calls, 0)} lần gọi, vào ~${tin.toLocaleString('vi-VN')}, ra ~${tout.toLocaleString('vi-VN')}`);
  }
  const [tin, tout] = sum([...imports, ...translations, ...quizzes]);
  for (const m of MODELS) {
    const cost = (tin * m.in + tout * m.out) / 1e6;
    console.log(`   ${m.name.padEnd(11)} ~$${cost.toFixed(2).padStart(6)}  (~${Math.round(cost * 26300).toLocaleString('vi-VN')} đ)`);
  }
  console.log(`✅ Đã ghi ${outFile}`);
} finally {
  await closeDb();
}
