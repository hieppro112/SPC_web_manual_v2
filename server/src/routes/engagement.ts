// ============================================================
// routes/engagement.ts — Lượt xem 👁 + thả tim ❤
// ============================================================
//   POST /api/engagement/:docId/view        ghi một lượt xem (mỗi người / khách 1 lần mỗi ngày)
//   PUT  /api/engagement/:docId/like        { liked } thả / bỏ tim -> { liked, likes }   đã đăng nhập
//   GET  /api/engagement/favorites          "Bài tôi yêu thích"                         đã đăng nhập
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
import { engagementReport, isLiked, likedDocIds, localDate, recordView, setLike, statsFor } from '../repositories/engagement.ts';
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

// Bài tôi yêu thích: chỉ bài còn đọc được (đã xuất bản / editor, đúng bộ phận), giữ thứ tự mới thả trước.
engagementRouter.get('/favorites', requireAuth, async (_req, res) => {
  const ids = await likedDocIds(currentUser(res).id);
  if (!ids.length) {
    res.json([]);
    return;
  }
  const scope = await requestScope(res);
  const docs = await listDocuments({
    ids,
    status: isEditor(res.locals.user) ? undefined : 'published',
    categoryIds: scope.all ? undefined : [...scope.categoryIds],
  });
  const stats = await statsFor(docs.map((d) => Number(d.id)));
  const order = new Map(ids.map((id, i) => [String(id), i]));
  res.json(
    docs
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((d) => ({ ...d, stats: stats.get(Number(d.id)) })),
  );
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
