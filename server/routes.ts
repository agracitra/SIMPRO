import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, {type Router, type Response} from 'express';
import {
  buildAuthMiddleware,
  clearSessionCookie,
  createSessionToken,
  hashPassword,
  setSessionCookie,
  verifyPassword,
  type AuthenticatedRequest,
} from './auth.ts';
import {SimproDatabase} from './db.ts';
import {
  canEditAgendaStatusAndAttendance,
  canEditDocumentationNotes,
  canExportReports,
  canManageAgenda,
  canManageSettings,
  canManageUsers,
  canSubmitLeaderUpdate,
  canViewAuditLogs,
  filterAgendasForRole,
  filterLiveLocationsForRole,
  filterUpdatesForRole,
} from './rbac.ts';
import {
  isValidAgendaStatus,
  isValidEmail,
  isValidLeader,
  isValidLeaderAttendance,
  isValidRole,
  validateAgendaInput,
  validateStatusUpdateInput,
} from '../src/lib/validation.ts';
import type {
  LeaderAttendance,
  LeaderCode,
  LiveLocationRecord,
  SystemModeInfo,
  UserRole,
} from '../src/types/simpro.ts';

export interface ApiRouterOptions {
  onLiveLocationUpdated?: (location: LiveLocationRecord) => void;
}

