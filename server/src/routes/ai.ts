// ============================================================
// routes/ai.ts — Trợ lý AI chạy local (LM Studio / Ollama)
// ============================================================
//   GET  /api/ai/status     -> { enabled, indexedDocs, guestLimit, remaining }
//   POST /api/ai/chat       { mode, question, slug?, lang, history } -> stream NDJSON:
//          {"type":"meta","sources":[...],"remaining":9}
//          {"type":"delta","text":"Để cài..."}      (nhiều dòng, từng mẩu chữ)
//          {"type":"done"}  hoặc  {"type":"error","message":"..."}
//   GET  /api/ai/documents  (header x-api-key) -> toàn bộ bài đã xuất bản dạng Markdown,
//                            cho công cụ AI khác đọc. ?since=2026-10-01 chỉ lấy bài sửa từ ngày đó.
//
// mode: 'all' = hỏi trên toàn bộ tài liệu, 'doc' = hỏi về bài đang đọc,
//       'summary' = tóm tắt bài đang đọc.
// Khách và role "user": tối đa config.ai.guestLimitPerHour câu / giờ (khách theo IP,
// "user" theo tài khoản). Editor / admin không giới hạn.

import { timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.ts';
import { isEditor } from '../middleware/auth.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { docIdsInCategories, findDocumentById, findDocumentBySlug, listPublishedStamps } from '../repositories/documents.ts';
import { assertDocVisible, requestScope } from '../services/access.ts';
import { writeChatLog } from '../services/ai/chatLog.ts';
import { docMarkdown } from '../services/ai/docText.ts';
import { AiUnavailableError, chatStream, type ChatMessage } from '../services/ai/llm.ts';
import { SYSTEM_ALL, SYSTEM_DOC, excerptsBlock, summaryRequest } from '../services/ai/prompts.ts';
import { remainingFor, takeGuestQuota } from '../services/ai/rateLimit.ts';
import { indexedDocCount, searchChunks } from '../services/ai/searchIndex.ts';

export const aiRouter = Router();

// Bài quá dài thì cắt bớt để vừa ngữ cảnh của model. Tiếng Việt/Nhật tốn
// token hơn tiếng Anh -> tính an toàn ~2 ký tự / token, chừa chỗ cho câu trả lời.
const MAX_DOC_CHARS = Math.max(4000, Math.floor(config.ai.numCtx * 1.6));
const UNAVAILABLE = 'Trợ lý AI đang không hoạt động. Vui lòng thử lại sau hoặc báo quản trị viên.';

function assertEnabled() {
  if (!config.ai.baseUrl) throw new HttpError(404, 'Trợ lý AI chưa được bật');
}

// Khách và role "user" bị giới hạn số câu/giờ; editor/admin không giới hạn.
// Khách đếm theo IP, người đã đăng nhập đếm theo tài khoản.
function quotaKey(req: Request, res: Response): string | null {
  const user = res.locals.user;
  if (isEditor(user)) return null;
  return user ? `user:${user.id}` : `ip:${req.ip ?? ''}`;
}

aiRouter.get('/status', (req, res) => {
  const key = quotaKey(req, res);
  res.json({
    enabled: !!config.ai.baseUrl,
    indexedDocs: indexedDocCount(),
    guestLimit: config.ai.guestLimitPerHour,
    remaining: key ? remainingFor(key) : null,
  });
});

const chatSchema = z.object({
  mode: z.enum(['all', 'doc', 'summary']),
  question: z.string().trim().max(2000, 'Câu hỏi tối đa 2000 ký tự').default(''),
  slug: z.string().max(200).optional(),
  lang: z.enum(['vi', 'en', 'ja']).default('vi'),
  // Vài lượt hỏi đáp trước để AI hiểu câu hỏi nối tiếp ("còn bước sau thì sao?").
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(8)
    .default([]),
});

type Source = { title: string; url: string; section?: string };

aiRouter.post('/chat', async (req, res) => {
  assertEnabled();
  const body = chatSchema.parse(req.body ?? {});
  if (body.mode !== 'summary' && !body.question) throw new HttpError(400, 'Hãy nhập câu hỏi');

  const user = res.locals.user;
  const ip = req.ip ?? '';
  const key = quotaKey(req, res);
  if (key) {
    const wait = takeGuestQuota(key);
    if (wait !== null) throw new HttpError(429, `Bạn đã hỏi ${config.ai.guestLimitPerHour} câu trong 1 giờ. Thử lại sau ${wait} phút.`);
  }

  // ---------- Chuẩn bị ngữ cảnh cho AI ----------
  let messages: ChatMessage[];
  let sources: Source[];
  const question = body.mode === 'summary' ? summaryRequest(body.lang) : body.question;

  try {
    if (body.mode === 'all') {
      // Tìm theo câu hỏi hiện tại + câu hỏi ngay trước (để hiểu "nó", "bước đó"...).
      const prevQuestion = body.history.filter((m) => m.role === 'user').at(-1)?.content ?? '';
      // Phân quyền theo bộ phận: AI chỉ được đọc tài liệu người hỏi được xem.
      const scope = await requestScope(res);
      const visible = scope.all ? null : await docIdsInCategories([...scope.categoryIds]);
      const chunks = await searchChunks(`${prevQuestion}\n${question}`.trim(), 6, 3, visible ? (id) => visible.has(Number(id)) : undefined);
      const seen = new Set<string>();
      sources = chunks
        .filter((c) => !seen.has(c.url) && seen.add(c.url))
        .slice(0, 5)
        .map((c) => ({ title: c.title, url: c.url, section: c.section || undefined }));
      messages = [
        { role: 'system', content: SYSTEM_ALL },
        ...body.history,
        { role: 'user', content: `${excerptsBlock(chunks)}\n\nQUESTION: ${question}` },
      ];
    } else {
      // Chỉ đọc bài ĐÃ XUẤT BẢN (kể cả người đã đăng nhập) — đúng phạm vi đã chốt.
      const doc = body.slug ? await findDocumentBySlug(body.slug) : null;
      if (!doc || doc.status !== 'published') throw new HttpError(404, 'Trợ lý AI chỉ đọc được tài liệu đã xuất bản');
      await assertDocVisible(doc, res);
      sources = [{ title: doc.title, url: `/docs/${doc.slug}` }];
      messages = [
        { role: 'system', content: SYSTEM_DOC },
        ...(body.mode === 'doc' ? body.history : []),
        { role: 'user', content: `DOCUMENT:\n${docMarkdown(doc).slice(0, MAX_DOC_CHARS)}\n\nQUESTION: ${question}` },
      ];
    }
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      console.error('❌ AI:', err.message);
      throw new HttpError(503, UNAVAILABLE);
    }
    throw err;
  }

  // ---------- Trả lời dạng stream ----------
  // NDJSON: mỗi dòng một JSON. Trình duyệt đọc được từng dòng ngay khi tới,
  // nên chữ hiện ra dần như đang gõ thay vì chờ cả câu trả lời.
  res.status(200).set({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const send = (data: object) => res.write(`${JSON.stringify(data)}\n`);
  send({ type: 'meta', sources, remaining: key ? remainingFor(key) : null });

  // Người dùng đóng khung chat / bấm Dừng -> ngắt luôn Ollama, đỡ tốn GPU.
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  const started = Date.now();
  let answer = '';
  let error: string | undefined;
  try {
    for await (const piece of chatStream(messages, controller.signal)) {
      answer += piece;
      send({ type: 'delta', text: piece });
    }
    send({ type: 'done' });
  } catch (err) {
    error = controller.signal.aborted ? 'aborted' : err instanceof Error ? err.message : String(err);
    if (!controller.signal.aborted) {
      console.error('❌ AI:', error);
      send({ type: 'error', message: UNAVAILABLE });
    }
  } finally {
    res.end();
    writeChatLog({
      time: new Date().toISOString(),
      ip,
      user: user?.username ?? null,
      mode: body.mode,
      slug: body.slug,
      question: body.mode === 'summary' ? '(tóm tắt)' : body.question,
      answer,
      sources: sources.map((s) => s.url),
      ms: Date.now() - started,
      error,
    });
  }
});

// ---------- Xuất tài liệu cho công cụ AI khác ----------

function keyMatches(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(config.ai.exportKey);
  // So sánh thời gian cố định: không lộ "đúng được mấy ký tự đầu" qua thời gian phản hồi.
  return a.length === b.length && timingSafeEqual(a, b);
}

aiRouter.get('/documents', async (req, res) => {
  if (!config.ai.exportKey) throw new HttpError(404, 'API không tồn tại');
  if (!keyMatches(req.get('x-api-key') ?? '')) throw new HttpError(401, 'Sai hoặc thiếu API key (header x-api-key)');

  const since = typeof req.query.since === 'string' ? Date.parse(req.query.since) : NaN;
  const stamps = (await listPublishedStamps()).filter((s) => Number.isNaN(since) || Date.parse(s.updatedAt) >= since);
  const documents = [];
  for (const stamp of stamps) {
    const doc = await findDocumentById(Number(stamp.id));
    if (!doc || doc.status !== 'published') continue;
    documents.push({
      id: doc.id,
      slug: doc.slug,
      title: doc.title,
      category: doc.category?.name ?? null,
      url: `/docs/${doc.slug}`,
      updatedAt: stamp.updatedAt,
      markdown: docMarkdown(doc),
    });
  }
  res.json(documents);
});
