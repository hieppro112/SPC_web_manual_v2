// ============================================================
// routes/reading.ts — Thời gian đọc tối thiểu
// ============================================================
//   GET  /api/reading/:docId            quy định + tiến độ của tôi        ai đọc được bài
//   POST /api/reading/:docId/beat       "nhịp" đọc { version, delta, reachedEnd }   người dùng
//   GET  /api/reading/report/docs       bài có quy định thời gian đọc     admin
//   GET  /api/reading/report/:docId     ai đã đọc bài này, bao lâu        admin
//   GET  /api/reading/report/:docId/xlsx   xuất Excel                      admin
//
// Chỉ quyền "Người dùng" bị đếm giờ. Editor / admin / khách: tracked = false.

import { Router, type Response } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.ts';
import { currentUser, isEditor, requireAdmin, requireAuth } from '../middleware/auth.ts';
import { findDocumentById, type FullDocument } from '../repositories/documents.ts';
import { getProgress, getRule, listRuledDocuments, readingReport, recordBeat } from '../repositories/reading.ts';
import { parseId } from '../utils/ids.ts';
import { slugify } from '../utils/slugify.ts';

export const readingRouter = Router();

async function readableDoc(id: unknown, res: Response): Promise<FullDocument> {
  const doc = await findDocumentById(parseId(id));
  if (!doc || (!isEditor(res.locals.user) && doc.status !== 'published')) throw new HttpError(404, 'Không tìm thấy tài liệu');
  return doc;
}

// ---------- Admin: báo cáo (đặt TRƯỚC '/:docId' để không bị hiểu nhầm "report" là id) ----------

readingRouter.get('/report/docs', requireAdmin, async (_req, res) => {
  res.json(await listRuledDocuments());
});

async function reportData(docId: unknown) {
  const doc = await findDocumentById(parseId(docId));
  if (!doc) throw new HttpError(404, 'Không tìm thấy tài liệu');
  const required = await getRule(Number(doc.id));
  return { doc: { id: doc.id, title: doc.title, slug: doc.slug, version: doc.version }, requiredSeconds: required, rows: await readingReport(Number(doc.id)) };
}

readingRouter.get('/report/:docId', requireAdmin, async (req, res) => {
  res.json(await reportData(req.params.docId));
});

// Excel lưu ngày giờ theo giờ "trên đồng hồ" (không có múi giờ) -> đổi sang giờ máy chủ.
const localDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

readingRouter.get('/report/:docId/xlsx', requireAdmin, async (req, res) => {
  const { doc, requiredSeconds, rows } = await reportData(req.params.docId);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Đọc tài liệu');
  ws.addRow([doc.title]).font = { bold: true, size: 14 };
  ws.addRow([`Phiên bản ${doc.version} · Thời gian đọc tối thiểu: ${requiredSeconds ? mmss(requiredSeconds) : 'không đặt'} · Chỉ tính tài khoản quyền "Người dùng"`]);
  ws.addRow([`Xuất lúc: ${localDate(new Date()).toISOString().slice(0, 16).replace('T', ' ')}`]);
  ws.addRow([]);
  const header = ws.addRow(['STT', 'Họ tên', 'Tên đăng nhập', 'Đã đọc (phút:giây)', 'Cuộn tới cuối', 'Kết quả', 'Bắt đầu đọc', 'Hoàn thành lúc']);
  header.font = { bold: true };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  });
  rows.forEach((r, i) => {
    const status = r.completedAt ? 'Đã đọc xong' : r.startedAt ? 'Đang đọc' : 'Chưa đọc';
    const row = ws.addRow([
      i + 1,
      r.displayName,
      r.username,
      r.startedAt ? mmss(r.seconds) : '',
      r.startedAt ? (r.reachedEnd ? 'Có' : 'Chưa') : '',
      status,
      r.startedAt ? localDate(new Date(r.startedAt)) : '',
      r.completedAt ? localDate(new Date(r.completedAt)) : '',
    ]);
    row.getCell(7).numFmt = 'dd/mm/yyyy hh:mm';
    row.getCell(8).numFmt = 'dd/mm/yyyy hh:mm';
    row.getCell(6).font = { color: { argb: r.completedAt ? 'FF16A34A' : r.startedAt ? 'FFD97706' : 'FF64748B' } };
  });
  [6, 24, 18, 16, 13, 13, 18, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const filename = `doc-tai-lieu-${slugify(doc.title)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
});

// ---------- Người đọc ----------

readingRouter.get('/:docId', async (req, res) => {
  const doc = await readableDoc(req.params.docId, res);
  const requiredSeconds = await getRule(Number(doc.id));
  const user = res.locals.user;
  const tracked = !!requiredSeconds && user?.role === 'user';
  res.json({
    requiredSeconds,
    version: doc.version,
    tracked,
    progress: tracked ? await getProgress(user!.id, Number(doc.id), doc.version) : null,
  });
});

const beatSchema = z.object({
  version: z.number().int().positive(),
  delta: z.number().int().min(0).max(60),
  reachedEnd: z.boolean().default(false),
});

readingRouter.post('/:docId/beat', requireAuth, async (req, res) => {
  const user = currentUser(res);
  const doc = await readableDoc(req.params.docId, res);
  const body = beatSchema.parse(req.body ?? {});
  const requiredSeconds = await getRule(Number(doc.id));
  if (user.role !== 'user' || !requiredSeconds) {
    res.json({ tracked: false });
    return;
  }
  // Bài vừa được sửa (phiên bản mới) -> trình duyệt tải lại, đếm lại từ đầu.
  if (body.version !== doc.version) throw new HttpError(409, 'Bài vừa được cập nhật, thời gian đọc được tính lại từ đầu');
  res.json({ tracked: true, progress: await recordBeat(user.id, Number(doc.id), doc.version, requiredSeconds, body.delta, body.reachedEnd) });
});
