// ============================================================
// routes/engagement.ts — Lượt xem 👁 + thả tim ❤
// ============================================================
//   POST /api/engagement/:docId/view        ghi một lượt xem (mỗi người / khách 1 lần mỗi ngày)
//   PUT  /api/engagement/:docId/like        { liked } thả / bỏ tim -> { liked, likes }   đã đăng nhập
//   GET  /api/engagement/favorites          "Bài tôi yêu thích"                         đã đăng nhập
//   GET  /api/engagement/trending           xem nhiều 7 ngày qua (trang chủ)            ai cũng xem
//   GET  /api/engagement/report?from&to     top bài xem / thích nhiều                   admin
//   GET  /api/engagement/report.xlsx?from&to   xuất Excel                               admin
//
// Ai đọc được bài (đã xuất bản / editor, đúng bộ phận) mới xem / tim được bài đó.

import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser, isEditor, requireAdmin, requireAuth } from '../middleware/auth.ts';
import { findDocumentById, listDocuments, type FullDocument } from '../repositories/documents.ts';
import { engagementReport, isLiked, likedDocIds, localDate, recordView, setLike, statsFor, topViewed } from '../repositories/engagement.ts';
import { translatedTitles } from '../repositories/translations.ts';
import { assertDocVisible, requestScope } from '../services/access.ts';
import { parseId } from '../utils/ids.ts';

export const engagementRouter = Router();

async function readableDoc(id: unknown, res: Response): Promise<FullDocument> {
  const doc = await findDocumentById(parseId(id));
  if (!doc || (!isEditor(res.locals.user) && doc.status !== 'published')) throw new HttpError(404, 'Không tìm thấy tài liệu');
  await assertDocVisible(doc, res);
  return doc;
}

// Người đã đăng nhập: theo tài khoản. Khách: băm một chiều IP + trình duyệt
// (KHÔNG lưu IP gốc; khác máy / khác trình duyệt thì đếm là người khác — chấp nhận được).
function viewerKey(req: Request, res: Response): string {
  const user = res.locals.user;
  if (user) return `u:${user.id}`;
  const hash = createHash('sha256').update(`${req.ip ?? ''}|${req.get('user-agent') ?? ''}`).digest('hex');
  return `g:${hash.slice(0, 40)}`;
}

engagementRouter.post('/:docId/view', async (req, res) => {
  const doc = await readableDoc(req.params.docId, res);
  await recordView(Number(doc.id), viewerKey(req, res));
  res.status(204).end();
});

engagementRouter.put('/:docId/like', requireAuth, async (req, res) => {
  const doc = await readableDoc(req.params.docId, res);
  const { liked } = z.object({ liked: z.boolean() }).parse(req.body ?? {});
  await setLike(currentUser(res).id, Number(doc.id), liked);
  const stats = (await statsFor([Number(doc.id)])).get(Number(doc.id))!;
  res.json({ liked, likes: stats.likes });
});

// Lấy đúng các bài `ids` mà người đang xem đọc được (đã xuất bản / editor, đúng bộ phận),
// giữ nguyên thứ tự của `ids`, kèm tiêu đề dịch (?lang) + lượt xem / tim như thẻ ở trang chủ.
async function cardsFor(ids: number[], req: Request, res: Response, publishedOnly = false) {
  if (!ids.length) return [];
  const scope = await requestScope(res);
  const docs = await listDocuments({
    ids,
    status: publishedOnly || !isEditor(res.locals.user) ? 'published' : undefined,
    categoryIds: scope.all ? undefined : [...scope.categoryIds],
  });
  const docIds = docs.map((d) => Number(d.id));
  const { lang } = req.query;
  const [stats, titles] = await Promise.all([
    statsFor(docIds),
    typeof lang === 'string' && /^(vi|en|ja)$/.test(lang) ? translatedTitles(lang, docIds) : new Map<string, { title: string; desc: string }>(),
  ]);
  const order = new Map(ids.map((id, i) => [String(id), i]));
  return docs
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((d) => ({ ...d, translated: titles.get(d.id) ?? null, stats: stats.get(Number(d.id)) }));
}

// Bài tôi yêu thích, mới thả trước.
engagementRouter.get('/favorites', requireAuth, async (req, res) => {
  res.json(await cardsFor(await likedDocIds(currentUser(res).id), req, res));
});

// Xem nhiều 7 ngày qua (khu "Nổi bật" ở trang chủ): tối đa 5 bài đã xuất bản.
// Lấy dư 30 bài rồi mới lọc quyền, vì nhiều bài top có thể thuộc bộ phận khác.
const TRENDING_DAYS = 7;
engagementRouter.get('/trending', async (req, res) => {
  const top = await topViewed(localDate(new Date(Date.now() - (TRENDING_DAYS - 1) * 24 * 3600_000)), 30);
  const recentViews = new Map(top.map((t) => [String(t.id), t.views]));
  const cards = await cardsFor(top.map((t) => t.id), req, res, true);
  res.json(cards.slice(0, 5).map((d) => ({ ...d, recentViews: recentViews.get(d.id) ?? 0 })));
});

// ---------- Admin: thống kê ----------

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
function parseRange(req: Request) {
  const today = localDate();
  const monthAgo = localDate(new Date(Date.now() - 29 * 24 * 3600_000));
  const { from, to } = z
    .object({ from: dateSchema.default(monthAgo), to: dateSchema.default(today) })
    .parse({ from: req.query.from || undefined, to: req.query.to || undefined });
  if (from > to) throw new HttpError(400, 'Ngày bắt đầu phải trước ngày kết thúc');
  return { from, to };
}

engagementRouter.get('/report', requireAdmin, async (req, res) => {
  const { from, to } = parseRange(req);
  res.json({ from, to, rows: await engagementReport(from, to) });
});

engagementRouter.get('/report.xlsx', requireAdmin, async (req, res) => {
  const { from, to } = parseRange(req);
  const rows = await engagementReport(from, to);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Thống kê');
  ws.addRow([`Thống kê tài liệu ${from} → ${to}`]).font = { bold: true, size: 14 };
  ws.addRow(['Lượt xem: mỗi người (hoặc khách) tính tối đa 1 lần / bài / ngày']);
  ws.addRow([]);
  const header = ws.addRow(['STT', 'Tài liệu', 'Thể loại', 'Trạng thái', 'Lượt xem', 'Số người xem', 'Tim trong kỳ', 'Tổng tim']);
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });
  rows.forEach((r, i) => {
    ws.addRow([i + 1, r.title, r.category ?? '', r.status === 'published' ? 'Đã xuất bản' : 'Nháp', r.views, r.viewers, r.likes, r.totalLikes]);
  });
  [6, 48, 22, 13, 11, 13, 12, 10].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const filename = `thong-ke-tai-lieu-${from}-${to}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
});

// Dùng ở routes/documents.ts: kèm số liệu vào trang đọc.
export async function docEngagement(docId: number, res: Response) {
  const stats = (await statsFor([docId])).get(docId)!;
  const user = res.locals.user;
  return { ...stats, likedByMe: user ? await isLiked(user.id, docId) : false };
}
