// ============================================================
// services/documents.ts — Lưu tài liệu KÈM bản chụp phiên bản
// ============================================================
// Mọi đường ghi tài liệu (tạo, sửa, khôi phục) đều phải đi qua hàm này,
// để không bao giờ có lần lưu nào "quên" tạo phiên bản.

import type { Types } from 'mongoose';
import type { DocumentDoc } from '../models/Document.ts';
import { DocumentVersionModel } from '../models/DocumentVersion.ts';

export async function saveWithVersion(
  doc: DocumentDoc,
  userId: Types.ObjectId,
  restoredFrom: number | null = null,
): Promise<void> {
  doc.version = (doc.version ?? 0) + 1;
  doc.updatedBy = userId;
  if (!doc.createdBy) doc.createdBy = userId;
  await doc.save();

  await DocumentVersionModel.create({
    document: doc._id,
    version: doc.version,
    title: doc.title,
    category: doc.category,
    status: doc.status,
    blocks: doc.blocks,
    savedBy: userId,
    restoredFrom,
  });
}
