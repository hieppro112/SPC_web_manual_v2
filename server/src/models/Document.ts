// ============================================================
// Document.ts — Model tài liệu
// ============================================================
//   - `category` lưu ObjectId tham chiếu (đổi tên thể loại không làm
//     tài liệu mồ côi)
//   - Khối = { id, type, props }; luật của từng loại khối nằm ở
//     blocks/schemas.ts (zod), DB chỉ lưu props dạng Mixed
//   - `slug` sinh một lần từ tiêu đề, dùng cho link chia sẻ
//   - `status` nháp / đã xuất bản — khách chỉ thấy bài đã xuất bản
//   - `version` tăng mỗi lần lưu; bản chụp nằm ở DocumentVersion
//   - `desc`, `searchText` do hook tự tính, client không gửi được

import { randomBytes } from 'node:crypto';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { BLOCK_TYPES } from '../blocks/schemas.ts';
import { toJSON } from './toJSON.ts';
import { removeDiacritics, slugify } from '../utils/slugify.ts';

export const DOC_STATUSES = ['draft', 'published'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

// Schema con: nhúng bên trong tài liệu, không phải collection riêng.
// export để DocumentVersion dùng lại đúng khuôn này.
export const blockSchema = new Schema(
  {
    id: { type: String, required: true }, // id do client tự sinh, để React làm `key`
    type: {
      type: String,
      // {VALUE} được Mongoose thay bằng giá trị sai mà client gửi lên.
      enum: { values: BLOCK_TYPES, message: 'Loại khối không hợp lệ: {VALUE}' },
      required: true,
    },
    // Mixed = "object hình dạng gì cũng được". Mỗi loại khối có props
    // khác nhau; kiểm tra chi tiết do zod (blocks/schemas.ts) đảm nhận.
    // 🔸 Flutter: giống field `Map<String, dynamic> props` trong model.
    props: { type: Schema.Types.Mixed, default: {} },
  },
  {
    _id: false, // không sinh _id riêng cho từng khối
    // Mặc định Mongoose XÓA object rỗng (gọi là "minimize"). Khối divider
    // có props = {} sẽ mất luôn field props -> client đọc block.props.xxx
    // là nổ. Tắt đi để {} vẫn là {}. Phải đặt ở CHÍNH schema con này —
    // đặt ở schema cha không có tác dụng với khối bên trong.
    minimize: false,
  },
);

const documentSchema = new Schema(
  {
    title: { type: String, required: [true, 'Tiêu đề không được để trống'], trim: true, maxlength: 300 },

    // Sinh tự động từ title lúc TẠO và GIỮ NGUYÊN khi sửa title — link đã
    // chia sẻ không bị gãy. `unique` tạo index: trùng thì DB từ chối (409).
    slug: { type: String, required: true, unique: true },

    category: { type: Schema.Types.ObjectId, ref: 'Category', required: [true, 'Phải chọn thể loại'] },

    status: {
      type: String,
      enum: { values: DOC_STATUSES, message: 'Trạng thái không hợp lệ: {VALUE}' },
      default: 'draft',
    },

    blocks: { type: [blockSchema], default: [] },
    version: { type: Number, default: 0 },

    // Do hook tính — client gửi lên cũng bị bỏ qua.
    desc: { type: String, default: '' },
    // Toàn bộ chữ trong bài, đã bỏ dấu + chữ thường, để tìm kiếm.
    // `select: false`: không bao giờ trả về client (nặng và vô dụng ở đó).
    searchText: { type: String, default: '', select: false },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      ...toJSON,
      // `select: false` chỉ áp dụng khi TRUY VẤN. Tài liệu vừa tạo/sửa
      // vẫn còn searchText trong bộ nhớ, nên phải gọt thêm ở đây.
      transform(_doc: unknown, ret: Record<string, unknown>) {
        delete ret._id;
        delete ret.searchText;
        return ret;
      },
    },
  },
);

// Đọc field `text` trong props một cách an toàn: props là Mixed (unknown)
// nên phải kiểm tra kiểu trước khi dùng.
function getText(props: unknown): string {
  if (props && typeof props === 'object' && 'text' in props && typeof props.text === 'string') {
    return props.text;
  }
  return '';
}

// Bỏ ký hiệu Markdown để thành chữ thuần:
// "[xem tại đây](http://...)" -> "xem tại đây", "**đậm**" -> "đậm",
// "- mục" / "1. mục" ở đầu dòng -> "mục"
function stripMarkdown(text: string): string {
  return text
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .trim();
}

// Mô tả ngắn = khối văn bản đầu tiên có nội dung.
function buildDesc(blocks: { type?: string | null; props?: unknown }[]): string {
  const first = blocks.find((b) => (b.type === 'paragraph' || b.type === 'step') && getText(b.props).trim());
  const text = stripMarkdown(getText(first?.props)).replace(/\s+/g, ' ');
  return text.length > 160 ? `${text.slice(0, 160)}...` : text;
}

// Gom MỌI chuỗi chữ trong props (text, title, caption, ô bảng, mục
// checklist...), bỏ qua các field không phải nội dung đọc được.
const NON_TEXT_KEYS = new Set(['id', 'src', 'image', 'variant', 'language']);
function collectText(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectText(v, out));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (!NON_TEXT_KEYS.has(key)) collectText(v, out);
    }
  }
}

function buildSearchText(title: string, blocks: { props?: unknown }[]): string {
  const parts = [title];
  blocks.forEach((b) => collectText(b.props, parts));
  return removeDiacritics(stripMarkdown(parts.join(' '))).replace(/\s+/g, ' ');
}

// Slug từ tiêu đề; trùng thì gắn thêm đuôi ngẫu nhiên:
//   "huong-dan-vpn" đã có -> "huong-dan-vpn-3f9a1c"
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  let slug = base;
  // DocumentModel khai báo ở CUỐI file nhưng dùng được: hàm này chỉ CHẠY
  // khi lưu tài liệu, lúc đó cả file đã chạy xong nên biến đã có giá trị.
  while (await DocumentModel.exists({ slug })) {
    slug = `${base}-${randomBytes(3).toString('hex')}`;
  }
  return slug;
}

export type DocumentData = InferSchemaType<typeof documentSchema>;
export type DocumentDoc = HydratedDocument<DocumentData>;

// Thứ tự hook khi gọi save():
//   pre('validate') -> kiểm tra required/enum -> pre('save') -> ghi DB
// Slug phải sinh ở pre('validate'): để ở pre('save') thì bước kiểm tra
// `required` chạy trước và báo thiếu slug.
// Dùng `function` thường (không dùng arrow) vì cần `this` = tài liệu.
documentSchema.pre('validate', async function (this: DocumentDoc) {
  if (!this.slug) this.slug = await uniqueSlug(this.title ?? '');
});

documentSchema.pre('save', function (this: DocumentDoc) {
  this.desc = buildDesc(this.blocks);
  this.searchText = buildSearchText(this.title ?? '', this.blocks);
});

// Đặt tên DocumentModel chứ không phải Document, vì `Document` trùng
// tên với một kiểu có sẵn của TypeScript (trang HTML) — dễ nhầm.
export const DocumentModel = model('Document', documentSchema);
