// ============================================================
// scripts/migrateFromMongo.ts — Chuyển dữ liệu MongoDB cũ sang SQL Server
// ============================================================
// Chạy MỘT LẦN trên máy đang có MongoDB cũ:
//   npm run migrate-from-mongo                       (Mongo mặc định: localhost/doc_app_v2)
//   npm run migrate-from-mongo -- --mongo mongodb://localhost:27017/ten_db
//   npm run migrate-from-mongo -- --force            (XÓA dữ liệu đang có trong SQL rồi chép lại)
//
// Chuyển: tài khoản (giữ nguyên mật khẩu đã băm), thể loại, media, tài
// liệu, lịch sử phiên bản. Bỏ qua phiên QR (chỉ sống 10 phút).
// File ảnh/video KHÔNG nằm trong DB — chép thư mục uploads/ riêng.
//
// Tất cả chạy trong MỘT transaction: lỗi giữa chừng thì SQL Server trở
// về như trước, chạy lại được.

import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { blockPropsSchemas, BLOCK_TYPES, type BlockType, type ParsedBlock } from '../blocks/schemas.ts';
import { closeDb, connectDb, execute, queryOne, withTransaction, type Tx } from '../db/pool.ts';
import { runMigrations } from '../db/migrate.ts';
import { buildDesc, buildSearchText } from '../services/documentText.ts';
import { slugify } from '../utils/slugify.ts';

const args = process.argv.slice(2);
const mongoUri = args.includes('--mongo') ? args[args.indexOf('--mongo') + 1] : 'mongodb://localhost:27017/doc_app_v2';
const force = args.includes('--force');

type AnyDoc = Record<string, any>;
const oid = (value: unknown) => (value ? String(value) : '');
const date = (value: unknown) => (value instanceof Date ? value : new Date());

// ---------- Chuyển khối cũ sang dạng { id, type, props } hợp lệ ----------

let droppedBlocks = 0;
let convertedOldBlocks = 0;

function convertBlocks(raw: unknown, title: string): ParsedBlock[] {
  if (!Array.isArray(raw)) return [];
  const result: ParsedBlock[] = [];
  for (const block of raw as AnyDoc[]) {
    const type = block?.type as BlockType;
    if (!(BLOCK_TYPES as readonly string[]).includes(type)) {
      droppedBlocks++;
      console.warn(`   ⚠️  "${title}": bỏ khối loại lạ "${block?.type}"`);
      continue;
    }
    let props: unknown = block.props;
    // Khối kiểu CŨ (bước 1): chỉ có `content` dạng chuỗi.
    if (props === undefined && typeof block.content === 'string') {
      convertedOldBlocks++;
      props =
        type === 'heading' ? { text: block.content, level: 2 }
        : type === 'image' ? { src: block.content }
        : { text: block.content };
    }
    const parsed = blockPropsSchemas[type].safeParse(props ?? {});
    if (!parsed.success) {
      droppedBlocks++;
      console.warn(`   ⚠️  "${title}": bỏ khối ${type} không hợp lệ (${parsed.error.issues[0]?.message})`);
      continue;
    }
    result.push({ id: String(block.id || randomBytes(4).toString('hex')), type, props: parsed.data as Record<string, unknown> });
  }
  return result;
}

// ---------- Chạy ----------

await connectDb();
await runMigrations();

const existing = await queryOne<{ Total: number }>(
  'SELECT (SELECT COUNT(*) FROM WebManualUsers) + (SELECT COUNT(*) FROM WebManualCategories) + (SELECT COUNT(*) FROM WebManualDocuments) AS Total',
);
if ((existing?.Total ?? 0) > 0 && !force) {
  console.error('❌ Database SQL Server đã có dữ liệu. Thêm --force để XÓA hết và chép lại từ MongoDB.');
  await closeDb();
  process.exit(1);
}

