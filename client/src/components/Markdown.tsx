// ============================================================
// Markdown — hiển thị văn bản có định dạng (**đậm**, [link](...), danh sách)
// ============================================================
// react-markdown biến Markdown thành phần tử React — KHÔNG dùng
// dangerouslySetInnerHTML, nên người soạn gõ <script> cũng chỉ hiện ra chữ,
// không chạy được. Link "javascript:..." cũng bị nó tự loại bỏ.

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils.ts';

export default function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('doc-prose prose max-w-none prose-p:my-2 prose-li:my-0.5', className)}>
      <ReactMarkdown
        // remark-gfm: thêm cú pháp kiểu GitHub — ~~gạch~~, bảng, link tự nhận.
        remarkPlugins={[remarkGfm]}
        components={{
          // Link ra ngoài mở tab mới để người đọc không mất trang tài liệu.
          a: ({ href, children }) => {
            const external = href?.startsWith('http');
            return (
              <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}>
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
