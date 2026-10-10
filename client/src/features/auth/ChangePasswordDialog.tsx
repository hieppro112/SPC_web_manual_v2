// ChangePasswordDialog — người dùng tự đổi mật khẩu của mình.
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Button from '../../components/ui/Button.tsx';
import Dialog from '../../components/ui/Dialog.tsx';
import Input from '../../components/ui/Input.tsx';
import { errorMessage } from '../../lib/utils.ts';
import { useChangePassword } from './queries.ts';

export default function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={t('nav.changePassword')} className="max-w-sm">
      <ChangePasswordForm onDone={onClose} />
    </Dialog>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const change = useChangePassword();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          toast.success(t('auth.passwordChanged'));
          onDone();
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t('auth.currentPassword')}</span>
        <Input type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t('auth.newPassword')}</span>
        <Input type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(e) => setNew(e.target.value)} />
        <span className="text-xs text-muted">{t('auth.passwordHint')}</span>
      </label>
      {change.error && <p className="text-sm text-danger">{errorMessage(change.error)}</p>}
      <Button type="submit" loading={change.isPending} className="w-full justify-center">
        {t('common.save')}
      </Button>
    </form>
  );
}
