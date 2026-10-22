// LikeButton — nút ❤ trên trang đọc. Khách bấm thì mời đăng nhập (quay lại đúng bài).
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Heart } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import { cn, errorMessage } from '../../lib/utils.ts';
import { useToggleLike } from './queries.ts';

type Props = { docId: string; slug: string; liked: boolean; likes: number; loggedIn: boolean };

export default function LikeButton({ docId, slug, liked, likes, loggedIn }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const toggle = useToggleLike(slug);
  const label = (
    <>
      <Heart className={cn('h-4 w-4', liked && 'fill-danger text-danger')} /> {likes}
    </>
  );

  if (!loggedIn) {
    return (
      <Link to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} title={t('engagement.loginToLike')}>
        <Button size="sm" variant="secondary">
          {label}
        </Button>
      </Link>
    );
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      aria-pressed={liked}
      title={liked ? t('engagement.unlike') : t('engagement.like')}
      onClick={() => toggle.mutate({ docId, liked: !liked }, { onError: (err) => toast.error(errorMessage(err)) })}
    >
      {label}
    </Button>
  );
}
