import React, {useEffect, useState} from 'react';
import {AlertCircle, CheckCircle2, KeyRound, UserPlus} from 'lucide-react';
import {formatDateTimeId} from '../lib/formatters.ts';
import {dataService} from '../services/dataService.ts';
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type UserProfile,
  type UserRole,
} from '../types/simpro.ts';

interface UsersAdminPageProps {
  currentUser: UserProfile;
  isOnline: boolean;
}

export const UsersAdminPage: React.FC<UsersAdminPageProps> = ({currentUser, isOnline}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Create form
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('protokol');
  const [saving, setSaving] = useState(false);

  // Reset password modal
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await dataService.fetchUsers();
      setUsers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar pengguna.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOnline) {
      loadUsers();
    } else {
      setLoading(false);
    }
  }, [isOnline]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      await dataService.createUser({
        full_name: fullName,
        email,
        password,
        role,
        is_active: true,
      });
      setCreateOpen(false);
      setFullName('');
      setEmail('');
      setPassword('');
      setFeedback('Akun individual baru berhasil dibuat dan dicatat pada audit log.');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat akun pengguna.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeRole = async (target: UserProfile, nextRole: UserRole) => {
    setError(null);
    setFeedback(null);
    try {
      await dataService.updateUser(target.id, {role: nextRole});
      setFeedback(`Role ${target.full_name} diperbarui menjadi ${ROLE_LABELS[nextRole]}.`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui role.');
    }
  };

  const handleToggleActive = async (target: UserProfile) => {
    setError(null);
    setFeedback(null);
    try {
      await dataService.updateUser(target.id, {is_active: !target.is_active});
      setFeedback(
        `Akun ${target.full_name} berhasil ${!target.is_active ? 'diaktifkan' : 'dinonaktifkan (histori tetap tersimpan)'}.`
      );
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status aktif akun.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setSaving(true);
    setError(null);
    try {
      await dataService.updateUser(resetTarget.id, {new_password: newPassword});
      setFeedback(`Kata sandi baru untuk ${resetTarget.full_name} berhasil ditetapkan.`);
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyetel ulang kata sandi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-fuchsia-200/80 bg-gradient-to-r from-[#0F294A] via-[#701A75] to-[#A21CAF] px-6 py-5 text-white shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Manajemen Pengguna & Hak Akses (RBAC)
          </h2>
          <p className="mt-0.5 text-sm text-fuchsia-100">
            Setiap petugas wajib menggunakan akun individual. Penonaktifan akun menjaga keutuhan
            jejak histori.
          </p>
        </div>

        <button
          type="button"
          disabled={!isOnline}
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-xs hover:bg-amber-300 disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Buat Akun Baru
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Tabel Pengguna */}
      <div className="overflow-hidden rounded-xl border border-fuchsia-200/80 bg-white shadow-xs">
        {loading ? (
          <div className="px-6 py-10 text-center text-xs text-slate-500">
            Memuat daftar akun...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 via-indigo-50/70 to-sky-50/70 font-bold text-[#0F294A]">
                  <th className="px-4 py-3">Nama Lengkap & Email</th>
                  <th className="px-4 py-3">Role / Kewenangan</th>
                  <th className="px-4 py-3">Status Akun</th>
                  <th className="px-4 py-3">Dibuat</th>
                  <th className="px-4 py-3 text-right">Pengelolaan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-900">
                          {u.full_name} {isSelf ? '(Anda)' : ''}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <select
                          aria-label={`Ubah role ${u.full_name}`}
                          disabled={isSelf || !isOnline}
                          value={u.role}
                          onChange={(e) => handleChangeRole(u, e.target.value as UserRole)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          {Object.entries(ROLE_LABELS).map(([k, lbl]) => (
                            <option key={k} value={k}>
                              {lbl}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
                            u.is_active
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                              : 'border-red-200 bg-red-50 text-red-900'
                          }`}
                        >
                          {u.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDateTimeId(u.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!isOnline}
                            onClick={() => {
                              setResetTarget(u);
                              setNewPassword('');
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                            Reset Sandi
                          </button>

                          <button
                            type="button"
                            disabled={isSelf || !isOnline}
                            onClick={() => handleToggleActive(u)}
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${
                              u.is_active
                                ? 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                            }`}
                          >
                            {u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Referensi Matriks Kewenangan */}
      <div className="rounded-xl border border-indigo-200/80 bg-white p-5 shadow-xs">
        <h3 className="text-sm font-bold text-[#0F294A]">Matriks Kewenangan Role v1.0</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(ROLE_LABELS) as UserRole[]).map((r, idx) => {
            const palette = [
              'border-indigo-200 bg-indigo-50/60',
              'border-sky-200 bg-sky-50/60',
              'border-teal-200 bg-teal-50/60',
              'border-amber-200 bg-amber-50/60',
              'border-violet-200 bg-violet-50/60',
              'border-rose-200 bg-rose-50/60',
              'border-emerald-200 bg-emerald-50/60',
            ][idx % 7];
            return (
              <div key={r} className={`rounded-lg border p-3 text-xs ${palette}`}>
                <div className="font-bold text-[#0F294A]">{ROLE_LABELS[r]}</div>
                <p className="mt-1 text-slate-700">{ROLE_DESCRIPTIONS[r]}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Buat Akun Baru */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-[#0F294A]">Buat Akun Individual Baru</h3>
            <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Email Dinas</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Role Pengguna</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {Object.entries(ROLE_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Kata Sandi Awal (min. 8 karakter)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white"
                >
                  {saving ? 'Menyimpan...' : 'Buat Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reset Kata Sandi */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-[#0F294A]">Setel Ulang Kata Sandi</h3>
            <p className="mt-1 text-xs text-slate-600">
              Akun: <strong>{resetTarget.full_name}</strong> ({resetTarget.email})
            </p>
            <form onSubmit={handleResetPassword} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Kata Sandi Baru (min. 8 karakter)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0F294A] px-3.5 py-2 text-xs font-semibold text-white"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Sandi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
