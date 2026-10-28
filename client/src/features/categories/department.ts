// ============================================================
// features/categories/department.ts — Bộ phận của người xem -> thể loại gốc
// ============================================================
// Section trong view nhân viên có thể chi tiết hơn tên thể loại: "KP PC", "KM PC"
// đều thuộc bộ phận "PC". So theo TỪ NGUYÊN VẸN (không phải contains từng ký tự):
//   "KP PC" ~ "PC" ✅     "PCB" ~ "PC" ❌     "PE-IT" ~ "PE IT" ✅
//   "PE IT" khớp cả "PE IT" lẫn "IT" -> chọn "PE IT" (nhiều từ hơn = cụ thể hơn)
// ⚠️ Phải giống hệt server/src/services/access.ts (server dùng để phân quyền xem;
//    client chỉ dùng để chọn sẵn bộ phận ở khu Nổi bật trang chủ).

const words = (s: string) => s.toLowerCase().split(/[\s\-_/,.]+/).filter(Boolean);

function wordIndex(section: string[], name: string[]): number {
  for (let i = 0; name.length && i + name.length <= section.length; i++) {
    if (name.every((w, j) => section[i + j] === w)) return i;
  }
  return -1;
}

export function matchDepartmentRoot<T extends { name: string }>(roots: T[], department: string): T | undefined {
  const section = words(department);
  let best: { root: T; size: number; at: number } | undefined;
  for (const root of roots) {
    const name = words(root.name);
    const at = wordIndex(section, name);
    if (at < 0) continue;
    if (!best || name.length > best.size || (name.length === best.size && at > best.at)) best = { root, size: name.length, at };
  }
  return best?.root;
}