console.log(`📥 Đọc MongoDB: ${mongoUri}`);
await mongoose.connect(mongoUri);
const mdb = mongoose.connection.db!;
const [users, categories, media, documents, versions] = await Promise.all(
  ['users', 'categories', 'media', 'documents', 'documentversions'].map((name) => mdb.collection(name).find().toArray()),
);
console.log(
  `   ${users.length} tài khoản, ${categories.length} thể loại, ${media.length} media, ${documents.length} tài liệu, ${versions.length} phiên bản`,
);

await withTransaction(async (tx: Tx) => {
  if (force) {
    console.log('🧹 Xóa dữ liệu cũ trong SQL Server...');
    for (const table of ['WebManualUploadSessions', 'WebManualDocumentVersions', 'WebManualDocuments', 'WebManualMedia', 'WebManualCategories', 'WebManualUsers']) {
      await execute(`DELETE FROM ${table}`, {}, tx);
    }
  }

  // Id MongoDB (chuỗi 24 ký tự) -> Id mới trong SQL (số tự tăng)
  const userIds = new Map<string, number>();
  const categoryIds = new Map<string, number>();

  for (const u of users) {
    const row = await queryOne<{ Id: number }>(
      `INSERT INTO WebManualUsers (Username, DisplayName, Email, PasswordHash, Role, Status, CreatedAt, UpdatedAt)
       OUTPUT INSERTED.Id
       VALUES (@username, @displayName, @email, @passwordHash, @role, @status, @createdAt, @updatedAt)`,
      {
        username: u.username,
        displayName: u.displayName ?? u.username,
        email: u.email || null,
        passwordHash: u.passwordHash,
        role: u.role === 'admin' ? 'admin' : 'editor',
        status: u.status === 'pending' ? 'pending' : 'active',
        createdAt: date(u.createdAt),
        updatedAt: date(u.updatedAt),
      },
      tx,
    );
    userIds.set(oid(u._id), row!.Id);
  }

  for (const c of categories) {
    const row = await queryOne<{ Id: number }>(
      `INSERT INTO WebManualCategories (Name, IconName, CreatedAt, UpdatedAt) OUTPUT INSERTED.Id
       VALUES (@name, @iconName, @createdAt, @updatedAt)`,
      { name: c.name, iconName: c.iconName || 'Folder', createdAt: date(c.createdAt), updatedAt: date(c.updatedAt) },
      tx,
    );
    categoryIds.set(oid(c._id), row!.Id);
  }

  // Tài liệu trỏ tới thể loại không còn tồn tại -> gom vào "Chưa phân loại".
  let fallbackCategoryId: number | null = null;
  const categoryFor = async (mongoId: unknown): Promise<number> => {
    const id = categoryIds.get(oid(mongoId));
    if (id) return id;
    if (!fallbackCategoryId) {
      const row = await queryOne<{ Id: number }>(
        `INSERT INTO WebManualCategories (Name, IconName) OUTPUT INSERTED.Id VALUES (N'Chưa phân loại', N'Folder')`,
        {},
        tx,
      );
      fallbackCategoryId = row!.Id;
      console.warn('   ⚠️  Có tài liệu không có thể loại hợp lệ -> tạo thể loại "Chưa phân loại"');
    }
    return fallbackCategoryId;
  };

  for (const m of media) {
    await execute(
      `INSERT INTO WebManualMedia (Kind, Url, OriginalName, Mime, Size, Width, Height, UploadedById, CreatedAt)
       VALUES (@kind, @url, @originalName, @mime, @size, @width, @height, @uploadedById, @createdAt)`,
      {
        kind: m.kind,
        url: m.url,
        originalName: m.originalName ?? '',
        mime: m.mime ?? '',
        size: Number(m.size ?? 0),
        width: m.width ?? null,
        height: m.height ?? null,
        uploadedById: userIds.get(oid(m.uploadedBy)) ?? null,
        createdAt: date(m.createdAt),
      },
      tx,
    );
  }

  const usedSlugs = new Set<string>();
  const uniqueSlug = (wanted: string, title: string) => {
    let slug = wanted || slugify(title);
    while (usedSlugs.has(slug)) slug = `${slugify(title)}-${randomBytes(3).toString('hex')}`;
    usedSlugs.add(slug);
    return slug;
  };

  for (const d of documents) {
    const title = String(d.title ?? '').trim() || 'Tài liệu chưa đặt tên';
    const blocks = convertBlocks(d.blocks, title);
    const categoryId = await categoryFor(d.category);
    const status = d.status === 'published' ? 'published' : 'draft';
    const docVersions = versions
      .filter((v) => oid(v.document) === oid(d._id))
      .sort((a, b) => Number(a.version) - Number(b.version));
    const currentVersion = Math.max(Number(d.version ?? 0), ...docVersions.map((v) => Number(v.version)), 1);

    const row = await queryOne<{ Id: number }>(
      `INSERT INTO WebManualDocuments (Title, Slug, CategoryId, Status, Blocks, Version, Description, SearchText,
                              CreatedById, UpdatedById, CreatedAt, UpdatedAt)
       OUTPUT INSERTED.Id
       VALUES (@title, @slug, @categoryId, @status, @blocks, @version, @desc, @searchText,
               @createdById, @updatedById, @createdAt, @updatedAt)`,
      {
        title,
        slug: uniqueSlug(String(d.slug ?? ''), title),
        categoryId,
        status,
        blocks: JSON.stringify(blocks),
        version: currentVersion,
        desc: buildDesc(blocks),
        searchText: buildSearchText(title, blocks),
        createdById: userIds.get(oid(d.createdBy)) ?? null,
        updatedById: userIds.get(oid(d.updatedBy)) ?? null,
        createdAt: date(d.createdAt),
        updatedAt: date(d.updatedAt),
      },
      tx,
    );
    const documentId = row!.Id;

    const insertVersion = (v: { version: number; title: string; categoryId: number | null; status: string; blocks: ParsedBlock[]; savedById: number | null; restoredFrom: number | null; createdAt: Date }) =>
      execute(
        `INSERT INTO WebManualDocumentVersions (DocumentId, Version, Title, CategoryId, Status, Blocks, SavedById, RestoredFrom, CreatedAt)
         VALUES (@documentId, @version, @title, @categoryId, @status, @blocks, @savedById, @restoredFrom, @createdAt)`,
        { ...v, documentId, blocks: JSON.stringify(v.blocks) },
        tx,
      );

    for (const v of docVersions) {
      const vTitle = String(v.title ?? title);
      await insertVersion({
        version: Number(v.version),
        title: vTitle,
        categoryId: categoryIds.get(oid(v.category)) ?? null,
        status: v.status === 'published' ? 'published' : 'draft',
        blocks: convertBlocks(v.blocks, `${vTitle} (v${v.version})`),
        savedById: userIds.get(oid(v.savedBy)) ?? null,
        restoredFrom: v.restoredFrom ?? null,
        createdAt: date(v.createdAt),
      });
    }
    // Tài liệu chưa có bản chụp phiên bản nào (dữ liệu từ trước khi có tính
    // năng lịch sử) -> tạo một bản chụp từ nội dung hiện tại.
    if (!docVersions.some((v) => Number(v.version) === currentVersion)) {
      await insertVersion({
        version: currentVersion,
        title,
        categoryId,
        status,
        blocks,
        savedById: userIds.get(oid(d.updatedBy)) ?? null,
        restoredFrom: null,
        createdAt: date(d.updatedAt),
      });
    }
  }
});

await mongoose.disconnect();
await closeDb();
console.log('✅ Chuyển xong.');
if (convertedOldBlocks) console.log(`   ${convertedOldBlocks} khối kiểu cũ (content) đã đổi sang dạng mới.`);
if (droppedBlocks) console.log(`   ⚠️  ${droppedBlocks} khối không hợp lệ bị bỏ qua (xem cảnh báo phía trên).`);
console.log('   Nhớ chép thư mục uploads/ (ảnh, video, file) sang UPLOAD_DIR của máy chạy SQL Server.');
