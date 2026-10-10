// ============================================================
// slugify.ts — Biến tiêu đề thành đoạn URL "đẹp"
// ============================================================
//   "Quy trình bảo trì máy CNC"  ->  "quy-trinh-bao-tri-may-cnc"
//
// Dùng slug thay cho id trong link chia sẻ: /docs/quy-trinh-bao-tri-may-cnc
// đọc là hiểu, còn /docs/6523f1a9c2e4... thì không.

// Bỏ dấu tiếng Việt + chữ thường: "Bảo Trì Máy" -> "bao tri may".
// Dùng chung cho slug và cho tìm kiếm (gõ "bao tri" vẫn ra "bảo trì").
export function removeDiacritics(input: string): string {
  return (
    input
      // NFD tách chữ có dấu thành "chữ gốc + dấu": "ộ" -> "o" + "̂" + "̣".
      // Dòng replace kế tiếp xóa toàn bộ phần dấu (dải ký tự U+0300–U+036F).
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      // "đ" là chữ riêng, KHÔNG phải "d" + dấu, nên NFD không tách được.
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
  );
}

// Thoát các ký tự đặc biệt của regex: người dùng gõ "c++" thì tìm đúng
// chuỗi "c++", không bị hiểu thành biểu thức regex.
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function slugify(input: string): string {
  const slug = removeDiacritics(input)
    // Mọi chuỗi ký tự không phải a-z, 0-9 (khoảng trắng, dấu câu, chữ Nhật...)
    // gộp thành MỘT dấu gạch ngang.
    .replace(/[^a-z0-9]+/g, '-')
    // Bỏ gạch ngang thừa ở hai đầu: "-abc-" -> "abc"
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  // Tiêu đề toàn chữ Nhật/ký tự đặc biệt sẽ thành chuỗi rỗng -> tên dự phòng.
  return slug || 'tai-lieu';
}
