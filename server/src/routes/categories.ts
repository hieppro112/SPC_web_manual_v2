// ============================================================
// routes/categories.ts — Mọi API của thể loại
// ============================================================
//   GET    /api/categories      danh sách + số tài liệu mỗi thể loại (ai cũng xem)
//   POST   /api/categories      tạo mới   (admin)
//   PUT    /api/categories/:id  sửa       (admin)
//   DELETE /api/categories/:id  xóa       (admin, chỉ khi không còn tài liệu)
//
// Quy ước REST: id nằm trên URL, không nằm trong body. Request DELETE có
// body thì nhiều thư viện/proxy bỏ đi.

import { Router } from 'express';
import { CategoryModel } from '../models/Category.ts';
import { DocumentModel } from '../models/Document.ts';
import { HttpError } from '../middleware/errorHandler.ts';
import { requireAdmin } from '../middleware/auth.ts';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res) => {
  const categories = await CategoryModel.find().sort({ name: 1 });

  // Đếm tài liệu theo thể loại bằng MỘT truy vấn aggregate (gom nhóm
  // ngay trong MongoDB), thay vì gọi countDocuments cho từng thể loại.
  // Khách chỉ đếm bài đã xuất bản — đúng với những gì khách nhìn thấy.
  const match = res.locals.user ? {} : { status: 'published' };
  const counts: { _id: unknown; count: number }[] = await DocumentModel.aggregate([
    { $match: match },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const countById = new Map(counts.map((c) => [String(c._id), c.count]));

  res.json(categories.map((c) => ({ ...c.toJSON(), docCount: countById.get(c.id) ?? 0 })));
});

categoriesRouter.post('/', requireAdmin, async (req, res) => {
  const { name, iconName } = req.body ?? {};
  const category = new CategoryModel({ name, iconName });
  await category.save(); // trùng tên -> lỗi 11000 -> errorHandler trả 409
  res.status(201).json(category);
});

categoriesRouter.put('/:id', requireAdmin, async (req, res) => {
  const category = await CategoryModel.findById(req.params.id);
  if (!category) throw new HttpError(404, 'Thể loại không tồn tại');

  const { name, iconName } = req.body ?? {};
  if (name !== undefined) category.name = name;
  if (iconName !== undefined) category.iconName = iconName;
  await category.save();
  res.json(category);
});

categoriesRouter.delete('/:id', requireAdmin, async (req, res) => {
  const category = await CategoryModel.findById(req.params.id);
  if (!category) throw new HttpError(404, 'Thể loại không tồn tại');

  const count = await DocumentModel.countDocuments({ category: category._id });
  if (count > 0) {
    // Chỉ dấu backtick ` mới thay ${} bằng giá trị; nháy đơn in nguyên chữ.
    throw new HttpError(409, `Còn ${count} tài liệu thuộc thể loại này, không thể xóa`);
  }

  await category.deleteOne();
  res.status(204).end();
});
