import React, {useMemo, useState} from 'react';
import {
  Calendar,
  Edit3,
  History,
  List,
  Plus,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {ConfirmModal} from '../components/ConfirmModal.tsx';
import {AgendaStatusLabel, AttendanceStatusLabel} from '../components/StatusBadge.tsx';
import {
  formatDateOnlyId,
  formatDateTimeId,
  formatTimeOnlyId,
  isSameLocalDate,
  toLocalDateInputValue,
  toLocalDateTimeInputValue,
} from '../lib/formatters.ts';
import {clientPermissions} from '../lib/rbac.ts';
import {dataService} from '../services/dataService.ts';
import {
  AGENDA_STATUS_LABELS,
  LEADER_ATTENDANCE_LABELS,
  type AgendaHistoryItem,
  type AgendaItem,
  type AgendaStatus,
  type AppSettings,
  type LeaderAttendance,
  type LeaderCode,
  type UserProfile,
} from '../types/simpro.ts';

interface AgendaPageProps {
  user: UserProfile;
  agendas: AgendaItem[];
  settings: AppSettings;
  isOnline: boolean;
  onAgendasChanged: () => void;
}

type ViewMode = 'list' | 'daily' | 'weekly';

export const AgendaPage: React.FC<AgendaPageProps> = ({
  user,
  agendas,
  settings,
  isOnline,
  onAgendasChanged,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [leaderFilter, setLeaderFilter] = useState<'all' | LeaderCode>('all');
  const [selectedDate, setSelectedDate] = useState<string>(toLocalDateInputValue(new Date()));
  const [statusFilter, setStatusFilter] = useState<'all' | AgendaStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingAgenda, setEditingAgenda] = useState<AgendaItem | null>(null);
  const [formLeader, setFormLeader] = useState<LeaderCode>('bupati');
  const [formTitle, setFormTitle] = useState('');
  const [formStartsAt, setFormStartsAt] = useState(toLocalDateTimeInputValue());
  const [formLocation, setFormLocation] = useState('');
  const [formPic, setFormPic] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formDocNotes, setFormDocNotes] = useState('');
  const [formStatus, setFormStatus] = useState<AgendaStatus>('terjadwal');
  const [formApprovedSec, setFormApprovedSec] = useState(true);
  const [changeReason, setChangeReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Confirm modal untuk perubahan agenda penting / pembatalan
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    mode: 'edit' | 'cancel';
    agenda: AgendaItem | null;
  }>({open: false, mode: 'edit', agenda: null});

  // Modal catatan dokumentasi (khusus Tim Dokumentasi)
  const [docModalAgenda, setDocModalAgenda] = useState<AgendaItem | null>(null);
  const [docNoteDraft, setDocNoteDraft] = useState('');
  const [docModalError, setDocModalError] = useState<string | null>(null);

  // Modal edit status kegiatan & kehadiran pimpinan (Tim Protokol / Ajudan)
  const [statusModalAgenda, setStatusModalAgenda] = useState<AgendaItem | null>(null);
  const [statusDraft, setStatusDraft] = useState<AgendaStatus>('terjadwal');
  const [attendanceDraft, setAttendanceDraft] = useState<LeaderAttendance>('belum_konfirmasi');
  const [attendanceNoteDraft, setAttendanceNoteDraft] = useState('');
  const [statusReasonDraft, setStatusReasonDraft] = useState('');
  const [statusModalError, setStatusModalError] = useState<string | null>(null);

  // Modal riwayat per agenda
  const [historyModal, setHistoryModal] = useState<{
    agenda: AgendaItem;
    items: AgendaHistoryItem[];
  } | null>(null);

  const canManage = clientPermissions.canManageAgenda(user.role);
  const canEditDoc = clientPermissions.canEditDocumentationNotes(user.role);

  const filteredAgendas = useMemo(() => {
    return agendas.filter((item) => {
      if (leaderFilter !== 'all' && item.leader !== leaderFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (viewMode === 'daily' && !isSameLocalDate(item.starts_at, selectedDate)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          item.title.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q) ||
          item.pic.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [agendas, leaderFilter, statusFilter, viewMode, selectedDate, searchQuery]);

  // Tanggal 7 hari untuk kalender mingguan
  const weekDays = useMemo(() => {
    const base = new Date(`${selectedDate}T00:00:00`);
    const dayOfWeek = base.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(base);
    monday.setDate(base.getDate() + mondayOffset);
    return Array.from({length: 7}, (_, idx) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + idx);
      return toLocalDateInputValue(d);
    });
  }, [selectedDate]);

  const openCreateForm = () => {
    setEditingAgenda(null);
    setFormLeader('bupati');
    setFormTitle('');
    setFormStartsAt(toLocalDateTimeInputValue());
    setFormLocation('');
    setFormPic('');
    setFormNotes('');
    setFormDocNotes('');
    setFormStatus('terjadwal');
    setFormApprovedSec(true);
    setChangeReason('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForm = (agenda: AgendaItem) => {
    setEditingAgenda(agenda);
    setFormLeader(agenda.leader);
    setFormTitle(agenda.title);
    setFormStartsAt(toLocalDateTimeInputValue(agenda.starts_at));
    setFormLocation(agenda.location);
    setFormPic(agenda.pic);
    setFormNotes(agenda.notes);
    setFormDocNotes(agenda.documentation_notes);
    setFormStatus(agenda.status);
    setFormApprovedSec(agenda.approved_for_security);
    setChangeReason('');
    setFormError(null);
    setFormOpen(true);
  };

  const executeSaveAgenda = async () => {
    if (!formStartsAt || Number.isNaN(Date.parse(formStartsAt))) {
      setFormError('Tanggal dan jam kegiatan tidak valid.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const isoStart = new Date(formStartsAt).toISOString();
      if (!editingAgenda) {
        await dataService.createAgenda({
          leader: formLeader,
          title: formTitle,
          starts_at: isoStart,
          location: formLocation,
          pic: formPic,
          notes: formNotes,
          documentation_notes: formDocNotes,
          status: formStatus,
          approved_for_security: formApprovedSec,
        });
      } else {
        await dataService.updateAgenda(editingAgenda.id, {
          leader: formLeader,
          title: formTitle,
          starts_at: isoStart,
          location: formLocation,
          pic: formPic,
          notes: formNotes,
          documentation_notes: formDocNotes,
          status: formStatus,
          approved_for_security: formApprovedSec,
          change_reason: changeReason,
        });
      }
      setConfirmState({open: false, mode: 'edit', agenda: null});
      setFormOpen(false);
      onAgendasChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan agenda.');
    } finally {
      setSaving(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formStartsAt || Number.isNaN(Date.parse(formStartsAt))) {
      setFormError('Tanggal dan jam kegiatan tidak valid.');
      return;
    }
    if (!editingAgenda) {
      executeSaveAgenda();
      return;
    }

    const importantChanged =
      formLocation.trim() !== editingAgenda.location ||
      new Date(formStartsAt).toISOString() !== editingAgenda.starts_at ||
      formStatus !== editingAgenda.status;

    if (importantChanged) {
      setConfirmState({open: true, mode: 'edit', agenda: editingAgenda});
    } else {
      executeSaveAgenda();
    }
  };

  const handleCancelAgendaConfirm = async () => {
    if (!confirmState.agenda) return;
    if (changeReason.trim().length < 3) {
      setFormError('Alasan pembatalan wajib diisi minimal 3 karakter.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await dataService.updateAgenda(confirmState.agenda.id, {
        status: 'dibatalkan',
        change_reason: changeReason.trim(),
      });
      setConfirmState({open: false, mode: 'cancel', agenda: null});
      setChangeReason('');
      onAgendasChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal membatalkan agenda.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDocNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docModalAgenda) return;
    setSaving(true);
    setDocModalError(null);
    try {
      await dataService.updateAgenda(docModalAgenda.id, {
        documentation_notes: docNoteDraft,
      });
      setDocModalAgenda(null);
      onAgendasChanged();
    } catch (err) {
      setDocModalError(
        err instanceof Error ? err.message : 'Gagal menyimpan catatan dokumentasi.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStatusModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalAgenda) return;
    if (statusDraft === 'dibatalkan' && statusReasonDraft.trim().length < 3) {
      setStatusModalError('Alasan pembatalan wajib diisi minimal 3 karakter.');
      return;
    }
    setSaving(true);
    setStatusModalError(null);
    try {
      await dataService.updateAgenda(statusModalAgenda.id, {
        status: statusDraft,
        leader_attendance: attendanceDraft,
        attendance_note: attendanceNoteDraft.trim(),
        ...(statusReasonDraft.trim() ? {change_reason: statusReasonDraft.trim()} : {}),
      });
      setStatusModalAgenda(null);
      onAgendasChanged();
    } catch (err) {
      setStatusModalError(err instanceof Error ? err.message : 'Gagal memperbarui status kegiatan.');
    } finally {
      setSaving(false);
    }
  };

  const openAgendaHistory = async (agenda: AgendaItem) => {
    try {
      const items = await dataService.fetchAgendaHistories(agenda.id);
      setHistoryModal({agenda, items});
    } catch {
      setHistoryModal({agenda, items: []});
    }
  };

  const leaderName = (code: LeaderCode) =>
    code === 'bupati' ? settings.bupati_display_name : settings.wakil_bupati_display_name;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-indigo-200/80 bg-gradient-to-r from-[#0F294A] via-[#3730A3] to-[#6D28D9] px-6 py-5 text-white shadow-sm">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Manajemen Agenda</h2>
          <p className="mt-0.5 text-sm text-indigo-100">
            Jadwal kegiatan Bupati dan Wakil Bupati beserta riwayat perubahannya.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            disabled={!isOnline}
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-xs transition-colors hover:bg-amber-300 disabled:opacity-50 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Tambah Agenda
          </button>
        )}
      </div>

      {user.role === 'pengamanan' && (
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-950">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
          <span>
            <strong>Lingkup Akses Pengamanan:</strong> Anda hanya melihat agenda dan pembaruan yang
            telah disetujui untuk keperluan tugas pengamanan lapangan.
          </span>
        </div>
      )}

      {/* Toolbar View & Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200/80 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-1 rounded-lg bg-indigo-50 p-1">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
              viewMode === 'list'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xs'
                : 'text-indigo-900/75 hover:text-indigo-950'
            }`}
          >
            <List className="h-3.5 w-3.5" aria-hidden="true" />
            Daftar Agenda
          </button>
          <button
            type="button"
            onClick={() => setViewMode('daily')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
              viewMode === 'daily'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xs'
                : 'text-indigo-900/75 hover:text-indigo-950'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            Kalender Harian
          </button>
          <button
            type="button"
            onClick={() => setViewMode('weekly')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
              viewMode === 'weekly'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xs'
                : 'text-indigo-900/75 hover:text-indigo-950'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            Kalender Mingguan
          </button>
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
              placeholder="Cari judul, lokasi, PIC..."
              className="rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#0F294A] focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter pimpinan"
            value={leaderFilter}
            onChange={(e) => setLeaderFilter(e.target.value as 'all' | LeaderCode)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-[#0F294A] focus:outline-none"
          >
            <option value="all">Semua Pimpinan</option>
            <option value="bupati">{settings.bupati_display_name}</option>
            <option value="wakil_bupati">{settings.wakil_bupati_display_name}</option>
          </select>

          <select
            aria-label="Filter status agenda"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | AgendaStatus)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-[#0F294A] focus:outline-none"
          >
            <option value="all">Semua Status</option>
            {Object.entries(AGENDA_STATUS_LABELS).map(([k, lbl]) => (
              <option key={k} value={k}>
                {lbl}
              </option>
            ))}
          </select>

          {(viewMode === 'daily' || viewMode === 'weekly') && (
            <input
              type="date"
              aria-label="Pilih tanggal kalender"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 tabular-nums"
            />
          )}
        </div>
      </div>

      {/* View 1: Daftar Agenda */}
      {viewMode === 'list' && (
        <div className="overflow-hidden rounded-xl border border-indigo-200/80 bg-white shadow-xs">
          {filteredAgendas.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">
                Tidak ada agenda yang sesuai dengan filter.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Sesuaikan filter tanggal atau pimpinan, atau tambahkan agenda baru bila berwenang.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-indigo-200 bg-gradient-to-r from-indigo-50 via-sky-50 to-teal-50 text-xs font-bold text-[#0F294A]">
                    <th className="px-4 py-3">Waktu</th>
                    <th className="px-4 py-3">Pimpinan</th>
                    <th className="px-4 py-3">Kegiatan & Catatan</th>
                    <th className="px-4 py-3">Lokasi & PIC</th>
                    <th className="px-4 py-3">Status & Kehadiran</th>
                    <th className="px-4 py-3 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAgendas.map((agenda) => (
                    <tr key={agenda.id} className="align-top transition-colors hover:bg-sky-50/45">
                      <td className="px-4 py-3.5 text-xs text-slate-700 whitespace-nowrap tabular-nums">
                        <div className="font-mono font-bold text-indigo-900">
                          {formatTimeOnlyId(agenda.starts_at)}
                        </div>
                        <div className="text-slate-500">{formatDateOnlyId(agenda.starts_at)}</div>
                      </td>
                      <td className="px-4 py-3.5 text-xs font-semibold whitespace-nowrap">
                        <span
                          className={`inline-block rounded-md border px-2 py-0.5 ${
                            agenda.leader === 'bupati'
                              ? 'border-sky-200 bg-sky-50 text-[#0F294A]'
                              : 'border-teal-200 bg-teal-50 text-teal-900'
                          }`}
                        >
                          {leaderName(agenda.leader)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900">{agenda.title}</div>
                        {agenda.notes && (
                          <p className="mt-1 text-xs text-slate-600">{agenda.notes}</p>
                        )}
                        {agenda.documentation_notes && (
                          <p className="mt-1 text-xs text-sky-800">
                            Dokumentasi: {agenda.documentation_notes}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-700">
                        <div className="font-medium text-slate-900">{agenda.location}</div>
                        {agenda.pic && (
                          <div className="mt-0.5 text-slate-500">PIC: {agenda.pic}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 space-y-1.5">
                        <div>
                          <AgendaStatusLabel status={agenda.status} />
                        </div>
                        <div>
                          <AttendanceStatusLabel
                            attendance={agenda.leader_attendance || 'belum_konfirmasi'}
                          />
                        </div>
                        {agenda.attendance_note && (
                          <div className="text-[11px] text-slate-600">
                            {agenda.attendance_note}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openAgendaHistory(agenda)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            <History className="h-3.5 w-3.5" aria-hidden="true" />
                            Riwayat
                          </button>

                          {canEditDoc && !canManage && (
                            <button
                              type="button"
                              disabled={!isOnline}
                              onClick={() => {
                                setDocModalAgenda(agenda);
                                setDocNoteDraft(agenda.documentation_notes || '');
                                setDocModalError(null);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                            >
                              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                              Catatan Dok.
                            </button>
                          )}

                          {!canManage &&
                            clientPermissions.canEditAgendaStatusAndAttendance(
                              user.role,
                              agenda.leader
                            ) && (
                              <button
                                type="button"
                                disabled={!isOnline}
                                onClick={() => {
                                  setStatusModalAgenda(agenda);
                                  setStatusDraft(agenda.status);
                                  setAttendanceDraft(
                                    agenda.leader_attendance || 'belum_konfirmasi'
                                  );
                                  setAttendanceNoteDraft(agenda.attendance_note || '');
                                  setStatusReasonDraft('');
                                  setStatusModalError(null);
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                                Edit Status
                              </button>
                            )}

                          {canManage && (
                            <>
                              <button
                                type="button"
                                disabled={!isOnline}
                                onClick={() => openEditForm(agenda)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                              >
                                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                                Ubah
                              </button>
                              {agenda.status !== 'dibatalkan' && (
                                <button
                                  type="button"
                                  disabled={!isOnline}
                                  onClick={() => {
                                    setChangeReason('');
                                    setFormError(null);
                                    setConfirmState({open: true, mode: 'cancel', agenda});
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                                >
                                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                  Batalkan
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* View 2: Kalender Harian */}
      {viewMode === 'daily' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {(['bupati', 'wakil_bupati'] as LeaderCode[])
            .filter((code) => leaderFilter === 'all' || leaderFilter === code)
            .map((code) => {
              const items = filteredAgendas.filter((a) => a.leader === code);
              const isBupati = code === 'bupati';
              return (
                <div
                  key={code}
                  className={`overflow-hidden rounded-xl border bg-white shadow-xs ${
                    isBupati ? 'border-sky-200' : 'border-teal-200'
                  }`}
                >
                  <h3
                    className={`flex items-center gap-3 px-5 py-3.5 text-base font-bold text-white ${
                      isBupati
                        ? 'bg-gradient-to-r from-[#0F294A] to-[#0284C7]'
                        : 'bg-gradient-to-r from-[#0F766E] to-[#14B8A6]'
                    }`}
                  >
                    {isBupati && (
                      <div className="h-11 w-9 shrink-0 overflow-hidden rounded-lg border border-sky-200/80 bg-gradient-to-b from-sky-50 to-white shadow-xs">
                        <img
                          src="/assets/aistudio/Wakil_Bupati_Sidoarjo_Subandi_18547112.png"
                          alt={`Foto ${leaderName(code)}`}
                          className="h-full w-full object-cover object-top"
                        />
                      </div>
                    )}
                    <span>
                      {leaderName(code)} · {formatDateOnlyId(`${selectedDate}T00:00:00`)}
                    </span>
                  </h3>
                  <div className="p-5">
                    {items.length === 0 ? (
                      <p className="py-4 text-xs text-slate-500">
                        Tidak ada agenda pada tanggal ini.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {items.map((item) => (
                          <div key={item.id} className="py-3">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`font-mono text-xs font-bold tabular-nums ${
                                  isBupati ? 'text-sky-800' : 'text-teal-800'
                                }`}
                              >
                                {formatTimeOnlyId(item.starts_at)}
                              </span>
                              <AgendaStatusLabel status={item.status} />
                            </div>
                            <div className="mt-1 text-sm font-semibold text-slate-900">
                              {item.title}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-600">{item.location}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* View 3: Kalender Mingguan */}
      {viewMode === 'weekly' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7">
          {weekDays.map((dayYmd) => {
            const dayItems = filteredAgendas.filter((a) => isSameLocalDate(a.starts_at, dayYmd));
            return (
              <div
                key={dayYmd}
                className="flex flex-col rounded-xl border border-slate-200 bg-white p-3.5"
              >
                <div className="border-b border-slate-100 pb-2 text-xs font-semibold text-[#0F294A] tabular-nums">
                  {formatDateOnlyId(`${dayYmd}T00:00:00`)}
                </div>
                {dayItems.length === 0 ? (
                  <p className="py-4 text-xs text-slate-400">Kosong</p>
                ) : (
                  <div className="mt-2 space-y-2.5">
                    {dayItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between gap-1 text-[11px] text-slate-600 tabular-nums">
                          <span className="font-mono font-semibold text-slate-900">
                            {formatTimeOnlyId(item.starts_at)}
                          </span>
                          <span>{item.leader === 'bupati' ? 'Bupati' : 'Wabup'}</span>
                        </div>
                        <div className="mt-1 font-medium text-slate-900">{item.title}</div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-500">
                          {item.location}
                        </div>
                        <div className="mt-2">
                          <AgendaStatusLabel status={item.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Tambah / Edit Agenda (Admin SIMPRO) */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#0F294A]">
              {editingAgenda ? 'Ubah Agenda Kegiatan' : 'Tambah Agenda Baru'}
            </h3>

            {formError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Pimpinan</label>
                  <select
                    value={formLeader}
                    onChange={(e) => setFormLeader(e.target.value as LeaderCode)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="bupati">{settings.bupati_display_name}</option>
                    <option value="wakil_bupati">{settings.wakil_bupati_display_name}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">Tanggal & Jam</label>
                  <input
                    type="datetime-local"
                    required
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Judul Kegiatan</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Contoh: Rapat Paripurna DPRD"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Lokasi Kegiatan</label>
                  <input
                    type="text"
                    required
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="Contoh: Pendopo Kabupaten"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">PIC / Penanggung Jawab</label>
                  <input
                    type="text"
                    value={formPic}
                    onChange={(e) => setFormPic(e.target.value)}
                    placeholder="Contoh: Bagian Protokol"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Status Agenda</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as AgendaStatus)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {Object.entries(AGENDA_STATUS_LABELS).map(([k, lbl]) => (
                      <option key={k} value={k}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={formApprovedSec}
                      onChange={(e) => setFormApprovedSec(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Disetujui untuk tampilan Tim Pengamanan
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Catatan Protokol</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Kebutuhan Dokumentasi
                </label>
                <textarea
                  rows={2}
                  value={formDocNotes}
                  onChange={(e) => setFormDocNotes(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              {editingAgenda && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Alasan Perubahan (Wajib jika waktu, lokasi, atau status diubah)
                  </label>
                  <input
                    type="text"
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    placeholder="Contoh: Penyesuaian lokasi dari tuan rumah"
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0F294A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#163B6B] disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Agenda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Modal untuk Perubahan Penting / Pembatalan */}
      <ConfirmModal
        open={confirmState.open}
        title={
          confirmState.mode === 'cancel'
            ? 'Konfirmasi Pembatalan Agenda'
            : 'Konfirmasi Perubahan Agenda Penting'
        }
        description={
          confirmState.mode === 'cancel'
            ? `Agenda "${confirmState.agenda?.title}" akan dibatalkan dan notifikasi dikirim ke tim berwenang. Catatan riwayat tidak akan dihapus.`
            : 'Anda mengubah jadwal, lokasi, atau status agenda. Perubahan akan dicatat dalam riwayat dan diberitahukan kepada petugas berwenang.'
        }
        confirmLabel={confirmState.mode === 'cancel' ? 'Ya, Batalkan Agenda' : 'Simpan Perubahan'}
        tone={confirmState.mode === 'cancel' ? 'danger' : 'primary'}
        loading={saving}
        onCancel={() => setConfirmState({open: false, mode: 'edit', agenda: null})}
        onConfirm={() => {
          if (confirmState.mode === 'cancel') handleCancelAgendaConfirm();
          else executeSaveAgenda();
        }}
      >
        {confirmState.mode === 'cancel' && (
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Alasan Pembatalan (Wajib)
            </label>
            <input
              type="text"
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="Tuliskan alasan pembatalan resmi"
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            {formError && <p className="mt-1.5 text-xs text-red-700">{formError}</p>}
          </div>
        )}
      </ConfirmModal>

      {/* Modal Catatan Dokumentasi (Tim Dokumentasi) */}
      {docModalAgenda && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-[#0F294A]">Catatan Kesiapan Dokumentasi</h3>
            <p className="mt-1 text-xs text-slate-600">{docModalAgenda.title}</p>
            {docModalError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                {docModalError}
              </div>
            )}
            <form onSubmit={handleSaveDocNotes} className="mt-4 space-y-4">
              <textarea
                rows={3}
                value={docNoteDraft}
                onChange={(e) => setDocNoteDraft(e.target.value)}
                placeholder="Kebutuhan kamera, audio, backdrop, dan personel dokumentasi..."
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDocModalAgenda(null)}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0F294A] px-3.5 py-2 text-xs font-semibold text-white"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Catatan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Status Kegiatan & Kehadiran (Tim Protokol / Ajudan) */}
      {statusModalAgenda && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-[#0F294A]">
              Edit Status Kegiatan & Kehadiran Pimpinan
            </h3>
            <p className="mt-1 text-xs text-slate-600">{statusModalAgenda.title}</p>

            {statusModalError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                {statusModalError}
              </div>
            )}

            <form onSubmit={handleSaveStatusModal} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Status Kegiatan</label>
                <select
                  value={statusDraft}
                  onChange={(e) => setStatusDraft(e.target.value as AgendaStatus)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {Object.entries(AGENDA_STATUS_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Kehadiran Pimpinan
                </label>
                <select
                  value={attendanceDraft}
                  onChange={(e) => setAttendanceDraft(e.target.value as LeaderAttendance)}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {Object.entries(LEADER_ATTENDANCE_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Keterangan Kehadiran / Perwakilan
                </label>
                <input
                  type="text"
                  value={attendanceNoteDraft}
                  onChange={(e) => setAttendanceNoteDraft(e.target.value)}
                  placeholder="Contoh: Hadir langsung / Diwakilkan Sekda"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Catatan / Alasan Perubahan{' '}
                  {statusDraft === 'dibatalkan' ? '(Wajib min. 3 karakter)' : '(Opsional)'}
                </label>
                <input
                  type="text"
                  value={statusReasonDraft}
                  onChange={(e) => setStatusReasonDraft(e.target.value)}
                  placeholder="Keterangan perubahan status kegiatan"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setStatusModalAgenda(null)}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-medium text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#0F294A] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Riwayat Perubahan Agenda */}
      {historyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-[#0F294A]">Riwayat Perubahan Agenda</h3>
                <p className="mt-0.5 text-xs text-slate-600">{historyModal.agenda.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModal(null)}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Tutup
              </button>
            </div>
            <div className="mt-4 divide-y divide-slate-100">
              {historyModal.items.length === 0 ? (
                <p className="py-4 text-xs text-slate-500">Belum ada catatan riwayat.</p>
              ) : (
                historyModal.items.map((h) => (
                  <div key={h.id} className="py-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900 uppercase">
                        {h.change_type}
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {formatDateTimeId(h.created_at)}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-700">
                      Oleh: <strong>{h.changed_by_name || h.changed_by}</strong>
                    </p>
                    {h.change_reason && (
                      <p className="mt-1 text-slate-600">Alasan: {h.change_reason}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
