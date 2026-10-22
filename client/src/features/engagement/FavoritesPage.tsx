// ============================================================
// FavoritesPage — Bài tôi yêu thích  (/favorites)
// ============================================================
// Những bài đã thả tim, mới thả trước. Bỏ tim ở trang đọc thì bài biến khỏi đây.
// Chỉ còn bài đọc được (bài bị xóa / chuyển sang bộ phận khác thì tự ẩn).

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { errorMessage } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import DocCard from '../documents/DocCard.tsx';
import { useFavorites } from './queries.ts';

export default function FavoritesPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('engagement.favoritesTitle'));
  const { data, isPending, error } = useFavorites();

  return (
    <div className="mx-auto max-w-page px-4 py-8 lg:px-8">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold">
        <Heart className="h-6 w-6 text-danger" /> {t('engagement.favoritesTitle')}
      </h1>
      <p className="mb-6 text-sm text-muted">{t('engagement.favoritesHint')}</p>
      {isPending ? (
        <Spinner />
      ) : error ? (
        <EmptyState icon={Heart} title={t('common.error')} description={errorMessage(error)} />
      ) : !data.length ? (
        <EmptyState
          icon={Heart}
          title={t('engagement.favoritesEmpty')}
          action={
            <Link to="/">
              <Button variant="secondary">{t('nav.home')}</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data.map((doc) => (
            <DocCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </div>
  );
}
