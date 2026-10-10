// ============================================================
// LoginPage — đăng nhập, hoặc tạo admin đầu tiên nếu DB còn trống
// ============================================================
// Sau khi đăng nhập quay về trang người dùng định vào (?next=/docs/abc/edit).
// Đăng nhập bằng tên đăng nhập HOẶC email (server tự nhận ra).

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { ApiError } from '../../lib/http.ts';
import { errorMessage } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import AuthCard from './AuthCard.tsx';
import { useCurrentUser, useLogin, useSetup, useSetupStatus } from './queries.ts';

// Chỉ cho quay về đường dẫn NỘI BỘ: ?next=https://trang-lạ.com sẽ bị bỏ,
// tránh link đăng nhập bị lợi dụng để dẫn người dùng sang web giả mạo.
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const user = useCurrentUser();
  const setupStatus = useSetupStatus();
  const login = useLogin();
  const setup = useSetup();
  const [form, setForm] = useState({ username: '', password: '', displayName: '' });
  useDocumentTitle(t('nav.login'));

  if (user) return <Navigate to={next} replace />;
  if (setupStatus.isPending) return <Spinner className="py-24" />;

  const needsSetup = setupStatus.data?.needsSetup;
  const mutation = needsSetup ? setup : login;
  // 403 = đúng mật khẩu nhưng tài khoản chưa được duyệt -> hiện màu cảnh báo, không phải lỗi.
  const waitingApproval = mutation.error instanceof ApiError && mutation.error.status === 403;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const onSuccess = () => navigate(next, { replace: true });
    if (needsSetup) setup.mutate(form, { onSuccess });
    else login.mutate({ username: form.username, password: form.password }, { onSuccess });
  };

  // Hàm tạo onChange cho từng ô: field('username') -> (e) => setForm(...)
  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [name]: e.target.value })),
  });

  return (
    <AuthCard
      title={needsSetup ? t('auth.setupTitle') : t('auth.loginTitle')}
      description={needsSetup ? t('auth.setupDesc') : t('auth.viewerNote')}
      footer={
        !needsSetup && (
          <>
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="font-medium text-accent hover:underline">
              {t('nav.register')}
            </Link>
          </>
        )
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{needsSetup ? t('auth.username') : t('auth.usernameOrEmail')}</span>
          <Input autoComplete="username" autoFocus required {...field('username')} />
        </label>
        {needsSetup && (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t('auth.displayName')}</span>
            <Input required {...field('displayName')} />
          </label>
        )}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('auth.password')}</span>
          <Input
            type="password"
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            required
            minLength={needsSetup ? 8 : undefined}
            {...field('password')}
          />
          {needsSetup && <span className="text-xs text-muted">{t('auth.passwordHint')}</span>}
        </label>

        {mutation.error && (
          <p
            role="alert"
            className={
              waitingApproval
                ? 'rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning'
                : 'rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger'
            }
          >
            {errorMessage(mutation.error)}
          </p>
        )}

        <Button type="submit" loading={mutation.isPending} className="w-full justify-center">
          {needsSetup ? t('auth.setupSubmit') : t('auth.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
