// ============================================================
// services/categoryTree.ts — Phép tính trên cây thể loại
// ============================================================
// Hàm thuần (không đụng DB): nhận danh sách { id, parentId } rồi tính.
// Số thể loại nhỏ (vài chục) nên tính trong code cho dễ đọc, thay vì
// viết truy vấn đệ quy phức tạp trong SQL.

export type CategoryLink = { id: number; parentId: number | null };

// Id của một thể loại + TOÀN BỘ con cháu của nó.
//   IT -> [IT, AI, ...]   (dùng để lọc tài liệu theo cả nhánh)
export function descendantIds(links: CategoryLink[], rootId: number): number[] {
  const result = [rootId];
  // Duyệt theo "hàng đợi": lấy con của từng phần tử đã có, cho tới khi hết.
  // `seen` chặn vòng lặp vô hạn nếu dữ liệu lỡ bị vòng (an toàn thêm một lớp).
  const seen = new Set(result);
  for (let i = 0; i < result.length; i++) {
    for (const link of links) {
      if (link.parentId === result[i] && !seen.has(link.id)) {
        seen.add(link.id);
        result.push(link.id);
      }
    }
  }
  return result;
}

// Đặt `newParentId` làm cha của `id` có tạo vòng lặp không?
// Vòng lặp = cha là chính nó, hoặc cha là một con/cháu của nó
// (vd IT -> AI -> IT: không biết đâu là gốc, cây bị hỏng).
export function wouldCreateCycle(links: CategoryLink[], id: number, newParentId: number | null): boolean {
  if (newParentId === null) return false;
  return descendantIds(links, id).includes(newParentId);
}
