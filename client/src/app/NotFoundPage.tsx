import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { MapPinOff } from 'lucide-react';
import Button from '../components/ui/Button.tsx';
import EmptyState from '../components/ui/EmptyState.tsx';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <EmptyState
        icon={MapPinOff}
        title={t('notFound.title')}
        description={t('notFound.desc')}
        action={
          <Link to="/">
            <Button variant="secondary">{t('notFound.home')}</Button>
          </Link>
        }
      />
    </div>
  );
}
