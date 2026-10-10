// ============================================================
// routes/documents.ts — Mọi API của tài liệu
// ============================================================
// Router là một "mini app": gom các route cùng nhóm vào một file,
// rồi index.ts gắn cả nhóm vào một tiền tố:
//   app.use('/api/documents', documentsRouter)
// Nên ở đây chỉ viết '/' và '/:id', không lặp lại '/api/documents'.
// 🔸 Flutter: giống một GoRoute cha có nhiều route con.
//
// ⚠️ Chưa có requireAuth — ai cũng ghi được. Bước 4 sẽ khóa lại.

import { Router } from 'express';
import type { Types } from 'mongoose';
import { CategoryModel } from '../models/Category.ts';
import { DOC_STATUSES, DocumentModel } from '../models/Document.ts';
import { HttpError } from '../middleware/errorHandler.ts';

export const documentsRouter = Router();

// Chỉ lấy thông tin cần hiển thị của thể loại khi populate.
const CATEGORY_FIELDS = 'name iconName';

// "Type guard": hàm trả về boolean, nhưng kiểu trả về `value is ...` báo
// cho TS biết: nếu hàm trả true thì `value` CHẮC CHẮN thuộc kiểu đó.
// `(typeof DOC_STATUSES)[number]` = kiểu của MỘT phần tử trong mảng
// = 'draft' | 'published'.
// 🔸 Dart: giống `if (x is String)` rồi Dart tự hiểu x là String.
function isDocStatus(value: string): value is (typeof DOC_STATUSES)[number] {
  return (DOC_STATUSES as readonly string[]).includes(value);
}

// ObjectId đúng định dạng nhưng KHÔNG có trong DB thì Mongoose vẫn cho
// lưu (nó chỉ kiểm tra định dạng). Phải tự kiểm tra thể loại có thật.
async function assertCategoryExists(id: Types.ObjectId | null | undefined) {
  if (!id) return; // thiếu hẳn -> để schema báo lỗi "Phải chọn thể loại"
  const exists = await CategoryModel.exists({ _id: id });
  if (!exists) throw new HttpError(400, 'Thể loại không tồn tại');
}

// GET /api/documents                  — mọi tài liệu
// GET /api/documents?status=published — chỉ bài đã xuất bản
// Mới nhất trước.
// ⚠️ Bước 4: khách chưa đăng nhập sẽ bị ÉP status=published, chỉ editor
// mới xem được bản nháp. Giờ chưa có đăng nhập nên tạm cho chọn tự do.
documentsRouter.get('/', async (req, res) => {
  // req.query.status có thể là chuỗi, mảng (?status=a&status=b) hoặc
  // không có. Chỉ nhận đúng một chuỗi hợp lệ, còn lại bỏ qua.
  const { status } = req.query;
  const filter = typeof status === 'string' && isDocStatus(status) ? { status } : {};

  const docs = await DocumentModel.find(filter)
    // '-blocks' = lấy mọi field TRỪ blocks. Trang danh sách chỉ cần
    // tiêu đề + mô tả; bản cũ trả cả nội dung mọi bài -> nặng vô ích.
    .select('-blocks')
    .sort({ createdAt: -1 })
    // Thay id thể loại bằng object { id, name, iconName }.
    .populate('category', CATEGORY_FIELDS);
  res.json(docs);
});

// GET /api/documents/slug/:slug — một tài liệu theo slug, dùng cho link chia sẻ
// /docs/quy-trinh-bao-tri-may-cnc. Không xung đột với '/:id' bên dưới vì
// '/:id' chỉ khớp ĐÚNG MỘT đoạn sau dấu /, còn route này có hai đoạn.
documentsRouter.get('/slug/:slug', async (req, res) => {
  const doc = await DocumentModel.findOne({ slug: req.params.slug }).populate('category', CATEGORY_FIELDS);
  if (!doc) throw new HttpError(404, 'Không tìm thấy tài liệu');
  res.json(doc);
});

// GET /api/documents/:id — một tài liệu đầy đủ.
// Bản cũ KHÔNG có route này (lấy từ danh sách đã tải sẵn). Bản mới cần nó
// cho React Router: mở thẳng link /docs/abc123 thì phải tải được bài đó.
documentsRouter.get('/:id', async (req, res) => {
  const doc = await DocumentModel.findById(req.params.id).populate('category', CATEGORY_FIELDS);
  if (!doc) throw new HttpError(404, 'Không tìm thấy tài liệu');
  res.json(doc);
});

// POST /api/documents — tạo mới
documentsRouter.post('/', async (req, res) => {
  // `?? {}`: Express 5 để req.body là undefined nếu client không gửi body.
  // Chỉ lấy đúng các field cho phép — client gửi kèm `desc`, `slug` hay
  // `_id` lạ cũng bị bỏ qua (desc và slug do server tự sinh).
  const { title, category, blocks, status } = req.body ?? {};

  // `new` chỉ tạo object trong bộ nhớ, CHƯA ghi DB.
  // Lúc này Mongoose đã ép `category` từ chuỗi sang ObjectId.
  const doc = new DocumentModel({ title, category, blocks, status });
  await assertCategoryExists(doc.category);
  await doc.save(); // ghi DB — hook pre('save') tính desc chạy ở đây

  await doc.populate('category', CATEGORY_FIELDS);
  res.status(201).json(doc); // 201 = Created
});

// PUT /api/documents/:id — sửa (thay toàn bộ title/category/blocks)
documentsRouter.put('/:id', async (req, res) => {
  // Cách cũ: findByIdAndUpdate(...). Nhược điểm: nó cập nhật thẳng xuống
  // DB, BỎ QUA hook pre('save') và mặc định BỎ QUA luôn kiểm tra schema.
  // Cách mới: tải về -> sửa -> save(). Thêm 1 lần truy vấn nhưng mọi
  // luật đều được áp dụng giống hệt lúc tạo.
  const doc = await DocumentModel.findById(req.params.id);
  if (!doc) throw new HttpError(404, 'Không tìm thấy tài liệu');

  const { title, category, blocks, status } = req.body ?? {};
  doc.set({ title, category, blocks });
  // Không gửi status thì giữ nguyên trạng thái cũ, vì đặt một field thành
  // undefined trong Mongoose là XÓA field đó.
  if (status !== undefined) doc.status = status;
  await assertCategoryExists(doc.category);
  await doc.save();

  await doc.populate('category', CATEGORY_FIELDS);
  res.json(doc);
});

// DELETE /api/documents/:id
documentsRouter.delete('/:id', async (req, res) => {
  const doc = await DocumentModel.findByIdAndDelete(req.params.id);
  if (!doc) throw new HttpError(404, 'Không tìm thấy tài liệu');
  // 204 No Content: thành công, không có gì để trả về.
  res.status(204).end();
});
