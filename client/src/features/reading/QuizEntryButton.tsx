// QuizEntryButton — nút "Bài kiểm tra" trên trang đọc: mở danh sách đề CỦA BÀI NÀY.
//   Khách                      -> mời đăng nhập (đăng nhập xong quay lại đúng danh sách)
//   Người dùng chưa đọc đủ     -> khóa, rê chuột thấy lý do
//   Còn lại                    -> /quizzes?doc=<id>
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, Lock } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';

type Props = { docId: string; loggedIn: boolean; locked: boolean };

export default function QuizEntryButton({ docId, loggedIn, locked }: Props) {
  const { t } = useTranslation();
  const target = `/quizzes?doc=${docId}`;

  if (locked) {
    return (
      <Button size="sm" variant="secondary" disabled title={t('reading.lockedHint')}>
        <Lock className="h-4 w-4" /> {t('reading.quizButton')}
      </Button>
    );
  }
  return (
    <Link to={loggedIn ? target : `/login?next=${encodeURIComponent(target)}`} title={loggedIn ? undefined : t('reading.loginHint')}>
      <Button size="sm" variant="secondary">
        <ClipboardCheck className="h-4 w-4" /> {t('reading.quizButton')}
      </Button>
    </Link>
  );
}
