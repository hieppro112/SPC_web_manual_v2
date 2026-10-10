// ============================================================
// UsersAdminPage — admin quản lý tài khoản editor/admin  (/admin/users)
// ============================================================

import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { KeyRound, Trash, UserPlus } from 'lucide-react';
import Button from '../../components/ui/Button.tsx';
import Dialog from '../../components/ui/Dialog.tsx';
import Input from '../../components/ui/Input.tsx';
import Select from '../../components/ui/Select.tsx';
import Spinner from '../../components/ui/Spinner.tsx';
import type { Role, User } from '../../lib/types.ts';
import { errorMessage, formatDate } from '../../lib/utils.ts';
import { useDocumentTitle } from '../../lib/useDocumentTitle.ts';
import { useCurrentUser } from '../auth/queries.ts';
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from './queries.ts';

export default function UsersAdminPage() {
  const { t, i18n } = useTranslation();
  const me = useCurrentUser();
  const { data: users, isPending } = useUsers();
  const update = useUpdateUser();
  const remove = useDeleteUser();
  const [resetFor, setResetFor] = useState<User | null>(null);
  useDocumentTitle(t('users.title'));

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
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">{t('users.title')}</h1>
      <p className="mb-6 text-sm text-muted">{t('users.roleHint')}</p>
      <NewUserForm />

      {isPending ? (
        <Spinner />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
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
              {users?.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">
                      {u.displayName} {u.id === me?.id && <span className="text-muted">({t('users.you')})</span>}
                    </p>
                    <p className="text-xs text-muted">{formatDate(u.createdAt, i18n.language)}</p>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{u.username}</td>
                  <td className="px-4 py-2.5">
                    <Select value={u.role} onChange={(e) => changeRole(u, e.target.value as Role)} className="h-8 w-32">
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
      )}

      <Dialog open={!!resetFor} onClose={() => setResetFor(null)} title={t('users.resetPassword')} className="max-w-sm">
        {resetFor && <ResetPasswordForm user={resetFor} onDone={() => setResetFor(null)} />}
      </Dialog>
    </div>
  );
}

function NewUserForm() {
  const { t } = useTranslation();
  const create = useCreateUser();
  const empty = { username: '', displayName: '', password: '', role: 'editor' as Role };
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
          required
          type="password"
          minLength={8}
          autoComplete="new-password"
          placeholder={`${t('users.password')} (${t('auth.passwordHint')})`}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
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
