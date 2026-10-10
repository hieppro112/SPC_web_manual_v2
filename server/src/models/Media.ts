// ============================================================
// Media.ts — Thông tin file đã upload (ảnh / video / file đính kèm)
// ============================================================
// File thật nằm trên ổ đĩa (thư mục uploads/), DB chỉ giữ thông tin để
// làm "thư viện media": chọn lại ảnh đã upload, biết ai upload, nặng bao nhiêu.

import { Schema, model } from 'mongoose';
import { toJSON } from './toJSON.ts';

export const MEDIA_KINDS = ['image', 'video', 'file'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

const mediaSchema = new Schema(
  {
    kind: { type: String, enum: MEDIA_KINDS, required: true },
    url: { type: String, required: true }, // vd /uploads/images/ab12.webp
    originalName: { type: String, default: '' }, // tên file gốc trên máy người dùng
    mime: { type: String, default: '' },
    size: { type: Number, default: 0 }, // byte, SAU khi nén
    width: Number,
    height: Number,
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON },
);

export const MediaModel = model('Media', mediaSchema);
