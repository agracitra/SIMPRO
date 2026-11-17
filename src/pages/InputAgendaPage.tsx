import React, {useMemo, useState} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {ConfirmModal} from '../components/ConfirmModal.tsx';
import {AgendaStatusLabel, AttendanceStatusLabel} from '../components/StatusBadge.tsx';
import {
  formatDateOnlyId,
  formatTimeOnlyId,
  toLocalDateTimeInputValue,
} from '../lib/formatters.ts';
import {clientPermissions} from '../lib/rbac.ts';
import {dataService} from '../services/dataService.ts';
import {
  AGENDA_STATUS_LABELS,
  LEADER_ATTENDANCE_LABELS,
  type AgendaItem,
  type AgendaStatus,
  type AppSettings,
  type LeaderAttendance,
  type LeaderCode,
  type UserProfile,
} from '../types/simpro.ts';

interface InputAgendaPageProps {
  user: UserProfile;
  agendas: AgendaItem[];
  settings: AppSettings;
  isOnline: boolean;
  onAgendasChanged: () => void;
}

interface RowDraft {
  status: AgendaStatus;
  leader_attendance: LeaderAttendance;
  attendance_note: string;
}

export const InputAgendaPage: React.FC<InputAgendaPageProps> = ({
  user,
  agendas,
  settings,
  isOnline,
  onAgendasChanged,
}) => {
  const canCreate = clientPermissions.canManageAgenda(user.role);

  // State form input agenda baru
  const [leader, setLeader] = useState<LeaderCode>('bupati');
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(toLocalDateTimeInputValue());
  const [location, setLocation] = useState('');
  const [pic, setPic] = useState('');
  const [status, setStatus] = useState<AgendaStatus>('terjadwal');
  const [attendance, setAttendance] = useState<LeaderAttendance>('belum_konfirmasi');
  const [attendanceNote, setAttendanceNote] = useState('');
  const [notes, setNotes] = useState('');
  const [docNotes, setDocNotes] = useState('');
  const [approvedForSec, setApprovedForSec] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  // State editor inline Status Agenda & Kehadiran Pimpinan
  const [leaderFilter, setLeaderFilter] = useState<'all' | LeaderCode>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [rowFeedback, setRowFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);

  // Confirm modal jika status diubah menjadi dibatalkan
  const [cancelConfirm, setCancelConfirm] = useState<{
    agenda: AgendaItem;
    draft: RowDraft;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Confirm modal hapus agenda
  const [deleteConfirmAgenda, setDeleteConfirmAgenda] = useState<AgendaItem | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);

  const filteredAgendas = useMemo(() => {
    return agendas.filter((item) => {
      if (leaderFilter !== 'all' && item.leader !== leaderFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q) ||
          item.pic.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [agendas, leaderFilter, searchQuery]);

  const getRowDraft = (item: AgendaItem): RowDraft => {
    return (
      drafts[item.id] || {
        status: item.status,
        leader_attendance: item.leader_attendance || 'belum_konfirmasi',
        attendance_note: item.attendance_note || '',
      }
    );
  };

  const updateRowDraft = (item: AgendaItem, patch: Partial<RowDraft>) => {
    const current = getRowDraft(item);
    const next = {...current, ...patch};
    setDrafts((prev) => ({
      ...prev,
      [item.id]: next,
    }));
    return next;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    if (!startsAt || Number.isNaN(Date.parse(startsAt))) {
      setCreateFeedback({
        tone: 'error',
        message: 'Tanggal dan waktu mulai kegiatan wajib diisi dengan format yang valid.',
      });
      return;
    }
    setCreateFeedback(null);
    setCreating(true);
    try {
      await dataService.createAgenda({
        leader,
        title: title.trim(),
        starts_at: new Date(startsAt).toISOString(),
        location: location.trim(),
        pic: pic.trim(),
        notes: notes.trim(),
        documentation_notes: docNotes.trim(),
        status,
        leader_attendance: attendance,
        attendance_note: attendanceNote.trim(),
        approved_for_security: approvedForSec,
      });
      setTitle('');
      setLocation('');
      setPic('');
      setNotes('');
      setDocNotes('');
      setAttendance('belum_konfirmasi');
      setAttendanceNote('');
      setStatus('terjadwal');
      setCreateFeedback({
        tone: 'success',
        message: 'Agenda baru berhasil disimpan dan dicatat ke riwayat serta notifikasi tim.',
      });
      onAgendasChanged();
    } catch (err) {
      setCreateFeedback({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Gagal menyimpan agenda baru.',
      });
    } finally {
      setCreating(false);
    }
  };

  const persistRowUpdate = async (agenda: AgendaItem, draft: RowDraft, reason?: string) => {
    setSavingRowId(agenda.id);
    setRowFeedback(null);
    try {
      await dataService.updateAgenda(agenda.id, {
        status: draft.status,
        leader_attendance: draft.leader_attendance,
        attendance_note: draft.attendance_note.trim(),
        ...(reason ? {change_reason: reason} : {}),
      });
      setDrafts((prev) => {
        const copy = {...prev};
        delete copy[agenda.id];
        return copy;
      });
      setRowFeedback({
        tone: 'success',
        message: `Status agenda & kehadiran pimpinan untuk "${agenda.title}" berhasil diperbarui.`,
      });
      onAgendasChanged();
    } catch (err) {
      setRowFeedback({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Gagal memperbarui agenda.',
      });
    } finally {
      setSavingRowId(null);
    }
  };

  const handleAutoSaveSelect = (
    agenda: AgendaItem,
    patch: Partial<Pick<RowDraft, 'status' | 'leader_attendance'>>
  ) => {
    const nextDraft = updateRowDraft(agenda, patch);
    if (patch.status === 'dibatalkan' && agenda.status !== 'dibatalkan') {
      setCancelReason('');
      setCancelError(null);
      setCancelConfirm({agenda, draft: nextDraft});
      return;
    }
    persistRowUpdate(agenda, nextDraft);
  };

  const handleAttendanceNoteBlur = (agenda: AgendaItem) => {
    const draft = getRowDraft(agenda);
    if (draft.attendance_note.trim() !== (agenda.attendance_note || '').trim()) {
      persistRowUpdate(agenda, draft);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmAgenda) return;
    const target = deleteConfirmAgenda;
    setDeletingRowId(target.id);
    setRowFeedback(null);
    try {
      await dataService.deleteAgenda(target.id);
      setDeleteConfirmAgenda(null);
      setDrafts((prev) => {
        const copy = {...prev};
        delete copy[target.id];
        return copy;
      });
      setRowFeedback({
        tone: 'success',
        message: `Agenda "${target.title}" berhasil dihapus.`,
      });
      onAgendasChanged();
    } catch (err) {
      setDeleteConfirmAgenda(null);
      setRowFeedback({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Gagal menghapus agenda.',
      });
    } finally {
      setDeletingRowId(null);
    }
  };

  const leaderDisplayName = (code: LeaderCode) =>
    code === 'bupati' ? settings.bupati_display_name : settings.wakil_bupati_display_name;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-[#0F294A] via-[#B45309] to-[#D97706] px-6 py-5 text-white shadow-sm">
        <h2 className="text-xl font-bold tracking-tight text-white">
          Input Agenda, Status & Kehadiran Pimpinan
        </h2>
        <p className="mt-0.5 text-sm text-amber-50">
          Pengisian agenda baru serta pembaruan status agenda dan konfirmasi kehadiran Bupati / Wakil
          Bupati.
        </p>
      </div>

      {/* Seksi 1: Formulir Input Agenda Baru */}
      <section className="overflow-hidden rounded-xl border border-amber-200/80 bg-white shadow-xs">
        <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50/85 via-orange-50/60 to-sky-50/60 px-6 py-4">
          <h3 className="text-base font-bold text-[#0F294A]">Formulir Input Agenda Baru</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Agenda baru dicatat ke riwayat dan dikirimkan sebagai notifikasi internal kepada petugas
            berwenang.
          </p>
        </div>
        <div className="p-6">

        {!canCreate ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
            <div>
              <strong>Kewenangan Input Agenda Baru:</strong> Pengisian agenda baru hanya dilakukan
              oleh <strong>Admin SIMPRO</strong>.{' '}
              {(user.role === 'protokol' ||
                user.role === 'ajudan_bupati' ||
                user.role === 'ajudan_wakil_bupati') && (
                <span>
                  Sebagai{' '}
                  <strong>
                    {user.role === 'protokol'
                      ? 'Tim Protokol'
                      : user.role === 'ajudan_bupati'
                        ? 'Ajudan Bupati'
                        : 'Ajudan Wakil Bupati'}
                  </strong>
                  , Anda berwenang mengedit <strong>Status Agenda</strong> dan{' '}
                  <strong>Kehadiran Pimpinan</strong> pada daftar agenda di bawah.
                </span>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateSubmit} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="inp-leader" className="block text-xs font-medium text-slate-700">
                  Pimpinan
                </label>
                <select
                  id="inp-leader"
                  value={leader}
                  onChange={(e) => setLeader(e.target.value as LeaderCode)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="bupati">{settings.bupati_display_name}</option>
                  <option value="wakil_bupati">{settings.wakil_bupati_display_name}</option>
                </select>
              </div>

              <div>
                <label htmlFor="inp-starts" className="block text-xs font-medium text-slate-700">
                  Tanggal & Jam Mulai
                </label>
                <input
                  id="inp-starts"
                  type="datetime-local"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums"
                />
              </div>

              <div>
                <label htmlFor="inp-status" className="block text-xs font-medium text-slate-700">
                  Status Agenda
                </label>
                <select
                  id="inp-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AgendaStatus)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {Object.entries(AGENDA_STATUS_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="inp-attendance"
                  className="block text-xs font-medium text-slate-700"
                >
                  Kehadiran Pimpinan
                </label>
                <select
                  id="inp-attendance"
                  value={attendance}
                  onChange={(e) => setAttendance(e.target.value as LeaderAttendance)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {Object.entries(LEADER_ATTENDANCE_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="inp-title" className="block text-xs font-medium text-slate-700">
                  Judul Kegiatan (Wajib)
                </label>
                <input
                  id="inp-title"
                  type="text"
                  required
                  minLength={3}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Rapat Koordinasi Evaluasi Program Kerja"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="inp-location" className="block text-xs font-medium text-slate-700">
                  Lokasi Kegiatan (Wajib)
                </label>
                <input
                  id="inp-location"
                  type="text"
                  required
                  minLength={2}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Contoh: Pendopo Kabupaten"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="inp-pic" className="block text-xs font-medium text-slate-700">
                  PIC / Penanggung Jawab
                </label>
                <input
                  id="inp-pic"
                  type="text"
                  value={pic}
                  onChange={(e) => setPic(e.target.value)}
                  placeholder="Contoh: Bagian Protokol Setda"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="inp-att-note"
                  className="block text-xs font-medium text-slate-700"
                >
                  Keterangan Kehadiran / Perwakilan (Opsional)
                </label>
                <input
                  id="inp-att-note"
                  type="text"
                  value={attendanceNote}
                  onChange={(e) => setAttendanceNote(e.target.value)}
                  placeholder="Contoh: Hadir langsung / Diwakilkan Sekretaris Daerah"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="inp-notes" className="block text-xs font-medium text-slate-700">
                  Catatan Protokol
                </label>
                <textarea
                  id="inp-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="inp-doc" className="block text-xs font-medium text-slate-700">
                  Kebutuhan Dokumentasi
                </label>
                <textarea
                  id="inp-doc"
                  rows={2}
                  value={docNotes}
                  onChange={(e) => setDocNotes(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {createFeedback && (
              <div
                className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
                  createFeedback.tone === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                    : 'border-red-200 bg-red-50 text-red-950'
                }`}
              >
                {createFeedback.tone === 'success' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                )}
                <span>{createFeedback.message}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={approvedForSec}
                  onChange={(e) => setApprovedForSec(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Disetujui untuk tampilan Tim Pengamanan
              </label>

              <button
                type="submit"
                disabled={!isOnline || creating}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#0F294A] via-[#1D4ED8] to-[#0284C7] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:brightness-110 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {creating ? 'Menyimpan Agenda...' : 'Simpan Agenda Baru'}
              </button>
            </div>
          </form>
        )}
        </div>
      </section>

      {/* Seksi 2: Edit Status Agenda & Kehadiran Pimpinan */}
      <section className="overflow-hidden rounded-xl border border-sky-200/80 bg-white shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 bg-gradient-to-r from-sky-50/80 via-indigo-50/60 to-amber-50/50 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-[#0F294A]">
              Daftar Input Agenda, Status & Kehadiran Pimpinan
            </h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Perubahan status kegiatan dan kehadiran pimpinan tersimpan otomatis saat diubah.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari agenda..."
                className="rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900"
              />
            </div>

            <select
              aria-label="Filter pimpinan pada edit agenda"
              value={leaderFilter}
              onChange={(e) => setLeaderFilter(e.target.value as 'all' | LeaderCode)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800"
            >
              <option value="all">Semua Pimpinan</option>
              <option value="bupati">{settings.bupati_display_name}</option>
              <option value="wakil_bupati">{settings.wakil_bupati_display_name}</option>
            </select>
          </div>
        </div>

        {rowFeedback && (
          <div
            className={`mx-6 mt-4 flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
              rowFeedback.tone === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                : 'border-red-200 bg-red-50 text-red-950'
            }`}
          >
            {rowFeedback.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
            )}
            <span>{rowFeedback.message}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-sky-200 bg-gradient-to-r from-sky-50 via-indigo-50/70 to-amber-50/60 font-bold text-[#0F294A]">
                <th className="px-4 py-3">Waktu & Pimpinan</th>
                <th className="px-4 py-3">Kegiatan & Lokasi</th>
                <th className="px-4 py-3">Status Agenda</th>
                <th className="px-4 py-3">Kehadiran Pimpinan</th>
                <th className="px-4 py-3">Keterangan Kehadiran / Perwakilan</th>
                <th className="px-4 py-3 text-right">Hapus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAgendas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    Tidak ada agenda yang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredAgendas.map((item) => {
                  const canEditRow = clientPermissions.canEditAgendaStatusAndAttendance(
                    user.role,
                    item.leader
                  );
                  const draft = getRowDraft(item);
                  const saving = savingRowId === item.id;
                  const deleting = deletingRowId === item.id;

                  return (
                    <tr key={item.id} className="align-top transition-colors hover:bg-sky-50/45">
                      <td className="px-4 py-3.5 whitespace-nowrap tabular-nums">
                        <div className="font-mono font-bold text-sky-900">
                          {formatTimeOnlyId(item.starts_at)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatDateOnlyId(item.starts_at)}
                        </div>
                        <div className="mt-1">
                          <span
                            className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                              item.leader === 'bupati'
                                ? 'border-sky-200 bg-sky-50 text-[#0F294A]'
                                : 'border-teal-200 bg-teal-50 text-teal-900'
                            }`}
                          >
                            {leaderDisplayName(item.leader)}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 min-w-[200px]">
                        <div className="font-semibold text-slate-900">{item.title}</div>
                        <div className="mt-0.5 text-slate-600">{item.location}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        {canEditRow ? (
                          <select
                            aria-label={`Status agenda ${item.title}`}
                            disabled={!isOnline || saving || deleting}
                            value={draft.status}
                            onChange={(e) =>
                              handleAutoSaveSelect(item, {status: e.target.value as AgendaStatus})
                            }
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 disabled:bg-slate-100"
                          >
                            {Object.entries(AGENDA_STATUS_LABELS).map(([k, lbl]) => (
                              <option key={k} value={k}>
                                {lbl}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <AgendaStatusLabel status={item.status} />
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        {canEditRow ? (
                          <select
                            aria-label={`Kehadiran pimpinan ${item.title}`}
                            disabled={!isOnline || saving || deleting}
                            value={draft.leader_attendance}
                            onChange={(e) =>
                              handleAutoSaveSelect(item, {
                                leader_attendance: e.target.value as LeaderAttendance,
                              })
                            }
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 disabled:bg-slate-100"
                          >
                            {Object.entries(LEADER_ATTENDANCE_LABELS).map(([k, lbl]) => (
                              <option key={k} value={k}>
                                {lbl}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <AttendanceStatusLabel
                            attendance={item.leader_attendance || 'belum_konfirmasi'}
                          />
                        )}
                      </td>

                      <td className="px-4 py-3.5 min-w-[190px]">
                        {canEditRow ? (
                          <input
                            type="text"
                            aria-label={`Keterangan kehadiran ${item.title}`}
                            disabled={!isOnline || saving || deleting}
                            value={draft.attendance_note}
                            onChange={(e) =>
                              updateRowDraft(item, {attendance_note: e.target.value})
                            }
                            onBlur={() => handleAttendanceNoteBlur(item)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.currentTarget.blur();
                              }
                            }}
                            placeholder="Contoh: Diwakilkan Sekda"
                            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 disabled:bg-slate-100"
                          />
                        ) : (
                          <span className="text-slate-600">{item.attendance_note || '—'}</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        {canCreate ? (
                          <button
                            type="button"
                            disabled={!isOnline || saving || deleting}
                            onClick={() => setDeleteConfirmAgenda(item)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {deleting ? 'Menghapus...' : 'Hapus'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">Khusus Admin</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmModal
        open={Boolean(cancelConfirm)}
        title="Konfirmasi Pembatalan Agenda"
        description={`Anda mengubah status "${cancelConfirm?.agenda.title}" menjadi Dibatalkan. Masukkan alasan pembatalan resmi untuk dicatat di riwayat.`}
        confirmLabel="Ya, Batalkan Agenda"
        tone="danger"
        loading={Boolean(savingRowId)}
        onCancel={() => {
          setCancelError(null);
          setCancelConfirm(null);
        }}
        onConfirm={() => {
          if (!cancelConfirm) return;
          if (cancelReason.trim().length < 3) {
            setCancelError('Alasan pembatalan wajib diisi minimal 3 karakter.');
            return;
          }
          const target = cancelConfirm;
          setCancelError(null);
          setCancelConfirm(null);
          persistRowUpdate(target.agenda, target.draft, cancelReason.trim());
        }}
      >
        <div>
          <label className="block text-xs font-medium text-slate-700">
            Alasan Pembatalan (Wajib min. 3 karakter)
          </label>
          <input
            type="text"
            value={cancelReason}
            onChange={(e) => {
              setCancelReason(e.target.value);
              if (cancelError) setCancelError(null);
            }}
            placeholder="Tuliskan alasan pembatalan"
            className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {cancelError && <p className="mt-1.5 text-xs text-red-700">{cancelError}</p>}
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={Boolean(deleteConfirmAgenda)}
        title="Konfirmasi Hapus Agenda"
        description={`Agenda "${deleteConfirmAgenda?.title}" akan dihapus secara permanen dari daftar agenda beserta riwayat perubahan agenda tersebut.`}
        confirmLabel="Ya, Hapus Agenda"
        tone="danger"
        loading={Boolean(deletingRowId)}
        onCancel={() => setDeleteConfirmAgenda(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
