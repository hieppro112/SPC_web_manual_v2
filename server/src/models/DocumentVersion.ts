// ============================================================
// DocumentVersion.ts — Bản chụp tài liệu sau MỖI lần lưu
// ============================================================
// Lưu nguyên bản (title + blocks...) chứ không lưu phần khác biệt (diff):
// tốn chỗ hơn chút nhưng xem lại / khôi phục bản nào cũng chỉ là đọc
// một bản ghi, không phải ghép nối nhiều diff.

import { Schema, model } from 'mongoose';
import { blockSchema } from './Document.ts';
import { toJSON } from './toJSON.ts';

const documentVersionSchema = new Schema(
  {
    document: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    version: { type: Number, required: true },
    title: { type: String, required: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category' },
    status: { type: String },
    blocks: { type: [blockSchema], default: [] },
    savedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    // Có giá trị khi bản này sinh ra do bấm "Khôi phục" một bản cũ.
    restoredFrom: { type: Number, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON },
);

// Mỗi tài liệu chỉ có MỘT bản số N; index này cũng giúp lấy danh sách
// phiên bản của một tài liệu (mới nhất trước) rất nhanh.
documentVersionSchema.index({ document: 1, version: -1 }, { unique: true });

export const DocumentVersionModel = model('DocumentVersion', documentVersionSchema);
