// ============================================================
// Category.ts — Model thể loại
// ============================================================
// Một file model gồm 3 phần:
//   1. Schema  — khuôn dữ liệu + luật kiểm tra
//   2. Type    — kiểu TypeScript SUY RA từ schema (không viết tay)
//   3. Model   — "cánh cổng" để truy vấn collection
// 🔸 Flutter: Schema ≈ class model, Model ≈ Repository gọi DB.

import { Schema, model, type InferSchemaType } from 'mongoose';
import { toJSON } from './toJSON.ts';

const categorySchema = new Schema(
  {
    // required: [true, '...'] -> câu lỗi tiếng Việt trả thẳng về client.
    // trim: true -> tự cắt khoảng trắng đầu/cuối, tránh " Mạng " ≠ "Mạng".
    name: { type: String, required: [true, 'Tên thể loại không được để trống'], unique: true, trim: true },
    // Chỉ lưu TÊN icon (vd 'Folder'), client tự tra ra icon thật.
    iconName: { type: String, required: true, default: 'Folder' },
  },
  { timestamps: true, toJSON },
);

// InferSchemaType đọc schema ở trên rồi TỰ sinh ra kiểu:
//   { name: string; iconName: string; createdAt: Date; updatedAt: Date }
// Sửa schema là kiểu tự đổi theo — không bao giờ lệch nhau.
// 🔸 Flutter: giống json_serializable sinh code, nhưng không cần build_runner.
export type Category = InferSchemaType<typeof categorySchema>;

// 'Category' số ít -> Mongoose tự đặt tên collection là 'categories'.
export const CategoryModel = model('Category', categorySchema);
