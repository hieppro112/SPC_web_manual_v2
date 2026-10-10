// ============================================================
// toJSON.ts — Quy tắc chung khi biến document MongoDB thành JSON
// ============================================================
// Bản cũ trả thẳng `_id` và `__v` của MongoDB ra cho React, nên phía
// client phải có hàm getDocId() để đoán lúc nào là `id`, lúc nào `_id`.
//
// Bản mới: mọi model dùng chung quy tắc này, nên JSON trả về LUÔN có
// dạng { id: "...", ... } — không còn `_id`, không còn `__v`.
// 🔸 Flutter: giống viết toJson() một lần trong class cha cho mọi model.

export const toJSON = {
  // `id` là "virtual" Mongoose tự có sẵn (= _id dạng chuỗi), nhưng mặc
  // định không được đưa vào JSON. Bật virtuals để nó xuất hiện.
  virtuals: true,
  // `__v` là số phiên bản nội bộ của Mongoose, client không cần.
  versionKey: false,
  // transform chạy NGAY TRƯỚC khi trả JSON — chỗ để gọt bớt field.
  transform(_doc: unknown, ret: Record<string, unknown>) {
    delete ret._id;
    return ret;
  },
};
