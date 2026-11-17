import type {LeaderCode, UserRole} from '../types/simpro.ts';

export const clientPermissions = {
  canManageAgenda(role: UserRole): boolean {
    return role === 'admin';
  },
  canEditAgendaStatusAndAttendance(role: UserRole, leader?: LeaderCode): boolean {
    if (role === 'admin' || role === 'protokol') return true;
    if (role === 'ajudan_bupati') return !leader || leader === 'bupati';
    if (role === 'ajudan_wakil_bupati') return !leader || leader === 'wakil_bupati';
    return false;
  },
  canEditDocumentationNotes(role: UserRole): boolean {
    return role === 'dokumentasi' || role === 'admin' || role === 'protokol';
  },
  canSubmitStatusUpdate(role: UserRole, leader?: LeaderCode): boolean {
    if (role === 'ajudan_bupati') {
      return !leader || leader === 'bupati';
    }
    if (role === 'ajudan_wakil_bupati') {
      return !leader || leader === 'wakil_bupati';
    }
    return false;
  },
  getAssignedLeader(role: UserRole): LeaderCode | null {
    if (role === 'ajudan_bupati') return 'bupati';
    if (role === 'ajudan_wakil_bupati') return 'wakil_bupati';
    return null;
  },
  canExportReports(role: UserRole): boolean {
    return role !== 'pimpinan_viewer';
  },
  canAccessAdmin(role: UserRole): boolean {
    return role === 'admin';
  },
};