export function createApiRouter(db: SimproDatabase, options?: ApiRouterOptions): Router {
  const router = express.Router();

  const supabaseConfigured = Boolean(
    process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY
  );

  const requireAuth = buildAuthMiddleware(
    (id) => db.getUserById(id),
    () => db.getSettings().viewer_enabled
  );

  const logForbidden = (
    req: AuthenticatedRequest,
    res: Response,
    entity: string,
    entityId: string | null,
    reason: string
  ) => {
    db.writeAuditLog({
      actor_id: req.currentUser?.id ?? null,
      actor_email: req.currentUser?.email ?? null,
      actor_role: req.currentUser?.role ?? null,
      action: 'ACCESS_DENIED',
      entity,
      entity_id: entityId,
      metadata: {
        method: req.method,
        path: req.originalUrl,
        reason,
      },
    });
    res.status(403).json({error: reason});
  };

  // --------------------------------------------------------------------------
  // HEALTH & SYSTEM MODE (Tidak pernah membocorkan secret key!)
  // --------------------------------------------------------------------------
  router.get('/health', (_req, res) => {
    res.json({status: 'ok', timestamp: new Date().toISOString()});
  });

  router.get('/system/mode', (_req, res) => {
    const info: SystemModeInfo = {
      mode: supabaseConfigured ? 'supabase_connected' : 'local_isolated',
      supabaseConfigured,
      isNonProductionTestSeed: !supabaseConfigured,
      externalNotificationsConfigured: false,
    };
    res.json(info);
  });

  // --------------------------------------------------------------------------
  // AUTHENTICATION
  // --------------------------------------------------------------------------
  router.post('/auth/login', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!email || !password) {
      res.status(400).json({error: 'Email dan kata sandi wajib diisi.'});
      return;
    }

    const user = db.getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      db.writeAuditLog({
        actor_id: user?.id ?? null,
        actor_email: email,
        actor_role: user?.role ?? null,
        action: 'LOGIN_FAILED',
        entity: 'auth',
        metadata: {reason: 'Kredensial tidak cocok'},
      });
      res.status(401).json({error: 'Email atau kata sandi tidak valid.'});
      return;
    }

    if (!user.is_active) {
      db.writeAuditLog({
        actor_id: user.id,
        actor_email: user.email,
        actor_role: user.role,
        action: 'LOGIN_BLOCKED_INACTIVE',
        entity: 'auth',
        entity_id: user.id,
      });
      res.status(403).json({
        error: 'Akun Anda berstatus nonaktif. Hubungi Admin SIMPRO untuk pengaktifan kembali.',
      });
      return;
    }

    const settings = db.getSettings();
    if (user.role === 'pimpinan_viewer' && !settings.viewer_enabled) {
      db.writeAuditLog({
        actor_id: user.id,
        actor_email: user.email,
        actor_role: user.role,
        action: 'LOGIN_BLOCKED_VIEWER_DISABLED',
        entity: 'auth',
        entity_id: user.id,
      });
      res.status(403).json({
        error:
          'Akses Pimpinan / Viewer belum diaktifkan oleh Administrator. Silakan hubungi Admin SIMPRO.',
      });
      return;
    }

    const token = createSessionToken(user.id);
    setSessionCookie(req, res, token);

    db.writeAuditLog({
      actor_id: user.id,
      actor_email: user.email,
      actor_role: user.role,
      action: 'LOGIN_SUCCESS',
      entity: 'auth',
      entity_id: user.id,
    });

    const {password_hash: _omit, ...safeProfile} = user;
    res.json({user: safeProfile, token});
  });

  router.post('/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ok: true});
  });

  router.get('/auth/session', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({user: req.currentUser});
  });

  router.post('/auth/password-recovery', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || !isValidEmail(email)) {
      res.status(400).json({error: 'Masukkan alamat email dinas yang valid.'});
      return;
    }

    const user = db.getUserByEmail(email);
    db.writeAuditLog({
      actor_id: user?.id ?? null,
      actor_email: email,
      actor_role: user?.role ?? null,
      action: 'PASSWORD_RECOVERY_REQUESTED',
      entity: 'auth',
      entity_id: user?.id ?? null,
      metadata: {
        channel: 'internal_admin_queue',
        account_found: Boolean(user),
      },
    });

    if (user && user.is_active) {
      db.dispatchNotifications({
        roles: ['admin'],
        type: 'PEMULIHAN_SANDI',
        title: 'Permintaan Pemulihan Kata Sandi',
        message: `Pengguna ${user.full_name} (${user.email}) mengajukan permintaan reset kata sandi. Tindak lanjuti melalui Manajemen Pengguna setelah verifikasi identitas.`,
        reference_entity: 'profiles',
        reference_id: user.id,
      });
    }

    // Pesan jujur sesuai SOP tanpa membocorkan apakah akun terdaftar
    res.json({
      ok: true,
      message:
        'Permintaan pemulihan kata sandi telah dicatat ke antrean Admin SIMPRO. Karena gerbang email eksternal belum dikonfigurasi pada v1.0, silakan hubungi Administrator untuk verifikasi dan penyetelan ulang sandi.',
    });
  });

  // --------------------------------------------------------------------------
  // SETTINGS (Baca oleh pengguna aktif, ubah hanya oleh Admin)
  // --------------------------------------------------------------------------
  router.get('/settings', requireAuth, (_req, res) => {
    res.json({settings: db.getSettings()});
  });

  router.patch('/settings', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    if (!canManageSettings(actor.role)) {
      logForbidden(
        req,
        res,
        'app_settings',
        null,
        'Hanya Administrator SIMPRO yang berwenang mengubah konfigurasi aplikasi.'
      );
      return;
    }

    const now = new Date().toISOString();
    const upsert = db.db.prepare(`
      INSERT INTO app_settings (key, value, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    `);

    const updates: Record<string, unknown> = {};
    if (typeof req.body?.viewer_enabled === 'boolean') {
      upsert.run('viewer_enabled', JSON.stringify(req.body.viewer_enabled), actor.id, now);
      updates.viewer_enabled = req.body.viewer_enabled;
    }
    if (
      typeof req.body?.stale_threshold_minutes === 'number' &&
      req.body.stale_threshold_minutes >= 5 &&
      req.body.stale_threshold_minutes <= 1440
    ) {
      upsert.run(
        'stale_threshold_minutes',
        JSON.stringify(Math.round(req.body.stale_threshold_minutes)),
        actor.id,
        now
      );
      updates.stale_threshold_minutes = Math.round(req.body.stale_threshold_minutes);
    }
    if (typeof req.body?.bupati_display_name === 'string' && req.body.bupati_display_name.trim()) {
      upsert.run(
        'bupati_display_name',
        JSON.stringify(req.body.bupati_display_name.trim().slice(0, 80)),
        actor.id,
        now
      );
      updates.bupati_display_name = req.body.bupati_display_name.trim().slice(0, 80);
    }
    if (
      typeof req.body?.wakil_bupati_display_name === 'string' &&
      req.body.wakil_bupati_display_name.trim()
    ) {
      upsert.run(
        'wakil_bupati_display_name',
        JSON.stringify(req.body.wakil_bupati_display_name.trim().slice(0, 80)),
        actor.id,
        now
      );
      updates.wakil_bupati_display_name = req.body.wakil_bupati_display_name.trim().slice(0, 80);
    }
    if (Array.isArray(req.body?.status_options) && req.body.status_options.length > 0) {
      upsert.run('status_options', JSON.stringify(req.body.status_options), actor.id, now);
      updates.status_options_count = req.body.status_options.length;
    }

    db.writeAuditLog({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'SETTINGS_UPDATED',
      entity: 'app_settings',
      metadata: updates,
    });

    res.json({settings: db.getSettings()});
  });

  // --------------------------------------------------------------------------
  // AGENDAS & HISTORIES
  // --------------------------------------------------------------------------
  router.get('/agendas', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    const agendas = filterAgendasForRole(db.listAgendas(), actor.role);
    res.json({agendas});
  });

  router.get('/agendas/histories', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    const agendaId = typeof req.query.agendaId === 'string' ? req.query.agendaId : undefined;
    let histories = db.listAgendaHistories(agendaId);
    if (actor.role === 'pengamanan') {
      const allowedIds = new Set(
        filterAgendasForRole(db.listAgendas(), 'pengamanan').map((a) => a.id)
      );
      histories = histories.filter((h) => allowedIds.has(h.agenda_id));
    }
    res.json({histories});
  });

  router.post('/agendas', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    if (!canManageAgenda(actor.role)) {
      logForbidden(
        req,
        res,
        'agendas',
        null,
        'Hanya Admin SIMPRO yang berwenang menginput agenda baru.'
      );
      return;
    }

    const validationError = validateAgendaInput(req.body || {});
    if (validationError) {
      res.status(400).json({error: validationError});
      return;
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const leader = req.body.leader as LeaderCode;
    const title = String(req.body.title).trim();
    const startsAt = new Date(req.body.starts_at).toISOString();
    const location = String(req.body.location).trim();
    const pic = typeof req.body.pic === 'string' ? req.body.pic.trim() : '';
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';
    const documentationNotes =
      typeof req.body.documentation_notes === 'string' ? req.body.documentation_notes.trim() : '';
    const status = req.body.status || 'terjadwal';
    const leaderAttendance: LeaderAttendance = req.body.leader_attendance || 'belum_konfirmasi';
    const attendanceNote =
      typeof req.body.attendance_note === 'string' ? req.body.attendance_note.trim() : '';
    const approvedForSecurity = req.body.approved_for_security !== false;

    db.db
      .prepare(
        `INSERT INTO agendas (id, leader, title, starts_at, location, pic, notes, documentation_notes, status, leader_attendance, attendance_note, approved_for_security, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        leader,
        title,
        startsAt,
        location,
        pic,
        notes,
        documentationNotes,
        status,
        leaderAttendance,
        attendanceNote,
        approvedForSecurity ? 1 : 0,
        actor.id,
        actor.id,
        now,
        now
      );

    const created = db.getAgendaById(id)!;

    db.db
      .prepare(
        `INSERT INTO agenda_histories (id, agenda_id, changed_by, change_type, previous_data, new_data, change_reason, created_at)
         VALUES (?, ?, ?, 'dibuat', NULL, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        id,
        actor.id,
        JSON.stringify(created),
        typeof req.body.change_reason === 'string'
          ? req.body.change_reason.trim()
          : 'Agenda dibuat oleh Admin SIMPRO',
        now
      );

    db.writeAuditLog({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'AGENDA_CREATED',
      entity: 'agendas',
      entity_id: id,
      metadata: {leader, title, starts_at: startsAt, location},
    });

    db.dispatchNotifications({
      roles: [
        'admin',
        'protokol',
        'dokumentasi',
        'pengamanan',
        leader === 'bupati' ? 'ajudan_bupati' : 'ajudan_wakil_bupati',
      ],
      type: 'AGENDA_BARU',
      title: `Agenda Baru ${leader === 'bupati' ? 'Bupati' : 'Wakil Bupati'}`,
      message: `${title} di ${location} (${new Date(startsAt).toLocaleString('id-ID')}).`,
      reference_entity: 'agendas',
      reference_id: id,
      excludeUserId: actor.id,
      securityApprovedOnly: approvedForSecurity,
    });

    res.status(201).json({agenda: created});
  });

  router.patch('/agendas/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    const id = String(req.params.id);
    const existing = db.getAgendaById(id);
    if (!existing) {
      res.status(404).json({error: 'Agenda tidak ditemukan.'});
      return;
    }

    // Tim Dokumentasi hanya boleh memperbarui catatan kesiapan dokumentasi
    if (actor.role === 'dokumentasi' && canEditDocumentationNotes(actor.role)) {
      const forbiddenKeys = Object.keys(req.body || {}).filter(
        (k) => k !== 'documentation_notes'
      );
      if (forbiddenKeys.length > 0) {
        logForbidden(
          req,
          res,
          'agendas',
          id,
          'Tim Dokumentasi hanya diperbolehkan memperbarui catatan kesiapan dokumentasi, bukan jadwal atau status agenda.'
        );
        return;
      }
      if (typeof req.body?.documentation_notes !== 'string') {
        res.status(400).json({error: 'Catatan dokumentasi wajib berupa teks.'});
        return;
      }

      const now = new Date().toISOString();
      const docNotes = req.body.documentation_notes.trim();
      db.db
        .prepare('UPDATE agendas SET documentation_notes = ?, updated_by = ?, updated_at = ? WHERE id = ?')
        .run(docNotes, actor.id, now, id);
      const updated = db.getAgendaById(id)!;

      db.db
        .prepare(
          `INSERT INTO agenda_histories (id, agenda_id, changed_by, change_type, previous_data, new_data, change_reason, created_at)
           VALUES (?, ?, ?, 'catatan_dokumentasi', ?, ?, 'Pembaruan kesiapan dokumentasi', ?)`
        )
        .run(
          crypto.randomUUID(),
          id,
          actor.id,
          JSON.stringify({documentation_notes: existing.documentation_notes}),
          JSON.stringify({documentation_notes: docNotes}),
          now
        );

      db.writeAuditLog({
        actor_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        action: 'AGENDA_DOC_NOTES_UPDATED',
        entity: 'agendas',
        entity_id: id,
      });

      res.json({agenda: updated});
      return;
    }

    // Tim Protokol & Ajudan (sesuai penugasan) hanya boleh memperbarui status agenda & kehadiran pimpinan
    if (
      actor.role === 'protokol' ||
      actor.role === 'ajudan_bupati' ||
      actor.role === 'ajudan_wakil_bupati'
    ) {
      if (!canEditAgendaStatusAndAttendance(actor.role, existing.leader)) {
        logForbidden(
          req,
          res,
          'agendas',
          id,
          `Role Anda (${actor.role}) tidak berwenang mengubah agenda milik ${
            existing.leader === 'bupati' ? 'Bupati' : 'Wakil Bupati'
          }.`
        );
        return;
      }

      const allowedStatusKeys = new Set([
        'status',
        'leader_attendance',
        'attendance_note',
        'change_reason',
      ]);
      const forbiddenKeys = Object.keys(req.body || {}).filter((k) => !allowedStatusKeys.has(k));
      if (forbiddenKeys.length > 0) {
        logForbidden(
          req,
          res,
          'agendas',
          id,
          actor.role === 'protokol'
            ? 'Tim Protokol hanya berwenang mengedit status kegiatan dan kehadiran pimpinan. Perubahan jadwal atau lokasi dilakukan oleh Admin SIMPRO.'
            : 'Ajudan hanya dapat memperbarui status agenda dan kehadiran pimpinan sesuai penugasan, bukan jadwal atau lokasi.'
        );
        return;
      }

      const nextStatus = req.body?.status ?? existing.status;
      const nextAttendance = (req.body?.leader_attendance ??
        existing.leader_attendance) as LeaderAttendance;
      const nextAttendanceNote =
        typeof req.body?.attendance_note === 'string'
          ? req.body.attendance_note.trim()
          : existing.attendance_note;
      const changeReason =
        typeof req.body?.change_reason === 'string' ? req.body.change_reason.trim() : '';

      if (!isValidAgendaStatus(nextStatus)) {
        res.status(400).json({error: 'Status agenda tidak valid.'});
        return;
      }
      if (!isValidLeaderAttendance(nextAttendance)) {
        res.status(400).json({error: 'Status kehadiran pimpinan tidak valid.'});
        return;
      }
      if (nextStatus === 'dibatalkan' && changeReason.length < 3) {
        res.status(400).json({
          error: 'Pembatalan agenda wajib menyertakan alasan perubahan (minimal 3 karakter).',
        });
        return;
      }

      const now = new Date().toISOString();
      db.db
        .prepare(
          `UPDATE agendas
           SET status = ?, leader_attendance = ?, attendance_note = ?, updated_by = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(nextStatus, nextAttendance, nextAttendanceNote, actor.id, now, id);

      const updated = db.getAgendaById(id)!;
      const changeType = nextStatus === 'dibatalkan' ? 'dibatalkan' : 'diubah';
      const defaultActorLabel = actor.role === 'protokol' ? 'Tim Protokol' : 'Ajudan';
      const reasonText =
        changeReason ||
        `Pembaruan status kegiatan & kehadiran pimpinan oleh ${defaultActorLabel}`;

      db.db
        .prepare(
          `INSERT INTO agenda_histories (id, agenda_id, changed_by, change_type, previous_data, new_data, change_reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          crypto.randomUUID(),
          id,
          actor.id,
          changeType,
          JSON.stringify({
            status: existing.status,
            leader_attendance: existing.leader_attendance,
            attendance_note: existing.attendance_note,
          }),
          JSON.stringify({
            status: nextStatus,
            leader_attendance: nextAttendance,
            attendance_note: nextAttendanceNote,
          }),
          reasonText,
          now
        );

      db.writeAuditLog({
        actor_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        action: 'AGENDA_STATUS_ATTENDANCE_UPDATED',
        entity: 'agendas',
        entity_id: id,
        metadata: {
          previous_status: existing.status,
          new_status: nextStatus,
          previous_attendance: existing.leader_attendance,
          new_attendance: nextAttendance,
          change_reason: reasonText,
        },
      });

      if (
        nextStatus !== existing.status ||
        nextAttendance !== existing.leader_attendance
      ) {
        db.dispatchNotifications({
          roles: [
            'admin',
            'protokol',
            'dokumentasi',
            'pengamanan',
            existing.leader === 'bupati' ? 'ajudan_bupati' : 'ajudan_wakil_bupati',
          ],
          type: nextStatus === 'dibatalkan' ? 'AGENDA_DIBATALKAN' : 'AGENDA_BERUBAH',
          title: `Pembaruan Status/Kehadiran: ${existing.title}`,
          message: `Status: ${nextStatus} · Kehadiran: ${nextAttendance}. Oleh ${actor.full_name}.`,
          reference_entity: 'agendas',
          reference_id: id,
          excludeUserId: actor.id,
          securityApprovedOnly: existing.approved_for_security,
        });
      }

      res.json({agenda: updated});
      return;
    }

    if (!canManageAgenda(actor.role)) {
      logForbidden(
        req,
        res,
        'agendas',
        id,
        'Hanya Admin SIMPRO yang berwenang mengubah detail agenda atau membatalkannya.'
      );
      return;
    }

    const nextLeader = (req.body?.leader ?? existing.leader) as LeaderCode;
    const nextTitle = typeof req.body?.title === 'string' ? req.body.title.trim() : existing.title;
    let nextStartsAt = existing.starts_at;
    if (req.body?.starts_at !== undefined) {
      if (typeof req.body.starts_at !== 'string' || Number.isNaN(Date.parse(req.body.starts_at))) {
        res.status(400).json({error: 'Tanggal dan waktu mulai kegiatan tidak valid.'});
        return;
      }
      nextStartsAt = new Date(req.body.starts_at).toISOString();
    }
    const nextLocation =
      typeof req.body?.location === 'string' ? req.body.location.trim() : existing.location;
    const nextPic = typeof req.body?.pic === 'string' ? req.body.pic.trim() : existing.pic;
    const nextNotes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : existing.notes;
    const nextDocNotes =
      typeof req.body?.documentation_notes === 'string'
        ? req.body.documentation_notes.trim()
        : existing.documentation_notes;
    const nextStatus = req.body?.status ?? existing.status;
    const nextAttendance = (req.body?.leader_attendance ??
      existing.leader_attendance) as LeaderAttendance;
    const nextAttendanceNote =
      typeof req.body?.attendance_note === 'string'
        ? req.body.attendance_note.trim()
        : existing.attendance_note;
    const nextApproved =
      typeof req.body?.approved_for_security === 'boolean'
        ? req.body.approved_for_security
        : existing.approved_for_security;

    const validationError = validateAgendaInput({
      leader: nextLeader,
      title: nextTitle,
      starts_at: nextStartsAt,
      location: nextLocation,
      status: nextStatus,
      leader_attendance: nextAttendance,
    });
    if (validationError) {
      res.status(400).json({error: validationError});
      return;
    }

    const changeReason =
      typeof req.body?.change_reason === 'string' ? req.body.change_reason.trim() : '';
    const requiresReason =
      nextStatus === 'dibatalkan' ||
      nextLocation !== existing.location ||
      nextStartsAt !== existing.starts_at;
    const isImportantChange =
      requiresReason ||
      nextStatus !== existing.status ||
      nextAttendance !== existing.leader_attendance;

    if (requiresReason && changeReason.length < 3) {
      res.status(400).json({
        error:
          'Perubahan jadwal, lokasi, atau pembatalan agenda wajib menyertakan alasan perubahan (minimal 3 karakter).',
      });
      return;
    }

    const now = new Date().toISOString();
    db.db
      .prepare(
        `UPDATE agendas
         SET leader = ?, title = ?, starts_at = ?, location = ?, pic = ?, notes = ?, documentation_notes = ?, status = ?, leader_attendance = ?, attendance_note = ?, approved_for_security = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        nextLeader,
        nextTitle,
        nextStartsAt,
        nextLocation,
        nextPic,
        nextNotes,
        nextDocNotes,
        nextStatus,
        nextAttendance,
        nextAttendanceNote,
        nextApproved ? 1 : 0,
        actor.id,
        now,
        id
      );

    const updated = db.getAgendaById(id)!;
    const changeType = nextStatus === 'dibatalkan' ? 'dibatalkan' : 'diubah';

    db.db
      .prepare(
        `INSERT INTO agenda_histories (id, agenda_id, changed_by, change_type, previous_data, new_data, change_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        id,
        actor.id,
        changeType,
        JSON.stringify(existing),
        JSON.stringify(updated),
        changeReason || 'Pembaruan agenda/status/kehadiran oleh Admin SIMPRO',
        now
      );

    db.writeAuditLog({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: changeType === 'dibatalkan' ? 'AGENDA_CANCELLED' : 'AGENDA_UPDATED',
      entity: 'agendas',
      entity_id: id,
      metadata: {
        change_reason: changeReason,
        location_changed: nextLocation !== existing.location,
        status_changed: nextStatus !== existing.status,
        attendance_changed: nextAttendance !== existing.leader_attendance,
      },
    });

    const notifRoles: UserRole[] = [
      'admin',
      'protokol',
      'dokumentasi',
      'pengamanan',
      nextLeader === 'bupati' ? 'ajudan_bupati' : 'ajudan_wakil_bupati',
    ];

    if (nextStatus === 'dibatalkan') {
      db.dispatchNotifications({
        roles: notifRoles,
        type: 'AGENDA_DIBATALKAN',
        title: `Agenda Dibatalkan: ${nextTitle}`,
        message: `Dibatalkan oleh ${actor.full_name}. Alasan: ${changeReason}.`,
        reference_entity: 'agendas',
        reference_id: id,
        excludeUserId: actor.id,
        securityApprovedOnly: nextApproved,
      });
    } else if (nextLocation !== existing.location) {
      db.dispatchNotifications({
        roles: notifRoles,
        type: 'LOKASI_BERUBAH',
        title: `Perubahan Lokasi Agenda: ${nextTitle}`,
        message: `Lokasi berubah dari "${existing.location}" menjadi "${nextLocation}". Alasan: ${changeReason}.`,
        reference_entity: 'agendas',
        reference_id: id,
        excludeUserId: actor.id,
        securityApprovedOnly: nextApproved,
      });
    } else if (isImportantChange) {
      db.dispatchNotifications({
        roles: notifRoles,
        type: 'AGENDA_BERUBAH',
        title: `Perubahan Agenda: ${nextTitle}`,
        message: `Status: ${nextStatus} · Kehadiran: ${nextAttendance}.${
          changeReason ? ` Alasan: ${changeReason}.` : ''
        }`,
        reference_entity: 'agendas',
        reference_id: id,
        excludeUserId: actor.id,
        securityApprovedOnly: nextApproved,
      });
    }

    res.json({agenda: updated});
  });

  router.delete('/agendas/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    if (!canManageAgenda(actor.role)) {
      logForbidden(
        req,
        res,
        'agendas',
        String(req.params.id),
        'Hanya Admin SIMPRO yang berwenang menghapus agenda.'
      );
      return;
    }

    const id = String(req.params.id);
    const existing = db.getAgendaById(id);
    if (!existing) {
      res.status(404).json({error: 'Agenda tidak ditemukan.'});
      return;
    }

    const runDelete = db.db.transaction(() => {
      db.db.prepare('DELETE FROM agenda_histories WHERE agenda_id = ?').run(id);
      db.db.prepare('DELETE FROM agendas WHERE id = ?').run(id);
      db.writeAuditLog({
        actor_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        action: 'AGENDA_DELETED',
        entity: 'agendas',
        entity_id: id,
        metadata: {
          leader: existing.leader,
          title: existing.title,
          starts_at: existing.starts_at,
          location: existing.location,
        },
      });
    });

    runDelete();
    res.json({ok: true, deletedId: id});
  });

  // --------------------------------------------------------------------------
  // LEADER STATUS UPDATES & IDEMPOTENT OFFLINE SYNC
  // --------------------------------------------------------------------------
  router.get('/updates', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    const updates = filterUpdatesForRole(db.listLeaderUpdates(300), actor.role);
    res.json({updates});
  });

  const processLeaderUpdate = (
    actor: NonNullable<AuthenticatedRequest['currentUser']>,
    body: Record<string, unknown>
  ): {status: number; payload: Record<string, unknown>} => {
    const leader = body.leader as LeaderCode;
    const validationError = validateStatusUpdateInput({
      leader,
      status: typeof body.status === 'string' ? body.status : undefined,
      location_text: typeof body.location_text === 'string' ? body.location_text : undefined,
      client_update_id:
        typeof body.client_update_id === 'string' ? body.client_update_id : undefined,
      client_created_at:
        typeof body.client_created_at === 'string' ? body.client_created_at : undefined,
      latitude: typeof body.latitude === 'number' ? body.latitude : null,
      longitude: typeof body.longitude === 'number' ? body.longitude : null,
      accuracy_m: typeof body.accuracy_m === 'number' ? body.accuracy_m : null,
    });

    if (validationError) {
      return {status: 400, payload: {error: validationError}};
    }

    if (!canSubmitLeaderUpdate(actor.role, leader)) {
      db.writeAuditLog({
        actor_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        action: 'ACCESS_DENIED',
        entity: 'leader_updates',
        metadata: {
          attempted_leader: leader,
          reason: 'Ajudan/role tidak berwenang memperbarui pimpinan tersebut.',
        },
      });
      return {
        status: 403,
        payload: {
          error: `Role Anda (${actor.role}) tidak berwenang mengirim pembaruan status untuk ${
            leader === 'bupati' ? 'Bupati' : 'Wakil Bupati'
          }.`,
        },
      };
    }

    const clientUpdateId = String(body.client_update_id).trim();

    // Idempotency check: cegah duplikasi akibat retry / sinkronisasi ulang
    const duplicate = db.db
      .prepare(
        `SELECT lu.*, p.full_name as updated_by_name
         FROM leader_updates lu
         LEFT JOIN profiles p ON p.id = lu.updated_by
         WHERE lu.client_update_id = ? LIMIT 1`
      )
      .get(clientUpdateId) as Record<string, unknown> | undefined;

    if (duplicate) {
      return {
        status: 200,
        payload: {
          update: {
            ...duplicate,
            approved_for_security: Boolean(duplicate.approved_for_security),
          },
          deduplicated: true,
        },
      };
    }

    // Ambil status terakhir pimpinan sebagai previous_status (tidak menimpa riwayat!)
    const prevRow = db.db
      .prepare(
        'SELECT status FROM leader_updates WHERE leader = ? ORDER BY server_received_at DESC, created_at DESC LIMIT 1'
      )
      .get(leader) as {status: string} | undefined;

    const serverReceivedAt = new Date().toISOString();
    const clientCreatedAt = new Date(String(body.client_created_at)).toISOString();
    const id = crypto.randomUUID();
    const statusText = String(body.status).trim();
    const locationText = String(body.location_text).trim();
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    const latitude = typeof body.latitude === 'number' ? body.latitude : null;
    const longitude = typeof body.longitude === 'number' ? body.longitude : null;
    const accuracyM = typeof body.accuracy_m === 'number' ? body.accuracy_m : null;
    const gpsCapturedAt =
      typeof body.gps_captured_at === 'string' && !Number.isNaN(Date.parse(body.gps_captured_at))
        ? new Date(body.gps_captured_at).toISOString()
        : null;
    const approvedForSecurity = body.approved_for_security !== false;

    db.db
      .prepare(
        `INSERT INTO leader_updates (
          id, leader, previous_status, status, location_text, latitude, longitude, accuracy_m,
          gps_captured_at, note, approved_for_security, updated_by, created_at,
          client_update_id, client_created_at, server_received_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Berhasil tersinkron')`
      )
      .run(
        id,
        leader,
        prevRow?.status ?? null,
        statusText,
        locationText,
        latitude,
        longitude,
        accuracyM,
        gpsCapturedAt,
        note,
        approvedForSecurity ? 1 : 0,
        actor.id,
        clientCreatedAt,
        clientUpdateId,
        clientCreatedAt,
        serverReceivedAt
      );

    const saved = db.db
      .prepare(
        `SELECT lu.*, p.full_name as updated_by_name
         FROM leader_updates lu
         LEFT JOIN profiles p ON p.id = lu.updated_by
         WHERE lu.id = ? LIMIT 1`
      )
      .get(id) as Record<string, unknown>;

    db.writeAuditLog({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'LEADER_STATUS_UPDATED',
      entity: 'leader_updates',
      entity_id: id,
      metadata: {
        leader,
        previous_status: prevRow?.status ?? null,
        status: statusText,
        has_gps: latitude !== null && longitude !== null,
        client_update_id: clientUpdateId,
      },
    });

    const settings = db.getSettings();
    const matchedOption = settings.status_options.find((opt) => opt.code === statusText);
    const isImportant = matchedOption ? matchedOption.important : true;

    if (isImportant) {
      db.dispatchNotifications({
        roles: ['protokol', 'dokumentasi', 'pengamanan'],
        type: 'STATUS_PENTING',
        title: `Pembaruan Status ${leader === 'bupati' ? 'Bupati' : 'Wakil Bupati'}: ${statusText}`,
        message: `Lokasi: ${locationText}. Dikirim oleh ${actor.full_name}.`,
        reference_entity: 'leader_updates',
        reference_id: id,
        excludeUserId: actor.id,
        securityApprovedOnly: approvedForSecurity,
      });
    }

    if (latitude !== null && longitude !== null) {
      const liveLoc = db.upsertLiveLocation({
        leader,
        latitude,
        longitude,
        accuracy_m: accuracyM,
        location_text: locationText,
        status: statusText,
        is_live_streaming: Boolean(body.is_live_streaming),
        approved_for_security: approvedForSecurity,
        updated_by: actor.id,
        updated_at: serverReceivedAt,
      });
      options?.onLiveLocationUpdated?.(liveLoc);
    }

    return {
      status: 201,
      payload: {
        update: {
          ...saved,
          approved_for_security: Boolean(saved.approved_for_security),
        },
        deduplicated: false,
      },
    };
  };

  router.post('/updates', requireAuth, (req: AuthenticatedRequest, res) => {
    const result = processLeaderUpdate(req.currentUser!, req.body || {});
    res.status(result.status).json(result.payload);
  });

  router.post('/updates/sync', requireAuth, (req: AuthenticatedRequest, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      res.status(400).json({error: 'Antrean sinkronisasi kosong.'});
      return;
    }
    if (items.length > 50) {
      res.status(400).json({error: 'Maksimal 50 item per batch sinkronisasi.'});
      return;
    }

    const results = items.map((item: Record<string, unknown>) => {
      const outcome = processLeaderUpdate(req.currentUser!, item);
      return {
        client_update_id: item.client_update_id,
        ok: outcome.status >= 200 && outcome.status < 300,
        status: outcome.status,
        ...outcome.payload,
      };
    });

    res.json({results});
  });

  // --------------------------------------------------------------------------
  // LIVE LOCATION (GOOGLE MAPS REAL-TIME SYNC)
  // --------------------------------------------------------------------------
  router.get('/live-locations', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    const locations = filterLiveLocationsForRole(db.listLiveLocations(), actor.role);
    res.json({locations});
  });

  router.post('/live-locations', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    const leader = typeof req.body?.leader === 'string' ? req.body.leader : '';
    if (!isValidLeader(leader)) {
      res.status(400).json({error: 'Pimpinan harus dipilih (Bupati atau Wakil Bupati).'});
      return;
    }

    if (!canSubmitLeaderUpdate(actor.role, leader)) {
      logForbidden(
        req,
        res,
        'live_locations',
        leader,
        `Role Anda (${actor.role}) tidak berwenang memperbarui live location untuk ${
          leader === 'bupati' ? 'Bupati' : 'Wakil Bupati'
        }.`
      );
      return;
    }

    const lat = req.body?.latitude;
    const lng = req.body?.longitude;
    if (
      typeof lat !== 'number' ||
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      typeof lng !== 'number' ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180
    ) {
      res.status(400).json({error: 'Koordinat latitude/longitude GPS tidak valid.'});
      return;
    }

    const existing = db.getLiveLocation(leader);
    const wasStreaming = Boolean(existing?.is_live_streaming);

    const updated = db.upsertLiveLocation({
      leader,
      latitude: lat,
      longitude: lng,
      accuracy_m:
        typeof req.body?.accuracy_m === 'number' && req.body.accuracy_m >= 0
          ? req.body.accuracy_m
          : null,
      heading:
        typeof req.body?.heading === 'number' && Number.isFinite(req.body.heading)
          ? req.body.heading
          : null,
      speed_mps:
        typeof req.body?.speed_mps === 'number' && req.body.speed_mps >= 0
          ? req.body.speed_mps
          : null,
      location_text:
        typeof req.body?.location_text === 'string' ? req.body.location_text : undefined,
      status: typeof req.body?.status === 'string' ? req.body.status : undefined,
      is_live_streaming: req.body?.is_live_streaming !== false,
      approved_for_security:
        typeof req.body?.approved_for_security === 'boolean'
          ? req.body.approved_for_security
          : true,
      updated_by: actor.id,
    });

    if (!wasStreaming && updated.is_live_streaming) {
      db.writeAuditLog({
        actor_id: actor.id,
        actor_email: actor.email,
        actor_role: actor.role,
        action: 'LIVE_LOCATION_STARTED',
        entity: 'live_locations',
        entity_id: leader,
        metadata: {latitude: lat, longitude: lng},
      });
    }

    options?.onLiveLocationUpdated?.(updated);
    res.json({location: updated});
  });

  router.post('/live-locations/stop', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    const leader = typeof req.body?.leader === 'string' ? req.body.leader : '';
    if (!isValidLeader(leader)) {
      res.status(400).json({error: 'Pimpinan tidak valid.'});
      return;
    }
    if (!canSubmitLeaderUpdate(actor.role, leader)) {
      logForbidden(
        req,
        res,
        'live_locations',
        leader,
        `Role Anda (${actor.role}) tidak berwenang menghentikan live location pimpinan tersebut.`
      );
      return;
    }

    const stopped = db.stopLiveStreaming(leader, actor.id);
    db.writeAuditLog({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'LIVE_LOCATION_STOPPED',
      entity: 'live_locations',
      entity_id: leader,
    });
    if (stopped) {
      options?.onLiveLocationUpdated?.(stopped);
    }
    res.json({ok: true, location: stopped});
  });

  // --------------------------------------------------------------------------
  // NOTIFICATIONS
  // --------------------------------------------------------------------------
  router.get('/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
    const notifications = db.listNotificationsForUser(req.currentUser!.id);
    res.json({notifications});
  });

  router.patch('/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
    const result = db.db
      .prepare('UPDATE notifications SET status = ? WHERE id = ? AND recipient_id = ?')
      .run('read', String(req.params.id), req.currentUser!.id);
    if (result.changes === 0) {
      res.status(404).json({error: 'Notifikasi tidak ditemukan.'});
      return;
    }
    res.json({ok: true});
  });

  router.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
    db.db
      .prepare('UPDATE notifications SET status = ? WHERE recipient_id = ?')
      .run('read', req.currentUser!.id);
    res.json({ok: true});
  });

  // --------------------------------------------------------------------------
  // REPORTS EXPORT AUDIT LOGGING
  // --------------------------------------------------------------------------
  router.post('/reports/export-log', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    if (!canExportReports(actor.role)) {
      logForbidden(
        req,
        res,
        'reports',
        null,
        'Role Pimpinan / Viewer hanya memiliki akses baca dashboard ringkasan dan tidak diizinkan mengekspor data.'
      );
      return;
    }

    db.writeAuditLog({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'REPORT_EXPORTED',
      entity: 'reports',
      metadata: {
        report_type: req.body?.report_type || 'unknown',
        format: req.body?.format || 'csv',
        record_count: Number(req.body?.record_count || 0),
      },
    });
    res.json({ok: true});
  });

  // --------------------------------------------------------------------------
  // ADMIN: USER MANAGEMENT, AUDIT LOGS, SQL MIGRATION & BACKUP/RESTORE
  // --------------------------------------------------------------------------
  router.get('/admin/users', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    if (!canManageUsers(actor.role)) {
      logForbidden(
        req,
        res,
        'profiles',
        null,
        'Hanya Admin SIMPRO yang berwenang melihat daftar seluruh akun pengguna.'
      );
      return;
    }
    res.json({users: db.listUsers()});
  });

  router.post('/admin/users', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    if (!canManageUsers(actor.role)) {
      logForbidden(
        req,
        res,
        'profiles',
        null,
        'Hanya Admin SIMPRO yang berwenang membuat akun pengguna baru.'
      );
      return;
    }

    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const role = typeof req.body?.role === 'string' ? req.body.role : '';
    const isActive = req.body?.is_active !== false;

    if (fullName.length < 3) {
      res.status(400).json({error: 'Nama lengkap minimal 3 karakter.'});
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({error: 'Format email tidak valid.'});
      return;
    }
    if (password.length < 8) {
      res.status(400).json({error: 'Kata sandi awal minimal 8 karakter.'});
      return;
    }
    if (!isValidRole(role)) {
      res.status(400).json({error: 'Role pengguna tidak valid.'});
      return;
    }
    if (db.getUserByEmail(email)) {
      res.status(409).json({error: 'Email tersebut sudah terdaftar pada akun lain.'});
      return;
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const unitCode =
      role === 'ajudan_bupati' ? 'bupati' : role === 'ajudan_wakil_bupati' ? 'wakil_bupati' : null;

    db.db
      .prepare(
        `INSERT INTO profiles (id, full_name, email, password_hash, role, unit_code, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, fullName, email, hashPassword(password), role, unitCode, isActive ? 1 : 0, now, now);

    const created = db.getUserById(id)!;
    db.writeAuditLog({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'USER_CREATED',
      entity: 'profiles',
      entity_id: id,
      metadata: {email, role, is_active: isActive},
    });

    res.status(201).json({user: created});
  });

  router.patch('/admin/users/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    if (!canManageUsers(actor.role)) {
      logForbidden(
        req,
        res,
        'profiles',
        String(req.params.id),
        'Hanya Admin SIMPRO yang berwenang mengubah role atau status akun.'
      );
      return;
    }

    const targetId = String(req.params.id);
    const existing = db.getUserById(targetId);
    if (!existing) {
      res.status(404).json({error: 'Pengguna tidak ditemukan.'});
      return;
    }

    // Larangan mengubah role atau menonaktifkan diri sendiri
    if (targetId === actor.id) {
      if (
        (typeof req.body?.role === 'string' && req.body.role !== existing.role) ||
        req.body?.is_active === false
      ) {
        logForbidden(
          req,
          res,
          'profiles',
          targetId,
          'Administrator tidak diperbolehkan mengubah role atau menonaktifkan akunnya sendiri.'
        );
        return;
      }
    }

    const nextName =
      typeof req.body?.full_name === 'string' && req.body.full_name.trim().length >= 3
        ? req.body.full_name.trim()
        : existing.full_name;
    const nextRole =
      typeof req.body?.role === 'string' && isValidRole(req.body.role)
        ? req.body.role
        : existing.role;
    const nextActive =
      typeof req.body?.is_active === 'boolean' ? req.body.is_active : existing.is_active;
    const nextUnitCode =
      nextRole === 'ajudan_bupati'
        ? 'bupati'
        : nextRole === 'ajudan_wakil_bupati'
          ? 'wakil_bupati'
          : null;

    const now = new Date().toISOString();
    db.db
      .prepare(
        'UPDATE profiles SET full_name = ?, role = ?, unit_code = ?, is_active = ?, updated_at = ? WHERE id = ?'
      )
      .run(nextName, nextRole, nextUnitCode, nextActive ? 1 : 0, now, targetId);

    if (typeof req.body?.new_password === 'string' && req.body.new_password.length >= 8) {
      db.db
        .prepare('UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(hashPassword(req.body.new_password), now, targetId);
    }

    const updated = db.getUserById(targetId)!;
    db.writeAuditLog({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'USER_UPDATED',
      entity: 'profiles',
      entity_id: targetId,
      metadata: {
        previous_role: existing.role,
        new_role: nextRole,
        previous_active: existing.is_active,
        new_active: nextActive,
        password_reset: Boolean(req.body?.new_password),
      },
    });

    res.json({user: updated});
  });

  router.get('/admin/audit-logs', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    if (!canViewAuditLogs(actor.role)) {
      logForbidden(
        req,
        res,
        'audit_logs',
        null,
        'Hanya Admin SIMPRO yang berwenang melihat audit log keamanan.'
      );
      return;
    }
    res.json({logs: db.listAuditLogs(250)});
  });

  router.get('/admin/migration-sql', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    if (!canManageSettings(actor.role)) {
      logForbidden(req, res, 'migrations', null, 'Akses khusus Admin SIMPRO.');
      return;
    }
    const sqlPath = path.resolve(process.cwd(), 'supabase/migrations/001_simpro_v1_schema.sql');
    const sql = fs.existsSync(sqlPath) ? fs.readFileSync(sqlPath, 'utf8') : '';
    res.json({filename: '001_simpro_v1_schema.sql', sql});
  });

  router.get('/admin/backup', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    if (!canManageSettings(actor.role)) {
      logForbidden(req, res, 'backup', null, 'Hanya Admin SIMPRO yang berwenang mengunduh backup.');
      return;
    }

    const snapshot = {
      exported_at: new Date().toISOString(),
      exported_by: actor.email,
      schema_version: 'simpro_v1.0',
      counts: {
        profiles: db.listUsers().length,
        agendas: db.listAgendas().length,
        agenda_histories: db.listAgendaHistories().length,
        leader_updates: db.listLeaderUpdates(1000).length,
        audit_logs: db.listAuditLogs(1000).length,
      },
      data: {
        settings: db.getSettings(),
        profiles: db.listUsers(),
        agendas: db.listAgendas(),
        agenda_histories: db.listAgendaHistories(),
        leader_updates: db.listLeaderUpdates(1000),
      },
    };

    db.writeAuditLog({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'BACKUP_EXPORTED',
      entity: 'system',
      metadata: snapshot.counts,
    });

    res.json(snapshot);
  });

  router.post('/admin/backup/verify', requireAuth, (req: AuthenticatedRequest, res) => {
    const actor = req.currentUser!;
    if (!canManageSettings(actor.role)) {
      logForbidden(req, res, 'backup', null, 'Hanya Admin SIMPRO yang berwenang memverifikasi backup.');
      return;
    }

    const body = req.body;
    const valid =
      body &&
      body.schema_version === 'simpro_v1.0' &&
      body.data &&
      Array.isArray(body.data.profiles) &&
      Array.isArray(body.data.agendas) &&
      Array.isArray(body.data.leader_updates);

    db.writeAuditLog({
      actor_id: actor.id,
      actor_email: actor.email,
      actor_role: actor.role,
      action: 'BACKUP_RESTORE_DRY_RUN',
      entity: 'system',
      metadata: {
        valid: Boolean(valid),
        verified_counts: valid
          ? {
              profiles: body.data.profiles.length,
              agendas: body.data.agendas.length,
              leader_updates: body.data.leader_updates.length,
            }
          : null,
      },
    });

    if (!valid) {
      res.status(400).json({
        valid: false,
        error: 'Format berkas backup SIMPRO tidak valid atau struktur tabel inti tidak lengkap.',
      });
      return;
    }

    res.json({
      valid: true,
      message: 'Uji validasi struktur backup berhasil (dry-run tanpa menimpa data aktif).',
      verified_counts: {
        profiles: body.data.profiles.length,
        agendas: body.data.agendas.length,
        leader_updates: body.data.leader_updates.length,
      },
    });
  });

  return router;
}
