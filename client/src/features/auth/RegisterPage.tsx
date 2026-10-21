// ============================================================
// RegisterPage — tự đăng ký tài khoản soạn tài liệu  (/register)
// ============================================================
// Đăng ký xong KHÔNG đăng nhập luôn: tài khoản ở trạng thái "chờ duyệt",
// admin duyệt trong trang Quản lý tài khoản thì mới đăng nhập được.

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { MailCheck } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { errorMessage } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import AuthCard from './AuthCard.tsx';
import { useCurrentUser, useRegister, useSetupStatus } from './queries.ts';

const EMPTY = { username: '', displayName: '', email: '', password: '', confirm: '' , employeeCode: ''};

export default function RegisterPage() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const setupStatus = useSetupStatus();
  const register = useRegister();
  const [form, setForm] = useState(EMPTY);
  const [mismatch, setMismatch] = useState(false);
  useDocumentTitle(t('nav.register'));

  if (user) return <Navigate to="/" replace />;
  if (setupStatus.isPending) return <Spinner className="py-24" />;
  // Chưa có admin -> phải tạo admin trước (trang đăng nhập lo việc đó).
  if (setupStatus.data?.needsSetup) return <Navigate to="/login" replace />;

  const domains = setupStatus.data?.allowedEmailDomains ?? [];

  // ---------- Đăng ký xong ----------
  if (register.isSuccess) {
    return (
      <AuthCard title={t('auth.registeredTitle')}>
        <div className="flex flex-col items-center gap-4 text-center">
          <MailCheck className="h-12 w-12 text-success" />
          <p className="text-sm text-muted">{t('auth.registeredDesc')}</p>
          <Link to="/login" className="w-full">
            <Button className="w-full justify-center">{t('auth.backToLogin')}</Button>
          </Link>
        </div>
      </AuthCard>
    );
  }

  const field = (name: keyof typeof EMPTY) => ({
    value: form[name],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [name]: e.target.value })),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Kiểm tra ở client cho nhanh; server vẫn kiểm tra lại mọi thứ khác.
    if (form.password !== form.confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    const { confirm: _confirm, ...data } = form;
    register.mutate(data);
  };

  return (
    <AuthCard
      title={t('auth.registerTitle')}
      description={t('auth.registerDesc')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            {t('nav.login')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('auth.fullName')}</span>
          <Input autoComplete="name" autoFocus required {...field('displayName')} />
        </label>
         {/* Mã nhân viên (EmployeeCode) chỉ chấp nhận số, tối đa 5 ký tự. bắt buộc. */}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('auth.EmployeeCode')}</span>
          <Input autoComplete="name" autoFocus required {...field('employeeCode')} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('auth.email')}</span>
          <Input
            type="email"
            autoComplete="email"
            required
            placeholder={domains[0] ? `ten@${domains[0]}` : undefined}
            {...field('email')}
          />
          {domains.length > 0 && <span className="text-xs text-muted">{t('auth.emailHint', { domains: domains.join(', @') })}</span>}
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('auth.username')}</span>
          <Input
            autoComplete="username"
            required
            // Gợi ý luật ngay trên trình duyệt; server vẫn là nơi kiểm tra chính.
            pattern="[A-Za-z0-9._\-]{3,32}"
            title={t('auth.usernameHint')}
            {...field('username')}
          />
          <span className="text-xs text-muted">{t('auth.usernameHint')}</span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('auth.password')}</span>
          <Input type="password" autoComplete="new-password" required minLength={8} {...field('password')} />
          <span className="text-xs text-muted">{t('auth.passwordHint')}</span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('auth.confirmPassword')}</span>
          <Input type="password" autoComplete="new-password" required {...field('confirm')} />
        </label>

        {(mismatch || register.error) && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {mismatch ? t('auth.passwordMismatch') : errorMessage(register.error)}
          </p>
        )}

        <Button type="submit" loading={register.isPending} className="w-full justify-center">
          {t('auth.registerSubmit')}
        </Button>
      </form>
    </AuthCard>
  );
}
