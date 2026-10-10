// ============================================================
// Document.ts — Model tài liệu
// ============================================================
// Sửa 3 lỗi thiết kế của bản cũ:
//   1. `category` lưu ObjectId tham chiếu, KHÔNG lưu tên
//      -> đổi tên thể loại thì mọi tài liệu tự thấy tên mới.
//   2. `desc` tính ở MỘT chỗ duy nhất (hook pre-save bên dưới)
//      -> bản cũ tính 2 kiểu khác nhau ở POST và PUT.
//   3. Có kiểu TypeScript suy ra từ schema.
//
// Thêm ở bước 1 (sau khi chốt yêu cầu sản phẩm):
//   4. Khối lưu `props` (object) thay cho `content` (chuỗi)
//      -> mỗi loại khối tự có dữ liệu riêng: ảnh có caption, bảng có rows...
//   5. `slug` — đoạn URL đẹp để chia sẻ link
//   6. `status` — nháp / đã xuất bản, khách chỉ thấy bài đã xuất bản

import { randomBytes } from 'node:crypto';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { toJSON } from './toJSON.ts';
import { slugify } from '../utils/slugify.ts';

// Mọi loại khối app hỗ trợ. Thêm loại mới thì thêm vào đây (server) và
// thêm một thư mục trong registry ở client (bước 5).
// `as const` khiến TS hiểu đây là đúng các chuỗi này, không phải string[].
export const BLOCK_TYPES = [
  'heading', // { text, level: 2 | 3 }
  'paragraph', // { text }                 — Markdown nhẹ
  'image', // { src, alt, caption }
  'video', // { src, caption }
  'file', // { src, name, size }
  'table', // { header: boolean, rows: string[][] }
  'callout', // { variant: 'info' | 'success' | 'warning' | 'danger', text }
  'code', // { language, code }
  'checklist', // { items: { id, text }[] }
  'divider', // {}
  'step', // { title, text, image }      — "Bước 1, 2, 3..." tự đánh số
] as const;

export const DOC_STATUSES = ['draft', 'published'] as const;

// Schema con: nhúng bên trong tài liệu, không phải collection riêng.
const blockSchema = new Schema(
  {
    id: { type: String, required: true }, // id do client tự sinh, để React làm `key`
    type: {
      type: String,
      // {VALUE} được Mongoose thay bằng giá trị sai mà client gửi lên.
      enum: { values: BLOCK_TYPES, message: 'Loại khối không hợp lệ: {VALUE}' },
      required: true,
    },
    // Mixed = "object hình dạng gì cũng được". Mỗi loại khối có props
    // khác nhau nên tầng DB không ép khuôn; kiểm tra chi tiết từng loại
    // sẽ làm bằng zod ở bước 5, cùng lúc với registry.
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
    title: { type: String, required: [true, 'Tiêu đề không được để trống'], trim: true },

    // Sinh tự động từ title lúc TẠO (hook pre('validate') bên dưới) và
    // GIỮ NGUYÊN khi sửa title — link đã chia sẻ không bị gãy.
    // `unique` tạo index trong MongoDB: hai bài trùng slug thì DB từ chối
    // (errorHandler đổi thành 409).
    slug: { type: String, required: true, unique: true },

    // THAM CHIẾU (reference): chỉ lưu id của thể loại.
    // `ref: 'Category'` cho Mongoose biết id này trỏ tới model nào, để
    // sau này gọi .populate('category') là nó tự thay id bằng object
    // thể loại đầy đủ. 🔸 Giống foreign key + JOIN bên SQL.
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: [true, 'Phải chọn thể loại'] },

    status: {
      type: String,
      enum: { values: DOC_STATUSES, message: 'Trạng thái không hợp lệ: {VALUE}' },
      default: 'draft',
    },

    // Không cho client gửi — luôn do hook bên dưới tính.
    desc: { type: String, default: '' },
    blocks: { type: [blockSchema], default: [] },
  },
  { timestamps: true, toJSON },
);

// Đọc field `text` trong props một cách an toàn: props là Mixed (unknown)
// nên phải kiểm tra kiểu trước khi dùng.
function getText(props: unknown): string {
  if (props && typeof props === 'object' && 'text' in props && typeof props.text === 'string') {
    return props.text;
  }
  return '';
}

// Tạo mô tả ngắn từ khối văn bản đầu tiên có nội dung.
// Tách thành hàm riêng để dễ đọc và dễ test.
function buildDesc(blocks: { type?: string | null; props?: unknown }[]): string {
  const first = blocks.find((b) => (b.type === 'paragraph' || b.type === 'step') && getText(b.props).trim());
  const text = getText(first?.props)
    // Bỏ ký hiệu Markdown để mô tả là chữ thuần:
    // "[xem tại đây](http://...)" -> "xem tại đây", "**đậm**" -> "đậm"
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .trim();
  return text.length > 160 ? `${text.slice(0, 160)}...` : text;
}

// Slug từ tiêu đề; trùng thì gắn thêm đuôi ngẫu nhiên:
//   "huong-dan-vpn" đã có -> "huong-dan-vpn-3f9a1c"
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  let slug = base;
  // Dùng DocumentModel ở đây dù nó được khai báo ở CUỐI file: hàm này chỉ
  // CHẠY khi lưu tài liệu, lúc đó cả file đã chạy xong nên biến đã có giá trị.
  while (await DocumentModel.exists({ slug })) {
    slug = `${base}-${randomBytes(3).toString('hex')}`;
  }
  return slug;
}

export type DocumentData = InferSchemaType<typeof documentSchema>;

// HOOK (middleware của Mongoose): hàm tự chạy TRƯỚC một thao tác.
// `this` ở đây chính là tài liệu sắp được lưu — vì vậy phải dùng
// `function` thường, KHÔNG dùng arrow function (arrow không có `this`
// riêng). 🔸 Dart không có khác biệt này — đây là "bẫy" riêng của JS.
//
// `this: HydratedDocument<DocumentData>` KHÔNG phải tham số thật — đó là
// cú pháp TS để khai báo kiểu của `this`. Thiếu nó, TS coi `this` là
// `unknown` và cấm đọc this.blocks. (HydratedDocument = dữ liệu thuần +
// các hàm của Mongoose như save(), populate()...)

// Slug phải sinh ở pre('validate'), KHÔNG phải pre('save'): Mongoose kiểm
// tra `required` TRƯỚC khi chạy pre('save'), lúc đó slug còn trống thì
// báo lỗi "slug is required" ngay.
//   save() -> pre('validate') -> kiểm tra schema -> pre('save') -> ghi DB
documentSchema.pre('validate', async function (this: HydratedDocument<DocumentData>) {
  if (!this.slug) this.slug = await uniqueSlug(this.title ?? '');
});

// Nhờ hook này, dù tạo mới hay sửa, desc luôn được tính theo đúng một cách.
documentSchema.pre('save', function (this: HydratedDocument<DocumentData>) {
  this.desc = buildDesc(this.blocks);
});

// Đặt tên DocumentModel chứ không phải Document, vì `Document` trùng
// tên với một kiểu có sẵn của TypeScript (trang HTML) — dễ nhầm.
export const DocumentModel = model('Document', documentSchema);
