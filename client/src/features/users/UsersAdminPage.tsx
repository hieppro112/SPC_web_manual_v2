// ============================================================
// UsersAdminPage — admin quản lý tài khoản  (/admin/users)
// ============================================================
//   1. Chờ duyệt   — người tự đăng ký: chọn quyền + Duyệt, hoặc Từ chối
//   2. Tạo tài khoản mới (admin tạo thì dùng được ngay)
//   3. Đang hoạt động — đổi quyền, đặt lại mật khẩu, xóa

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, KeyRound, Trash, UserPlus, X } from 'lucide-react';
import Badge from '../../components/ui/Badge.tsx';
import Button from '../../components/ui/Button.tsx';
import Dialog from '../../components/ui/Dialog.tsx';
import Input from '../../components/ui/Input.tsx';
import Select from '../../components/ui/Select.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import type { Role, User } from '../../lib/types.ts';
import { errorMessage, formatDate, formatDateTime } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useCompleteOnMount } from '../guide/queries.ts';
import { useCurrentUser } from '../auth/queries.ts';
import { useApproveUser, useCreateUser, useDeleteUser, useUpdateUser, useUsers } from './queries.ts';

export default function UsersAdminPage() {
  const { t, i18n } = useTranslation();
  const me = useCurrentUser();
  const { data: users, isPending } = useUsers();
  const update = useUpdateUser();
  const remove = useDeleteUser();
  const [resetFor, setResetFor] = useState<User | null>(null);
  useDocumentTitle(t('users.title'));
  useCompleteOnMount('adminUsers');

  const pendingUsers = users?.filter((u) => u.status === 'pending') ?? [];
  const activeUsers = users?.filter((u) => u.status !== 'pending') ?? [];

  const changeRole = (user: User, role: Role) =>
    update.mutate(
      { id: user.id, data: { role } },
      { onSuccess: () => toast.success(t('users.updated')), onError: (err) => toast.error(errorMessage(err)) },
    );

  const onDelete = (user: User) => {
    if (!window.confirm(t('users.deleteConfirm', { name: user.displayName }))) return;
    remove.mutate(user.id, { onSuccess: () => toast.success(t('users.deleted')), onError: (err) => toast.error(errorMessage(err)) });
  };

  return (
    <div className="mx-auto max-w-form space-y-8 px-4 py-8">
      <div>
        <h1 className="mb-2 text-2xl font-bold">{t('users.title')}</h1>
        <p className="text-sm text-muted">{t('users.roleHint')}</p>
      </div>

      {isPending ? (
        <Spinner />
      ) : (
        <>
          {pendingUsers.length > 0 && (
            <section className="rounded-2xl border border-warning/40 bg-warning-soft p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                {t('users.pendingTitle')} <Badge tone="warning">{pendingUsers.length}</Badge>
              </h2>
              <p className="mb-3 text-sm text-muted">{t('users.pendingHint')}</p>
              <ul className="space-y-2">
                {pendingUsers.map((u) => (
                  // key = id: mỗi dòng giữ lựa chọn quyền riêng của nó.
                  <PendingRow key={u.id} user={u} locale={i18n.language} />
                ))}
              </ul>
            </section>
          )}

          <NewUserForm />

          <section>
            <h2 className="mb-3 font-semibold">{t('users.activeTitle')}</h2>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">{t('users.displayName')}</th>
                    <th className="px-4 py-2.5 font-semibold">{t('users.username')}</th>
                    <th className="px-4 py-2.5 font-semibold">{t('users.role')}</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {activeUsers.map((u) => (
                    <tr key={u.id} className="border-t border-border">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">
                          {u.displayName} {u.id === me?.id && <span className="text-muted">({t('users.you')})</span>}
                        </p>
                        <p className="text-xs text-muted">{u.email || formatDate(u.createdAt, i18n.language)}</p>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{u.username}</td>
                      <td className="px-4 py-2.5">
                        <Select value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)} className="h-8 w-32">
                          <option value="user">{t('users.user')}</option>
                          <option value="editor">{t('users.editor')}</option>
                          <option value="admin">{t('users.admin')}</option>
                        </Select>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setResetFor(u)} title={t('users.resetPassword')}>
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          {u.id !== me?.id && (
                            <Button size="sm" variant="ghost" className="text-danger" onClick={() => onDelete(u)} title={t('common.delete')}>
                              <Trash className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <Dialog open={!!resetFor} onClose={() => setResetFor(null)} title={t('users.resetPassword')} className="max-w-sm">
        {resetFor && <ResetPasswordForm user={resetFor} onDone={() => setResetFor(null)} />}
      </Dialog>
    </div>
  );
}

function PendingRow({ user, locale }: { user: User; locale: string }) {
  const { t } = useTranslation();
  const approve = useApproveUser();
  const remove = useDeleteUser();
  const [role, setRole] = useState<Role>('user');

  const onApprove = () =>
    approve.mutate(
      { id: user.id, role },
      { onSuccess: () => toast.success(t('users.approved')), onError: (err) => toast.error(errorMessage(err)) },
    );

  const onReject = () => {
    if (!window.confirm(t('users.rejectConfirm', { name: user.displayName }))) return;
    remove.mutate(user.id, { onSuccess: () => toast.success(t('users.rejected')), onError: (err) => toast.error(errorMessage(err)) });
  };

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {user.displayName} <span className="font-mono text-xs text-muted">@{user.username}</span>
        </p>
        <p className="truncate text-xs text-muted">
          {user.email} · {t('users.registeredAt', { date: formatDateTime(user.createdAt, locale) })}
        </p>
      </div>
      <Select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-8 w-32" aria-label={t('users.role')}>
        <option value="user">{t('users.user')}</option>
        <option value="editor">{t('users.editor')}</option>
        <option value="admin">{t('users.admin')}</option>
      </Select>
      <Button size="sm" onClick={onApprove} loading={approve.isPending}>
        <Check className="h-4 w-4" /> {t('users.approve')}
      </Button>
      <Button size="sm" variant="ghost" className="text-danger" onClick={onReject} loading={remove.isPending}>
        <X className="h-4 w-4" /> {t('users.reject')}
      </Button>
    </li>
  );
}

function NewUserForm() {
  const { t } = useTranslation();
  const create = useCreateUser();
  const empty = { username: '', displayName: '', email: '', password: '', role: 'user' as Role };
  const [form, setForm] = useState(empty);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(form, {
      onSuccess: () => {
        toast.success(t('users.created'));
        setForm(empty);
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">{t('users.newUser')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          required
          placeholder={t('users.username')}
          autoComplete="off"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
        />
        <Input required placeholder={t('users.displayName')} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <Input
          type="email"
          placeholder={t('users.emailOptional')}
          autoComplete="off"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          required
          type="password"
          minLength={8}
          autoComplete="new-password"
          placeholder={`${t('users.password')} (${t('auth.passwordHint')})`}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          <option value="user">{t('users.user')}</option>
          <option value="editor">{t('users.editor')}</option>
          <option value="admin">{t('users.admin')}</option>
        </Select>
      </div>
      <Button type="submit" loading={create.isPending}>
        <UserPlus className="h-4 w-4" /> {t('common.create')}
      </Button>
    </form>
  );
}

function ResetPasswordForm({ user, onDone }: { user: User; onDone: () => void }) {
  const { t } = useTranslation();
  const update = useUpdateUser();
  const [password, setPassword] = useState('');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate(
      { id: user.id, data: { password } },
      {
        onSuccess: () => {
          toast.success(t('users.updated'));
          onDone();
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm">{t('users.resetPrompt', { name: user.displayName })}</p>
      <Input type="password" required minLength={8} autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      {update.error && <p className="text-sm text-danger">{errorMessage(update.error)}</p>}
      <Button type="submit" loading={update.isPending} className="w-full justify-center">
        {t('common.save')}
      </Button>
    </form>
  );
}
