// ============================================================
// UploadSession.ts — Phiên "quét QR để upload từ điện thoại"
// ============================================================
//   1. Editor (máy tính) tạo phiên  -> nhận token, hiện QR chứa token
//   2. Điện thoại quét QR, upload ảnh kèm token (không cần đăng nhập —
//      token chính là "vé vào cửa", chỉ dùng được 1 lần, hết hạn sau 10 phút)
//   3. Máy tính hỏi lại phiên mỗi 2 giây, thấy status 'done' thì lấy media

import { Schema, model } from 'mongoose';
import { toJSON } from './toJSON.ts';

export const SESSION_TTL_MINUTES = 10;

const uploadSessionSchema = new Schema(
  {
    token: { type: String, required: true, unique: true },
    kind: { type: String, enum: ['image', 'video'], required: true },
    status: { type: String, enum: ['pending', 'done'], default: 'pending' },
    media: { type: Schema.Types.ObjectId, ref: 'Media' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // TTL index (`expires: 0`): MongoDB TỰ XÓA bản ghi khi tới thời điểm
    // expiresAt. Không cần viết job dọn dẹp. (Mongo quét khoảng 60 giây
    // một lần nên bản ghi có thể còn thêm chút ít — code vẫn tự kiểm tra
    // hạn, không dựa hoàn toàn vào việc xóa.)
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true, toJSON },
);

export const UploadSessionModel = model('UploadSession', uploadSessionSchema);
