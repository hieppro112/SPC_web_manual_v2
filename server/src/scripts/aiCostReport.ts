// ============================================================
// scripts/aiCostReport.ts — Ước tính chi phí NẾU các việc của quiz-worker chạy qua Claude API
// ============================================================
//   npm run ai-cost-report                 -> ../reports/chi-phi-claude-<ngày>.xlsx
//   npm run ai-cost-report -- <đường dẫn>  -> ghi ra file chỉ định
//
// Worker chạy bằng Claude Code (gói Team) nên KHÔNG có hóa đơn theo token. Script
// này dựng lại đúng prompt worker đã gửi cho từng việc trong DB rồi đếm token:
//   - Token VÀO: dựng lại prompt bằng chính hàm server dùng (buildImportParts,
//     planParts, prepareQuizPrompt) -> sát thực tế.
//   - Token RA: đo từ kết quả đã lưu (bài tạo ra, bản dịch, đề) + 25% cho thinking.
// Số token là ƯỚC TÍNH theo số ký tự (xem estTokens). Giá và tỷ giá nằm ở sheet
// "Giả định" — sửa ở đó là mọi cột tiền tự tính lại.
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

const CALL_OVERHEAD = 500; // phần Claude Code tự thêm mỗi lần gọi (khuôn JSON dạng tool, lời dặn hệ thống)
const THINKING = 1.25; // token ra cộng thêm ~25% cho phần suy nghĩ (tính tiền như token ra)

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
    const cells = [j.Id, j.FileName, j.SlideCount, j.Language, STATUS[j.Status] ?? j.Status, j.CreatedAt];
    if (!billable(j.Status)) {
      rows.push({ cells, calls: 0, tokensIn: 0, tokensOut: 0, note: 'Chưa gọi Claude' });
      continue;
    }
    const parts = buildImportParts(JSON.parse(j.Payload) as ImportPayload, j.Language);
    const tokensIn = parts.reduce((s, p) => s + promptTokens(p), 0);
    const doc = j.DocumentId ? await findDocumentById(j.DocumentId) : null;
    let tokensOut: number;
    let note = j.Status === 'failed' ? 'Lỗi: có thể đã tốn một phần (ước tính tối đa). ' : '';
    if (doc?.blocks) {
      tokensOut = Math.round(blocksOutputTokens(doc.blocks) * THINKING);
      note += 'Token ra đo từ bài đã tạo (bài có thể đã được sửa sau đó).';
    } else {
      // Không còn bài -> giả định đầu ra dài bằng phần nội dung slide.
      tokensOut = Math.round((tokensIn - parts.length * CALL_OVERHEAD) * 0.9 * THINKING);
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
    const cells = [t.DocumentId, doc.title, `${t.SourceLang} → ${t.Lang}`, t.SourceVersion, t.UpdatedAt];

    // Dựng lại việc "dịch cả bài" sang đúng ngôn ngữ này bằng chính hàm của server.
    const source = { id: t.DocumentId, version: doc.version, title: doc.title, blocks: doc.blocks ?? [] };
    const parts = planParts(planTranslation(source, [], true), config.translate.maxCharsPerPart).filter((p) => p.lang === t.Lang);
    const tokensIn = parts.reduce((s, p) => s + promptTokens(p), 0);

    // Token ra: chữ đã dịch, đúng khuôn { items: [{ id, texts: [{ key, text }] }] }.
    const translated = JSON.parse(t.Blocks) as ParsedBlock[];
    const items = [
      { id: TITLE_KEY, texts: [{ key: 'title', text: t.Title }] },
      ...translated.map((b) => ({ id: b.id, texts: Object.entries(extractTexts(b)).map(([key, text]) => ({ key, text })) })),
    ].filter((i) => i.texts.length);
    const tokensOut = Math.round(estTokens(JSON.stringify({ items })) * THINKING);

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
    const cells = [j.Id, sourceDocs.map((d) => d.title).join('; '), j.QuestionCount, j.Language, STATUS[j.Status] ?? j.Status, j.CreatedAt];
    if (!billable(j.Status)) {
      rows.push({ cells, calls: 0, tokensIn: 0, tokensOut: 0, note: 'Chưa gọi Claude' });
      continue;
    }
    const notes: string[] = j.Status === 'failed' ? ['Lỗi: có thể đã tốn một phần (ước tính tối đa).'] : [];

    let tokensIn: number;
    try {
      const p = await prepareQuizPrompt(sourceDocs.map((d) => Number(d.id)), j.QuestionCount, j.Language as QuizLang, config.quiz.claudeMaxChars);
      tokensIn = promptTokens({ system: p.system, prompt: p.user, schema: p.schema });
    } catch {
      // Tài liệu nguồn đã bị xóa / về nháp -> dựng tay từ những bài còn lại.
      const perDoc = Math.floor(config.quiz.claudeMaxChars / Math.max(1, sourceDocs.length));
      let material = '';
      for (const d of sourceDocs) {
        const doc = await findDocumentById(Number(d.id));
        if (doc) material += docMarkdown(doc).slice(0, perDoc);
      }
      tokensIn = estTokens(material) + 450 + CALL_OVERHEAD;
      notes.push('Có tài liệu nguồn đã xóa / về nháp: token vào chỉ tính phần còn lại.');
    }

    const quiz = j.QuizId ? await queryOne<{ Questions: string }>('SELECT Questions FROM WebManualQuizzes WHERE Id = @id', { id: j.QuizId }) : null;
    let tokensOut: number;
    if (quiz) {
      tokensOut = Math.round(estTokens(quiz.Questions) * THINKING);
      notes.push('Token ra đo từ đề đã lưu.');
    } else {
      tokensOut = Math.round(j.QuestionCount * 150 * THINKING);
      notes.push('Không còn đề: token ra ước ~150 token / câu.');
    }
    rows.push({ cells, calls: 1, tokensIn, tokensOut, note: notes.join(' ') });
  }
  return rows;
}

