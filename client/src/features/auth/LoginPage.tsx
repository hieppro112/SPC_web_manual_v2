// ============================================================
// LoginPage — đăng nhập, hoặc tạo admin đầu tiên nếu DB còn trống
// ============================================================
// Sau khi đăng nhập quay về trang người dùng định vào (?next=/docs/abc/edit).

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Input from '../../components/ui/Input.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import { errorMessage } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
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
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-fg">
            <BookOpen className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">{needsSetup ? t('auth.setupTitle') : t('auth.loginTitle')}</h1>
          <p className="mt-1 text-sm text-muted">{needsSetup ? t('auth.setupDesc') : t('auth.viewerNote')}</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t('auth.username')}</span>
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

        {mutation.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{errorMessage(mutation.error)}</p>}

        <Button type="submit" loading={mutation.isPending} className="w-full justify-center">
          {needsSetup ? t('auth.setupSubmit') : t('auth.submit')}
        </Button>
      </form>
    </div>
  );
}
