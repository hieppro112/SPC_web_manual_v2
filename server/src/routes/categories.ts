// ============================================================
// routes/categories.ts — Mọi API của thể loại
// ============================================================
// Bài tập bước 1 (Hiệp viết, mentor review). Các chỗ đánh dấu
// "⚠️ Sửa" là lỗi trong bản nộp, giữ lại ghi chú để đối chiếu.
//
// Quy ước REST dùng trong cả dự án:
//   GET    /api/categories      danh sách
//   POST   /api/categories      tạo mới        (dữ liệu trong body)
//   PUT    /api/categories/:id  sửa            (id trên URL, dữ liệu trong body)
//   DELETE /api/categories/:id  xóa            (id trên URL, KHÔNG có body)

import { Router } from 'express';
import { CategoryModel } from '../models/Category.ts';
import { DocumentModel } from '../models/Document.ts';
import { HttpError } from '../middleware/errorHandler.ts';

export const categoriesRouter = Router();

// GET /api/categories — sắp theo tên A→Z
categoriesRouter.get('/', async (_req, res) => {
  const categories = await CategoryModel.find().sort({ name: 1 });
  res.json(categories);
});

// POST /api/categories — tạo mới
categoriesRouter.post('/', async (req, res) => {
  // ⚠️ Sửa: bản nộp gọi findById(req.body._id) rồi báo 404 nếu không có.
  // Nhưng thể loại MỚI thì làm gì đã có trong DB -> lần nào cũng 404.
  // Tạo mới = new Model(...) + save(), giống POST của documents.
  const { name, iconName } = req.body ?? {};
  const category = new CategoryModel({ name, iconName });
  await category.save(); // trùng tên -> lỗi 11000 -> errorHandler trả 409
  res.status(201).json(category);
});

// PUT /api/categories/:id — sửa tên/icon
// ⚠️ Sửa: bản nộp dùng PUT '/' và đọc id trong body. Đặt id trên URL là
// quy ước REST: nhìn URL là biết đang sửa cái nào, và giống documents.ts.
categoriesRouter.put('/:id', async (req, res) => {
  const category = await CategoryModel.findById(req.params.id);
  if (!category) throw new HttpError(404, 'Thể loại không tồn tại');

  // ⚠️ Sửa: bản nộp lấy `nameIcon` (sai tên) nên iconName luôn undefined.
  // TypeScript không bắt được lỗi này vì req.body có kiểu `any` — đây là
  // lý do bước 5 sẽ dùng zod để kiểm tra body.
  const { name, iconName } = req.body ?? {};
  category.set({ name, iconName });
  await category.save();

  // ⚠️ Sửa: bản nộp có `await cate.populate('category', ...)`. Thể loại
  // không có field `category` nào để populate -> Mongoose ném lỗi -> 500.
  // populate chỉ dùng cho field có `ref` (như Document.category).

  // ⚠️ Sửa: 201 nghĩa là "đã TẠO". Sửa thành công thì là 200 (mặc định
  // của res.json nên không cần ghi).
  res.json(category);
});

// DELETE /api/categories/:id — chỉ xóa được khi không còn tài liệu nào dùng
// ⚠️ Sửa: bản nộp đọc id trong body. Nhiều thư viện/proxy BỎ body của
// request DELETE, nên id phải nằm trên URL.
categoriesRouter.delete('/:id', async (req, res) => {
  const category = await CategoryModel.findById(req.params.id);
  if (!category) throw new HttpError(404, 'Thể loại không tồn tại');

  const count = await DocumentModel.countDocuments({ category: category._id });
  if (count > 0) {
    // ⚠️ Sửa: bản nộp dùng nháy đơn '...${value}...'. Chỉ dấu backtick `
    // mới thay ${} bằng giá trị; nháy đơn in nguyên chữ "${value}".
    // 🔸 Dart: giống '$value' trong Dart, nhưng JS bắt buộc dùng backtick.
    throw new HttpError(409, `Còn ${count} tài liệu thuộc thể loại này, không thể xóa`);
  }

  await category.deleteOne();
  // ⚠️ Sửa: 204 = "không có body". Bản nộp gửi kèm .json({message}),
  // trình duyệt sẽ bỏ qua body đó, nên dùng .end() cho đúng nghĩa.
  res.status(204).end();
});
