// ============================================================
// services/access.ts — Ai xem được thể loại / tài liệu nào (phân quyền theo bộ phận)
// ============================================================
// Chỉ bật khi đã cấu hình view nhân viên (COMPANY_EMPLOYEE_VIEW). Khi bật:
//   admin                              -> xem tất cả
//   tài khoản chưa có mã nhân viên     -> xem tất cả (tài khoản cũ, chờ admin nhập mã)
//   tài khoản có mã (bộ phận "KP PC")  -> thể loại gốc có tên nằm trong bộ phận ("PC") + mọi con cháu
//                                          (so theo từ nguyên vẹn, xem matchDepartmentRoot)
//                                          + thể loại dùng chung + con cháu
//   khách (chưa đăng nhập)             -> chỉ thể loại dùng chung + con cháu
// "Dùng chung" = admin tick "Dùng chung cho mọi bộ phận", hoặc thể loại tên "Community".
// Thể loại không thuộc bộ phận nào và không dùng chung -> chỉ admin (và tài khoản cũ) thấy.
//
// Một "phạm vi" (Scope) = tập id thể loại được xem. Mọi route đọc / ghi tài liệu,
// tìm kiếm, trợ lý AI, bài kiểm tra... đều hỏi ở đây — bỏ sót chỗ nào là lộ tài liệu chỗ đó.

import type { Response } from 'express';
import { HttpError } from '../middleware/errorHandler.ts';
import { listCategoriesForAccess } from '../repositories/categories.ts';
import { docCategoryMap } from '../repositories/documents.ts';
import { isEmployeeCheckEnabled } from '../repositories/companyEmployee.ts';
import type { User } from '../repositories/users.ts';

export type Scope = { all: true } | { all: false; categoryIds: Set<number> };
const ALL: Scope = { all: true };

declare global {
  namespace Express {
    interface Locals {
      scope?: Scope;
    }
  }
}

// Danh sách thể loại đổi rất ít -> nhớ 30 giây; admin sửa thể loại thì xóa nhớ ngay.
type Cat = Awaited<ReturnType<typeof listCategoriesForAccess>>[number];
let cache: { at: number; rows: Cat[] } | null = null;
export function invalidateAccessCache() {
  cache = null;
}
async function categories(): Promise<Cat[]> {
  if (!cache || Date.now() - cache.at > 30_000) cache = { at: Date.now(), rows: await listCategoriesForAccess() };
  return cache.rows;
}

const norm = (s: string) => s.trim().toLowerCase();
export const isSharedCategory = (c: { name: string; isShared: boolean }) => c.isShared || norm(c.name) === 'community';

// ---------- Bộ phận (Section trong view nhân viên) -> thể loại gốc ----------
// Section có thể chi tiết hơn tên thể loại: "KP PC", "KM PC" đều thuộc bộ phận "PC".
// So theo TỪ NGUYÊN VẸN, không so từng ký tự (contains): "PCB" hay "NPC" KHÔNG khớp "PC",
// "KITTING" không khớp "IT" -> không cho nhầm người sang bộ phận khác.
//   "KP PC"   ~ "PC"     ✅      "PE-IT"  ~ "PE IT" ✅ (- _ / , . coi như dấu cách)
//   "PCB"     ~ "PC"     ❌      "PE IT"  khớp cả "PE IT" lẫn "IT" -> chọn "PE IT" (nhiều từ hơn)
// ⚠️ Phải giống hệt client/src/features/categories/department.ts (chọn bộ phận mặc định ở trang chủ).
const words = (s: string) => s.toLowerCase().split(/[\s\-_/,.]+/).filter(Boolean);

// Vị trí đầu tiên mà dãy từ `name` nằm liền nhau trong `section`, -1 = không có.
function wordIndex(section: string[], name: string[]): number {
  for (let i = 0; name.length && i + name.length <= section.length; i++) {
    if (name.every((w, j) => section[i + j] === w)) return i;
  }
  return -1;
}

