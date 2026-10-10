// RouteError — hiện khi một trang bị lỗi lúc vẽ (thay cho màn hình trắng).
// Gắn vào `errorElement` của route trong router.tsx.
// 🔸 Flutter: giống ErrorWidget.builder.
import { Link, useRouteError } from 'react-router';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
import Button from '../components/ui/Button.tsx';
import EmptyState from '../components/ui/EmptyState.tsx';
import { errorMessage } from '../lib/utils.ts';

export default function RouteError() {
  const error = useRouteError();
  const { t } = useTranslation();
  console.error(error);
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        icon={TriangleAlert}
        title={t('common.error')}
        description={errorMessage(error)}
        action={
          <Link to="/" reloadDocument>
            <Button variant="secondary">{t('notFound.home')}</Button>
          </Link>
        }
      />
    </div>
  );
}
