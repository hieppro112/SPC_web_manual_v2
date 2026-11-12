// QuizEntryButton — nút "Bài kiểm tra" trên trang đọc: mở danh sách đề CỦA BÀI NÀY.
//   Khách                      -> mời đăng nhập (đăng nhập xong quay lại đúng danh sách)
//   Người dùng chưa đọc đủ     -> khóa, rê chuột thấy lý do
//   Còn lại                    -> /quizzes?doc=<id>
// Nút màu nhấn (primary) để nổi hơn các nút Chia sẻ / In bên cạnh.
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Lock } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';

type Props = { docId: string; loggedIn: boolean; locked: boolean; size?: 'sm' | 'md'; count?: number };

export default function QuizEntryButton({ docId, loggedIn, locked, size = 'sm', count }: Props) {
  const { t } = useTranslation();
  const target = `/quizzes?doc=${docId}`;
  // Số đề của bài (nếu biết) hiện thành "chip" nhỏ trong nút: "Bài kiểm tra  2".
  const badge = count ? <span className="rounded-full bg-accent-fg/20 px-1.5 text-xs font-semibold">{count}</span> : null;

  if (locked) {
    return (
      <Button size={size} variant="secondary" disabled title={t('reading.lockedHint')}>
        <Lock className="h-4 w-4" /> {t('reading.quizButton')}
      </Button>
    );
  }
  return (
    <Link to={loggedIn ? target : `/login?next=${encodeURIComponent(target)}`} title={loggedIn ? undefined : t('reading.loginHint')}>
      <Button size={size}>
        <ClipboardCheck className="h-4 w-4" /> {t('reading.quizButton')} {badge}
      </Button>
    </Link>
  );
}
