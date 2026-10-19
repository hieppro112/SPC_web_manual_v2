// ============================================================
// services/documents.ts — Lưu tài liệu KÈM bản chụp phiên bản
// ============================================================
// Mọi đường ghi tài liệu (tạo, sửa, khôi phục) đều đi qua đây.
// Lưu tài liệu + lưu bản chụp nằm trong MỘT transaction: hoặc cả hai được
// ghi, hoặc không gì cả — không bao giờ có tài liệu "mất" một phiên bản.

import { randomBytes } from 'node:crypto';
import { withTransaction } from '../db/pool.ts';
import type { ParsedBlock } from '../blocks/schemas.ts';
import {
  findDocumentById,
  insertDocument,
  insertVersion,
  slugExists,
  updateDocumentRow,
  type DocStatus,
} from '../repositories/documents.ts';
import { slugify } from '../utils/slugify.ts';
import { buildDesc, buildSearchText } from './documentText.ts';

export type DocumentInput = {
  title: string;
  categoryId: number;
  status: DocStatus;
  blocks: ParsedBlock[];
};

// Slug từ tiêu đề; trùng thì gắn thêm đuôi ngẫu nhiên:
//   "huong-dan-vpn" đã có -> "huong-dan-vpn-3f9a1c"
// (Cột Slug có ràng buộc UNIQUE: lỡ hai người tạo cùng lúc thì DB vẫn chặn.)
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  let slug = base;
  while (await slugExists(slug)) slug = `${base}-${randomBytes(3).toString('hex')}`;
  return slug;
}

function withComputed(input: DocumentInput) {
  return { ...input, desc: buildDesc(input.blocks), searchText: buildSearchText(input.title, input.blocks) };
}

// fixedSlug: slug định sẵn (bài hướng dẫn "guide-vi-01-..."), nơi gọi tự kiểm tra chưa trùng.
export async function createDocument(input: DocumentInput, userId: number, fixedSlug?: string) {
  const slug = fixedSlug ?? (await uniqueSlug(input.title));
  const record = withComputed(input);
  return withTransaction(async (tx) => {
    const id = await insertDocument({ ...record, slug, userId }, tx);
    await insertVersion({ ...input, documentId: id, version: 1, userId, restoredFrom: null }, tx);
    return (await findDocumentById(id, tx))!;
  });
}

// Slug GIỮ NGUYÊN khi sửa tiêu đề -> link đã chia sẻ không bị gãy.
export async function updateDocument(id: number, input: DocumentInput, userId: number, restoredFrom: number | null = null) {
  const record = withComputed(input);
  return withTransaction(async (tx) => {
    const version = await updateDocumentRow(id, { ...record, userId }, tx);
    await insertVersion({ ...input, documentId: id, version, userId, restoredFrom }, tx);
    return (await findDocumentById(id, tx))!;
  });
}
