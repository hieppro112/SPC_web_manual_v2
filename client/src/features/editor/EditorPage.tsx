// ============================================================
// EditorPage — /new và /docs/:slug/edit
// ============================================================
// Trang này chỉ TẢI dữ liệu (tài liệu + thể loại), tải xong mới vẽ
// EditorForm. Nhờ vậy EditorForm khởi tạo state một lần từ dữ liệu đầy đủ,
// không phải xử lý cảnh "dữ liệu tới muộn rồi ghi đè lên chữ đang gõ".
//
// `key={doc.id}`: đổi sang tài liệu khác thì React tạo EditorForm MỚI
// (state sạch), không dùng lại state của tài liệu trước.

import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FileQuestionMark } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { createBlock, withDefaults } from '../../blocks/registry.ts';
import type { DocInput } from '../../lib/types.ts';
import { errorMessage, newId } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useCategories } from '../categories/queries.ts';
import { useDocument } from '../documents/queries.ts';
import EditorForm from './EditorForm.tsx';

export default function EditorPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const categories = useCategories();
  const doc = useDocument(slug);
  useDocumentTitle(slug ? doc.data?.title : t('editor.newDoc'));

  const initial = useMemo<DocInput | null>(() => {
    if (!slug) {
      return {
        title: '',
        // Bấm "Tài liệu mới" khi đang xem một thể loại -> chọn sẵn thể loại đó.
        category: params.get('category') ?? '',
        status: 'draft',
        blocks: [createBlock('paragraph', newId())],
        readingSeconds: null,
      };
    }
    if (!doc.data) return null;
    return {
      title: doc.data.title,
      category: doc.data.category?.id ?? '',
      status: doc.data.status,
      blocks: doc.data.blocks.map(withDefaults),
      readingSeconds: doc.data.readingSeconds ?? null,
    };
    // Chỉ tính khi tài liệu tải xong lần đầu / đổi tài liệu; KHÔNG tính lại
    // khi cache được làm mới sau khi lưu (sẽ không ảnh hưởng vì EditorForm
    // chỉ đọc `initial` lúc khởi tạo).
  }, [slug, doc.data, params]);

  if (categories.isPending || (slug && doc.isPending)) return <Spinner className="py-24" />;

  if (slug && (doc.error || !initial)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          icon={FileQuestionMark}
          title={t('doc.notFound')}
          description={doc.error ? errorMessage(doc.error) : undefined}
          action={
            <Link to="/">
              <Button variant="secondary">{t('notFound.home')}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <EditorForm
      key={doc.data?.id ?? 'new'}
      docId={doc.data?.id}
      initial={initial!}
      categories={categories.data ?? []}
      backTo={slug ? `/docs/${slug}` : '/'}
    />
  );
}