// Thể loại gốc (không dùng chung) ứng với bộ phận. Nhiều cái khớp -> nhiều từ hơn thắng;
// bằng nhau -> cái đứng sau trong Section thắng ("KP PC": bộ phận thường là từ cuối).
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

// Các thể loại gốc + toàn bộ con cháu của chúng.
function withDescendants(rows: Cat[], seeds: number[]): Set<number> {
  const result = new Set(seeds);
  let added = true;
  while (added) {
    added = false;
    for (const c of rows) {
      if (c.parentId !== null && result.has(c.parentId) && !result.has(c.id)) {
        result.add(c.id);
        added = true;
      }
    }
  }
  return result;
}

export async function scopeFor(user: User | undefined): Promise<Scope> {
  if (!isEmployeeCheckEnabled()) return ALL;
  if (user?.role === 'admin') return ALL;
  if (user && !user.employeeCode) return ALL;
  const rows = await categories();
  const seeds = rows.filter(isSharedCategory).map((c) => c.id);
  const department = user?.department?.trim();
  if (department) {
    const root = matchDepartmentRoot(
      rows.filter((c) => c.parentId === null && !isSharedCategory(c)),
      department,
    );
    if (root) seeds.push(root.id);
  }
  return { all: false, categoryIds: withDescendants(rows, seeds) };
}

// Phạm vi của người đang gọi API (tính một lần cho mỗi request).
export async function requestScope(res: Response): Promise<Scope> {
  res.locals.scope ??= await scopeFor(res.locals.user);
  return res.locals.scope;
}

export const canSee = (scope: Scope, categoryId: string | number | null | undefined): boolean =>
  scope.all || (categoryId !== null && categoryId !== undefined && scope.categoryIds.has(Number(categoryId)));

// Tài liệu ngoài phạm vi: khách -> 401 (mời đăng nhập, vd quét QR dán ở máy),
// đã đăng nhập -> 404 như không tồn tại (không cho biết bộ phận khác có bài gì).
export async function assertDocVisible(doc: { category?: { id: string } | null }, res: Response): Promise<void> {
  if (canSee(await requestScope(res), doc.category?.id)) return;
  if (!res.locals.user) throw new HttpError(401, 'Hãy đăng nhập để xem tài liệu này');
  throw new HttpError(404, 'Không tìm thấy tài liệu');
}

// Trong các tài liệu này, tài liệu nào nằm trong phạm vi.
export async function visibleDocIds(scope: Scope, documentIds: number[]): Promise<Set<number>> {
  if (scope.all) return new Set(documentIds);
  const map = await docCategoryMap(documentIds);
  return new Set(documentIds.filter((id) => canSee(scope, map.get(id))));
}

// Đề kiểm tra chỉ hiện khi MỌI tài liệu nguồn đều xem được (đề chứa nội dung của
// chúng). Đề tự soạn không có tài liệu nguồn -> ai cũng thấy.
export async function quizzesVisible<T extends { sourceDocs: { id: string }[] }>(scope: Scope, quizzes: T[]): Promise<T[]> {
  if (scope.all) return quizzes;
  const ids = quizzes.flatMap((q) => q.sourceDocs.map((d) => Number(d.id)));
  const visible = await visibleDocIds(scope, ids);
  return quizzes.filter((q) => q.sourceDocs.every((d) => visible.has(Number(d.id))));
}

// Tạo đề / gửi Claude từ các tài liệu này: mọi tài liệu phải trong phạm vi.
export async function assertDocsVisible(documentIds: number[], res: Response): Promise<void> {
  const visible = await visibleDocIds(await requestScope(res), documentIds);
  if (documentIds.some((id) => !visible.has(id))) throw new HttpError(404, 'Không tìm thấy tài liệu');
}

// Biên tập chỉ được đăng / chuyển bài vào thể loại trong phạm vi của mình.
export async function assertCanPostTo(categoryId: number, res: Response): Promise<void> {
  if (!canSee(await requestScope(res), categoryId)) throw new HttpError(403, 'Bạn không được đăng bài vào thể loại này');
}