// ---------- Ghi Excel ----------
const ASSUME = "'Giả định'";
const PRICE = { opus: 4, sonnet: 5, haiku: 6 }; // dòng của từng model trong sheet "Giả định"
const RATE = `${ASSUME}!$B$9`;
const BATCH = `${ASSUME}!$B$10`;
const MODELS = ['opus', 'sonnet', 'haiku'] as const;
const MODEL_NAMES = { opus: 'Opus 5.5', sonnet: 'Sonnet 5.5', haiku: 'Haiku 5.5' };

const usd = (inCell: string, outCell: string, m: keyof typeof PRICE) =>
  `(${inCell}*${ASSUME}!$B$${PRICE[m]}+${outCell}*${ASSUME}!$C$${PRICE[m]})/1000000`;

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

// Trả về địa chỉ các ô tổng (để sheet Tổng hợp tham chiếu).
function detailSheet(wb: ExcelJS.Workbook, name: string, title: string, own: { header: string; width: number; date?: boolean }[], rows: Row[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow(['Token là ước tính. Giá / tỷ giá lấy từ sheet "Giả định".']).font = { italic: true, color: { argb: 'FF64748B' } };
  const tail = [
    'Số lần gọi Claude',
    'Token vào',
    'Token ra (gồm thinking)',
    ...MODELS.map((m) => `${MODEL_NAMES[m]} (USD)`),
    ...MODELS.map((m) => `${MODEL_NAMES[m]} (VND)`),
    'Ghi chú',
  ];
  styleHeader(ws.addRow([...own.map((o) => o.header), ...tail]));

  const k = own.length; // số cột riêng
  const cCalls = colLetter(k + 1);
  const cIn = colLetter(k + 2);
  const cOut = colLetter(k + 3);
  const first = 4;
  rows.forEach((r, i) => {
    const n = first + i;
    const usdCols = MODELS.map((m) => ({ formula: usd(`${cIn}${n}`, `${cOut}${n}`, m) }));
    const vndCols = MODELS.map((_, mi) => ({ formula: `${colLetter(k + 4 + mi)}${n}*${RATE}` }));
    ws.addRow([...r.cells, r.calls, r.tokensIn, r.tokensOut, ...usdCols, ...vndCols, r.note]);
  });
  const last = first + rows.length - 1;
  const total = ws.addRow(['TỔNG']);
  const t = total.number;
  for (let c = k + 1; c <= k + 9; c++) {
    const L = colLetter(c);
    total.getCell(c).value = rows.length ? { formula: `SUM(${L}${first}:${L}${last})` } : 0;
  }
  total.font = { bold: true };

  // Định dạng cột
  own.forEach((o, i) => {
    ws.getColumn(i + 1).width = o.width;
    if (o.date) ws.getColumn(i + 1).numFmt = 'dd/mm/yyyy hh:mm';
  });
  [k + 1, k + 2, k + 3].forEach((c) => {
    ws.getColumn(c).width = 13;
    ws.getColumn(c).numFmt = '#,##0';
  });
  for (let c = k + 4; c <= k + 6; c++) {
    ws.getColumn(c).width = 13;
    ws.getColumn(c).numFmt = '$#,##0.000';
  }
  for (let c = k + 7; c <= k + 9; c++) {
    ws.getColumn(c).width = 14;
    ws.getColumn(c).numFmt = '#,##0" đ"';
  }
  ws.getColumn(k + 10).width = 60;
  ws.getColumn(k + 10).alignment = { wrapText: true, vertical: 'top' };

  const ref = (c: number) => `'${name}'!$${colLetter(c)}$${t}`;
  return {
    done: rows.filter((r) => r.calls > 0).length,
    calls: ref(k + 1),
    tokensIn: ref(k + 2),
    tokensOut: ref(k + 3),
  };
}

function assumptionSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('Giả định');
  ws.addRow(['Giả định dùng để tính tiền — sửa ô màu vàng, các sheet khác tự tính lại']).font = { bold: true, size: 14 };
  ws.addRow([]);
  styleHeader(ws.addRow(['Model', 'Giá token vào (USD / 1 triệu)', 'Giá token ra (USD / 1 triệu)']));
  ws.addRow(['Claude Opus 5.5', 4, 20]); // dòng 4
  ws.addRow(['Claude Sonnet 5.5', 2, 10]); // dòng 5
  ws.addRow(['Claude Haiku 5.5', 0.1, 0.5]); // dòng 6
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow(['Tỷ giá (VND / 1 USD)', 26300]); // dòng 9
  ws.addRow(['Giảm giá Batch API', 0.5]); // dòng 10
  ws.getCell('B10').numFmt = '0%';
  ws.getCell('B9').numFmt = '#,##0';
  for (const addr of ['B4', 'C4', 'B5', 'C5', 'B6', 'C6', 'B9', 'B10']) {
    ws.getCell(addr).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  }
  ws.addRow([]);
  const notes = [
    'Cách tính:',
    '• Worker chạy bằng Claude Code (gói Team) nên không có hóa đơn theo token. Đây là số ƯỚC TÍNH nếu cùng khối lượng việc chạy qua Claude API.',
    '• Token vào: dựng lại đúng prompt worker đã gửi (lời dặn + nội dung + khuôn JSON) bằng chính code của server, cộng ~500 token mỗi lần gọi cho phần Claude Code tự thêm.',
    '• Token ra: đo từ kết quả đã lưu (bài nhập từ PowerPoint, bản dịch, đề) rồi cộng 25% cho phần suy nghĩ (thinking, tính tiền như token ra).',
    '• Đếm token theo số ký tự: ASCII ~3,5 ký tự/token, chữ Việt có dấu ~1 token/ký tự (cả câu tiếng Việt ~2,4 ký tự/token), kana/kanji ~0,85 token/ký tự. Sai số có thể ±30%.',
    '• Dịch bài: chỉ thấy lần dịch toàn bài gần nhất. Các lần dịch lại từng đoạn khi sửa bài không được lưu nên KHÔNG có trong số liệu → chi phí thật có thể cao hơn.',
    '• Việc bị lỗi vẫn được tính (có thể đã gọi Claude trước khi lỗi) → con số là mức tối đa.',
    '• Haiku 5.5: prompt trên 100.000 token có giá $0.50 / $2.50 — chưa áp dụng trong bảng (hiếm gặp).',
    '• Claude Code in số "tương đương ~$..." sau mỗi lần gọi: số đó chính xác hơn bảng này nhưng hiện chưa được lưu lại.',
    `• Lập lúc: ${new Date().toLocaleString('vi-VN')}`,
  ];
  for (const n of notes) ws.addRow([n]).alignment = { wrapText: false };
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 26;
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
    'Nhập bài từ PowerPoint',
    [
      { header: 'Mã việc', width: 9 },
      { header: 'Tên file', width: 45 },
      { header: 'Số slide', width: 9 },
      { header: 'Dịch sang', width: 10 },
      { header: 'Trạng thái', width: 11 },
      { header: 'Ngày gửi (UTC)', width: 17, date: true },
    ],
    imports,
  );
  const sTranslate = detailSheet(
    wb,
    'Dịch bài',
    'Dịch tài liệu sang ngôn ngữ khác',
    [
      { header: 'Mã bài', width: 9 },
      { header: 'Tên bài', width: 50 },
      { header: 'Ngôn ngữ', width: 10 },
      { header: 'Phiên bản đã dịch', width: 10 },
      { header: 'Cập nhật (UTC)', width: 17, date: true },
    ],
    translations,
  );
  const sQuiz = detailSheet(
    wb,
    'Tạo đề',
    'Tạo đề trắc nghiệm',
    [
      { header: 'Mã việc', width: 9 },
      { header: 'Tài liệu nguồn', width: 50 },
      { header: 'Số câu', width: 8 },
      { header: 'Ngôn ngữ', width: 10 },
      { header: 'Trạng thái', width: 11 },
      { header: 'Ngày gửi (UTC)', width: 17, date: true },
    ],
    quizzes,
  );
  assumptionSheet(wb);

  // Sheet Tổng hợp: chỉ chứa công thức trỏ về ô TỔNG của từng sheet.
  summary.addRow(['Chi phí ước tính nếu chạy qua Claude API']).font = { bold: true, size: 14 };
  summary.addRow(['Chi tiết từng việc ở các sheet bên cạnh; giá, tỷ giá và cách tính ở sheet "Giả định".']).font = { italic: true, color: { argb: 'FF64748B' } };
  styleHeader(
    summary.addRow([
      'Loại việc',
      'Số việc đã gọi Claude',
      'Số lần gọi',
      'Token vào',
      'Token ra',
      ...MODELS.map((m) => `${MODEL_NAMES[m]} (USD)`),
      ...MODELS.map((m) => `${MODEL_NAMES[m]} (VND)`),
    ]),
  );
  const items: [string, typeof sImport][] = [
    ['Nhập PowerPoint', sImport],
    ['Dịch bài', sTranslate],
    ['Tạo đề', sQuiz],
  ];
  items.forEach(([label, s], i) => {
    const n = 4 + i;
    summary.addRow([
      label,
      s.done,
      { formula: s.calls },
      { formula: s.tokensIn },
      { formula: s.tokensOut },
      ...MODELS.map((m) => ({ formula: usd(`D${n}`, `E${n}`, m) })),
      ...['F', 'G', 'H'].map((c) => ({ formula: `${c}${n}*${RATE}` })),
    ]);
  });
  const total = summary.addRow([
    'TỔNG',
    ...['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map((c) => ({ formula: `SUM(${c}4:${c}6)` })),
  ]);
  total.font = { bold: true };
  const batch = summary.addRow([
    'Nếu dùng Batch API',
    '',
    '',
    '',
    '',
    ...['F', 'G', 'H', 'I', 'J', 'K'].map((c) => ({ formula: `${c}${total.number}*(1-${BATCH})` })),
  ]);
  batch.font = { italic: true };

  summary.getColumn(1).width = 20;
  for (let c = 2; c <= 5; c++) {
    summary.getColumn(c).width = 13;
    summary.getColumn(c).numFmt = '#,##0';
  }
  for (let c = 6; c <= 8; c++) {
    summary.getColumn(c).width = 14;
    summary.getColumn(c).numFmt = '$#,##0.00';
  }
  for (let c = 9; c <= 11; c++) {
    summary.getColumn(c).width = 15;
    summary.getColumn(c).numFmt = '#,##0" đ"';
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await wb.xlsx.writeFile(outFile);

  // In tóm tắt ra màn hình (giá Opus / Sonnet / Haiku mặc định, tỷ giá 26.300).
  const all = [...imports, ...translations, ...quizzes];
  const tin = all.reduce((s, r) => s + r.tokensIn, 0);
  const tout = all.reduce((s, r) => s + r.tokensOut, 0);
  console.log(`📊 Nhập PowerPoint: ${imports.length} việc | Dịch bài: ${translations.length} bản dịch | Tạo đề: ${quizzes.length} việc`);
  console.log(`   Token vào ~${tin.toLocaleString('vi-VN')} | token ra ~${tout.toLocaleString('vi-VN')}`);
  for (const [m, pi, po] of [['Opus 5.5', 4, 20], ['Sonnet 5.5', 2, 10], ['Haiku 5.5', 0.1, 0.5]] as const) {
    const cost = (tin * pi + tout * po) / 1e6;
    console.log(`   ${m}: ~$${cost.toFixed(2)} (~${Math.round(cost * 26300).toLocaleString('vi-VN')} đ)`);
  }
  console.log(`✅ Đã ghi ${outFile}`);
} finally {
  await closeDb();
}
