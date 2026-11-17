import type {
  AgendaItem,
  LeaderCode,
  LeaderUpdateItem,
  LiveLocationRecord,
  UserRole,
} from '../src/types/simpro.ts';

export function canViewDashboard(role: UserRole, viewerEnabled: boolean): boolean {
  if (role === 'pimpinan_viewer') {
    return viewerEnabled;
  }
  return true;
}

export function canViewAgendaModule(role: UserRole, viewerEnabled: boolean): boolean {
  if (role === 'pimpinan_viewer') {
    return viewerEnabled;
  }
  return true;
}

export function canManageAgenda(role: UserRole): boolean {
  return role === 'admin';
}

export function canEditAgendaStatusAndAttendance(role: UserRole, leader: LeaderCode): boolean {
  if (role === 'admin' || role === 'protokol') return true;
  if (role === 'ajudan_bupati' && leader === 'bupati') return true;
  if (role === 'ajudan_wakil_bupati' && leader === 'wakil_bupati') return true;
  return false;
}

export function canEditDocumentationNotes(role: UserRole): boolean {
  return role === 'dokumentasi' || role === 'admin' || role === 'protokol';
}

export function canSubmitLeaderUpdate(role: UserRole, leader: LeaderCode): boolean {
  if (role === 'ajudan_bupati' && leader === 'bupati') return true;
  if (role === 'ajudan_wakil_bupati' && leader === 'wakil_bupati') return true;
  return false;
}

export function getAllowedLeaderForAjudan(role: UserRole): LeaderCode | null {
  if (role === 'ajudan_bupati') return 'bupati';
  if (role === 'ajudan_wakil_bupati') return 'wakil_bupati';
  return null;
}

export function canViewHistory(role: UserRole, viewerEnabled: boolean): boolean {
  if (role === 'pimpinan_viewer') return viewerEnabled;
  return true;
}

export function canExportReports(role: UserRole): boolean {
  return role !== 'pimpinan_viewer';
}

export function canManageUsers(role: UserRole): boolean {
  return role === 'admin';
}

export function canManageSettings(role: UserRole): boolean {
  return role === 'admin';
}

export function canViewAuditLogs(role: UserRole): boolean {
  return role === 'admin';
}

export function filterAgendasForRole(agendas: AgendaItem[], role: UserRole): AgendaItem[] {
  if (role === 'pengamanan') {
    return agendas
      .filter((item) => item.approved_for_security)
      .map((item) => ({
        ...item,
        documentation_notes: '',
      }));
  }
  if (role === 'pimpinan_viewer') {
    return agendas.map((item) => ({
      ...item,
      documentation_notes: '',
    }));
  }
  return agendas;
}

export function filterUpdatesForRole(
  updates: LeaderUpdateItem[],
  role: UserRole
): LeaderUpdateItem[] {
  if (role === 'pengamanan') {
    return updates.filter((u) => u.approved_for_security);
  }
  return updates;
}

export function filterLiveLocationsForRole(
  locations: LiveLocationRecord[],
  role: UserRole
): LiveLocationRecord[] {
  if (role === 'pengamanan') {
    return locations.filter((loc) => loc.approved_for_security);
  }
  return locations;
}
