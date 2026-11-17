import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import {
  DEFAULT_STATUS_OPTIONS,
  type AgendaHistoryItem,
  type AgendaItem,
  type AppSettings,
  type AuditLogItem,
  type LeaderCode,
  type LeaderUpdateItem,
  type LiveLocationRecord,
  type NotificationItem,
  type UserProfile,
  type UserRole,
} from '../src/types/simpro.ts';
import {hashPassword} from './auth.ts';

export interface ProfileRow extends UserProfile {
  password_hash: string;
}

export class SimproDatabase {
  public db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath || process.env.SIMPRO_SQLITE_PATH || path.resolve(process.cwd(), 'data/simpro.db');

    if (resolvedPath !== ':memory:') {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive: true});
      }
    }

    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
    this.seedDefaults();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS monitoring_units (
        code TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        unit_type TEXT NOT NULL,
        is_active_v1 INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 100,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        unit_code TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_by TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agendas (
        id TEXT PRIMARY KEY,
        leader TEXT NOT NULL,
        title TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        location TEXT NOT NULL,
        pic TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        documentation_notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'terjadwal',
        leader_attendance TEXT NOT NULL DEFAULT 'belum_konfirmasi',
        attendance_note TEXT NOT NULL DEFAULT '',
        approved_for_security INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        updated_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agenda_histories (
        id TEXT PRIMARY KEY,
        agenda_id TEXT NOT NULL,
        changed_by TEXT NOT NULL,
        change_type TEXT NOT NULL,
        previous_data TEXT,
        new_data TEXT NOT NULL,
        change_reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS leader_updates (
        id TEXT PRIMARY KEY,
        leader TEXT NOT NULL,
        previous_status TEXT,
        status TEXT NOT NULL,
        location_text TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        accuracy_m REAL,
        gps_captured_at TEXT,
        note TEXT NOT NULL DEFAULT '',
        approved_for_security INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        client_update_id TEXT UNIQUE NOT NULL,
        client_created_at TEXT NOT NULL,
        server_received_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'Berhasil tersinkron'
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT,
        actor_email TEXT,
        actor_role TEXT,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        timestamp TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        recipient_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        reference_entity TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unread',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS live_locations (
        leader TEXT PRIMARY KEY,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy_m REAL,
        heading REAL,
        speed_mps REAL,
        location_text TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT '',
        is_live_streaming INTEGER NOT NULL DEFAULT 0,
        is_test_seed INTEGER NOT NULL DEFAULT 0,
        approved_for_security INTEGER NOT NULL DEFAULT 1,
        updated_by TEXT,
        updated_at TEXT NOT NULL
      );
    `);

    // Migrasi non-destruktif untuk database SQLite yang sudah ada sebelumnya
    const agendaCols = this.db.prepare('PRAGMA table_info(agendas)').all() as Array<{name: string}>;
    const colNames = new Set(agendaCols.map((c) => c.name));
    if (!colNames.has('leader_attendance')) {
      this.db.exec(
        "ALTER TABLE agendas ADD COLUMN leader_attendance TEXT NOT NULL DEFAULT 'belum_konfirmasi'"
      );
    }
    if (!colNames.has('attendance_note')) {
      this.db.exec("ALTER TABLE agendas ADD COLUMN attendance_note TEXT NOT NULL DEFAULT ''");
    }
  }

  private seedDefaults(): void {
    const now = new Date().toISOString();

    const insertUnit = this.db.prepare(`
      INSERT OR IGNORE INTO monitoring_units (code, display_name, unit_type, is_active_v1, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertUnit.run('bupati', 'Bupati', 'pimpinan', 1, 1, now);
    insertUnit.run('wakil_bupati', 'Wakil Bupati', 'pimpinan', 1, 2, now);
    insertUnit.run('sekretaris_daerah', 'Sekretaris Daerah (Terencana Fase Lanjut)', 'sekretariat', 0, 3, now);

    const insertSetting = this.db.prepare(`
      INSERT OR IGNORE INTO app_settings (key, value, updated_by, updated_at)
      VALUES (?, ?, NULL, ?)
    `);
    insertSetting.run('viewer_enabled', JSON.stringify(false), now);
    insertSetting.run('stale_threshold_minutes', JSON.stringify(60), now);
    insertSetting.run('bupati_display_name', JSON.stringify('Bupati'), now);
    insertSetting.run('wakil_bupati_display_name', JSON.stringify('Wakil Bupati'), now);
    insertSetting.run('status_options', JSON.stringify(DEFAULT_STATUS_OPTIONS), now);

    const userCount = (
      this.db.prepare('SELECT COUNT(*) as cnt FROM profiles').get() as {cnt: number}
    ).cnt;

    if (userCount === 0) {
      // Seed akun uji internal per peran (hanya untuk pengujian lokal, bukan kredensial produksi)
      const seedUsers: Array<{
        id: string;
        full_name: string;
        email: string;
        password: string;
        role: UserRole;
        unit_code: string | null;
      }> = [
        {
          id: 'usr-admin-001',
          full_name: 'Hendra Wijaya (Admin Uji)',
          email: 'admin@simpro.local',
          password: 'Simpro#Admin2026',
          role: 'admin',
          unit_code: null,
        },
        {
          id: 'usr-ajudan-bup-001',
          full_name: 'Rizky Pratama (Ajudan Bupati Uji)',
          email: 'ajudan.bupati@simpro.local',
          password: 'Simpro#Bupati2026',
          role: 'ajudan_bupati',
          unit_code: 'bupati',
        },
        {
          id: 'usr-ajudan-wabup-001',
          full_name: 'Bagas Santoso (Ajudan Wabup Uji)',
          email: 'ajudan.wabup@simpro.local',
          password: 'Simpro#Wabup2026',
          role: 'ajudan_wakil_bupati',
          unit_code: 'wakil_bupati',
        },
        {
          id: 'usr-protokol-001',
          full_name: 'Siti Rahmawati (Protokol Uji)',
          email: 'protokol@simpro.local',
          password: 'Simpro#Protokol2026',
          role: 'protokol',
          unit_code: null,
        },
        {
          id: 'usr-dok-001',
          full_name: 'Dimas Nugroho (Dokumentasi Uji)',
          email: 'dokumentasi@simpro.local',
          password: 'Simpro#Dok2026',
          role: 'dokumentasi',
          unit_code: null,
        },
        {
          id: 'usr-pam-001',
          full_name: 'Arif Budiman (Pengamanan Uji)',
          email: 'pengamanan@simpro.local',
          password: 'Simpro#Pam2026',
          role: 'pengamanan',
          unit_code: null,
        },
        {
          id: 'usr-viewer-001',
          full_name: 'Sekretariat Pimpinan (Viewer Uji)',
          email: 'pimpinan@simpro.local',
          password: 'Simpro#Viewer2026',
          role: 'pimpinan_viewer',
          unit_code: null,
        },
      ];

      const insertUser = this.db.prepare(`
        INSERT INTO profiles (id, full_name, email, password_hash, role, unit_code, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);
      for (const u of seedUsers) {
        insertUser.run(
          u.id,
          u.full_name,
          u.email.toLowerCase(),
          hashPassword(u.password),
          u.role,
          u.unit_code,
          now,
          now
        );
      }

      // Seed data uji agenda hari ini & minggu ini agar pengujian fungsional segera dapat dijalankan
      const today = new Date();
      const atTime = (dayOffset: number, hour: number, minute: number) => {
        const d = new Date(today);
        d.setDate(d.getDate() + dayOffset);
        d.setHours(hour, minute, 0, 0);
        return d.toISOString();
      };

      const seedAgendas = [
        {
          id: 'agd-001',
          leader: 'bupati',
          title: '[Uji] Rapat Koordinasi Pengendalian Inflasi Daerah',
          starts_at: atTime(0, 9, 0),
          location: 'Ruang Rapat Utama Pendopo Kabupaten',
          pic: 'Bagian Perekonomian Setda',
          notes: 'Paparan TPID triwulan berjalan dan kesiapan pasokan pangan.',
          documentation_notes: 'Siapkan 2 kamera foto, perekam audio podium, dan backdrop resmi.',
          status: 'berlangsung',
          leader_attendance: 'hadir',
          attendance_note: 'Hadir langsung memimpin rapat TPID.',
          approved_for_security: 1,
          created_by: 'usr-protokol-001',
          created_at: atTime(-1, 16, 0),
        },
        {
          id: 'agd-002',
          leader: 'bupati',
          title: '[Uji] Peninjauan Pembangunan Layanan Kesehatan Primer',
          starts_at: atTime(0, 13, 30),
          location: 'Kecamatan Sukamaju',
          pic: 'Kepala Dinas Kesehatan',
          notes: 'Peninjauan progres fisik gedung dan dialog tenaga kesehatan.',
          documentation_notes: 'Perlu kamera liputan lapangan dan drone area halaman depan.',
          status: 'terjadwal',
          leader_attendance: 'belum_konfirmasi',
          attendance_note: '',
          approved_for_security: 1,
          created_by: 'usr-protokol-001',
          created_at: atTime(-1, 16, 15),
        },
        {
          id: 'agd-003',
          leader: 'wakil_bupati',
          title: '[Uji] Pembukaan Forum Konsultasi Publik Rencana Kerja Daerah',
          starts_at: atTime(0, 10, 0),
          location: 'Gedung Serbaguna Bappeda Lantai 2',
          pic: 'Kepala Bappeda',
          notes: 'Sambutan pembukaan dan penandatanganan berita acara forum.',
          documentation_notes: 'Koordinasi meja media dan perekaman sambutan pembukaan.',
          status: 'terjadwal',
          leader_attendance: 'hadir',
          attendance_note: 'Terkonfirmasi hadir membuka acara.',
          approved_for_security: 1,
          created_by: 'usr-protokol-001',
          created_at: atTime(-1, 16, 30),
        },
        {
          id: 'agd-004',
          leader: 'wakil_bupati',
          title: '[Uji] Rapat Internal Persiapan Evaluasi Kinerja Internal (Terbatas)',
          starts_at: atTime(1, 15, 0),
          location: 'Ruang Kerja Wakil Bupati',
          pic: 'Staf Khusus Protokol',
          notes: 'Agenda internal terbatas belum disetujui untuk publikasi pengamanan lapangan.',
          documentation_notes: 'Dokumentasi internal terbatas.',
          status: 'terjadwal',
          leader_attendance: 'belum_konfirmasi',
          attendance_note: '',
          approved_for_security: 0,
          created_by: 'usr-protokol-001',
          created_at: atTime(-1, 17, 0),
        },
      ];

      const insertAgenda = this.db.prepare(`
        INSERT INTO agendas (id, leader, title, starts_at, location, pic, notes, documentation_notes, status, leader_attendance, attendance_note, approved_for_security, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertAgendaHist = this.db.prepare(`
        INSERT INTO agenda_histories (id, agenda_id, changed_by, change_type, previous_data, new_data, change_reason, created_at)
        VALUES (?, ?, ?, 'dibuat', NULL, ?, 'Inisiasi data uji internal v1.0', ?)
      `);
      for (const a of seedAgendas) {
        insertAgenda.run(
          a.id,
          a.leader,
          a.title,
          a.starts_at,
          a.location,
          a.pic,
          a.notes,
          a.documentation_notes,
          a.status,
          a.leader_attendance,
          a.attendance_note,
          a.approved_for_security,
          a.created_by,
          a.created_by,
          a.created_at,
          a.created_at
        );
        insertAgendaHist.run(crypto.randomUUID(), a.id, a.created_by, JSON.stringify(a), a.created_at);
      }

      const bupTime = new Date(Date.now() - 18 * 60 * 1000).toISOString();
      const wabupTime = new Date(Date.now() - 85 * 60 * 1000).toISOString(); // > 60 min untuk demo indikator kedaluwarsa

      const insertUpdate = this.db.prepare(`
        INSERT INTO leader_updates (id, leader, previous_status, status, location_text, latitude, longitude, accuracy_m, gps_captured_at, note, approved_for_security, updated_by, created_at, client_update_id, client_created_at, server_received_at, sync_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'Berhasil tersinkron')
      `);

      insertUpdate.run(
        'upd-001',
        'bupati',
        'Tiba di lokasi',
        'Kegiatan berlangsung',
        'Ruang Rapat Utama Pendopo Kabupaten',
        null,
        null,
        null,
        null,
        '[Data Uji] Rapat TPID sedang berlangsung sesuai jadwal.',
        'usr-ajudan-bup-001',
        bupTime,
        '00000000-0000-4000-8000-000000000101',
        bupTime,
        bupTime
      );

      insertUpdate.run(
        'upd-002',
        'wakil_bupati',
        'Persiapan',
        'Perjalanan menuju lokasi',
        'Jalan Merdeka menuju Gedung Bappeda',
        null,
        null,
        null,
        null,
        '[Data Uji] Rombongan bertolak dari rumah dinas menuju Bappeda.',
        'usr-ajudan-wabup-001',
        wabupTime,
        '00000000-0000-4000-8000-000000000102',
        wabupTime,
        wabupTime
      );
    }

    const liveLocCount = (
      this.db.prepare('SELECT COUNT(*) as cnt FROM live_locations').get() as {cnt: number}
    ).cnt;

    if (liveLocCount === 0) {
      const insertLiveLoc = this.db.prepare(`
        INSERT OR IGNORE INTO live_locations (
          leader, latitude, longitude, accuracy_m, heading, speed_mps, location_text, status,
          is_live_streaming, is_test_seed, approved_for_security, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 0, 1, 1, ?, ?)
      `);
      insertLiveLoc.run(
        'bupati',
        -7.4478,
        112.7183,
        18,
        'Pendopo Delta Wibawa Kabupaten Sidoarjo (Titik Uji)',
        'Kegiatan berlangsung',
        'usr-ajudan-bup-001',
        now
      );
      insertLiveLoc.run(
        'wakil_bupati',
        -7.4452,
        112.7138,
        24,
        'Kawasan Bappeda Kabupaten Sidoarjo (Titik Uji)',
        'Perjalanan menuju lokasi',
        'usr-ajudan-wabup-001',
        now
      );
    }
  }

  public getUserByEmail(email: string): ProfileRow | null {
    const row = this.db
      .prepare('SELECT * FROM profiles WHERE lower(email) = lower(?) LIMIT 1')
      .get(email.trim()) as (Omit<ProfileRow, 'is_active'> & {is_active: number}) | undefined;
    if (!row) return null;
    return {...row, is_active: Boolean(row.is_active)};
  }

  public getUserById(id: string): UserProfile | null {
    const row = this.db
      .prepare(
        'SELECT id, full_name, email, role, unit_code, is_active, created_at, updated_at FROM profiles WHERE id = ? LIMIT 1'
      )
      .get(id) as (Omit<UserProfile, 'is_active'> & {is_active: number}) | undefined;
    if (!row) return null;
    return {...row, is_active: Boolean(row.is_active)};
  }

  public listUsers(): UserProfile[] {
    const rows = this.db
      .prepare(
        'SELECT id, full_name, email, role, unit_code, is_active, created_at, updated_at FROM profiles ORDER BY created_at ASC'
      )
      .all() as Array<Omit<UserProfile, 'is_active'> & {is_active: number}>;
    return rows.map((r) => ({...r, is_active: Boolean(r.is_active)}));
  }

  public getSettings(): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM app_settings').all() as Array<{
      key: string;
      value: string;
    }>;
    const map = new Map<string, unknown>();
    for (const r of rows) {
      try {
        map.set(r.key, JSON.parse(r.value));
      } catch {
        map.set(r.key, r.value);
      }
    }
    return {
      viewer_enabled: Boolean(map.get('viewer_enabled') ?? false),
      stale_threshold_minutes: Number(map.get('stale_threshold_minutes') ?? 60),
      bupati_display_name: String(map.get('bupati_display_name') ?? 'Bupati'),
      wakil_bupati_display_name: String(map.get('wakil_bupati_display_name') ?? 'Wakil Bupati'),
      status_options: Array.isArray(map.get('status_options'))
        ? (map.get('status_options') as AppSettings['status_options'])
        : DEFAULT_STATUS_OPTIONS,
    };
  }

  public listAgendas(): AgendaItem[] {
    const rows = this.db
      .prepare(
        `
        SELECT a.*,
               c.full_name as created_by_name,
               u.full_name as updated_by_name
        FROM agendas a
        LEFT JOIN profiles c ON c.id = a.created_by
        LEFT JOIN profiles u ON u.id = a.updated_by
        ORDER BY a.starts_at ASC
      `
      )
      .all() as Array<Omit<AgendaItem, 'approved_for_security'> & {approved_for_security: number}>;

    return rows.map((r) => ({
      ...r,
      approved_for_security: Boolean(r.approved_for_security),
    }));
  }

  public getAgendaById(id: string): AgendaItem | null {
    const row = this.db
      .prepare(
        `
        SELECT a.*,
               c.full_name as created_by_name,
               u.full_name as updated_by_name
        FROM agendas a
        LEFT JOIN profiles c ON c.id = a.created_by
        LEFT JOIN profiles u ON u.id = a.updated_by
        WHERE a.id = ?
      `
      )
      .get(id) as
      | (Omit<AgendaItem, 'approved_for_security'> & {approved_for_security: number})
      | undefined;

    if (!row) return null;
    return {...row, approved_for_security: Boolean(row.approved_for_security)};
  }

  public listAgendaHistories(agendaId?: string): AgendaHistoryItem[] {
    const sql = agendaId
      ? `SELECT h.*, p.full_name as changed_by_name, a.title as agenda_title, a.leader as leader
         FROM agenda_histories h
         LEFT JOIN profiles p ON p.id = h.changed_by
         LEFT JOIN agendas a ON a.id = h.agenda_id
         WHERE h.agenda_id = ?
         ORDER BY h.created_at DESC`
      : `SELECT h.*, p.full_name as changed_by_name, a.title as agenda_title, a.leader as leader
         FROM agenda_histories h
         LEFT JOIN profiles p ON p.id = h.changed_by
         LEFT JOIN agendas a ON a.id = h.agenda_id
         ORDER BY h.created_at DESC LIMIT 200`;

    const rows = (agendaId ? this.db.prepare(sql).all(agendaId) : this.db.prepare(sql).all()) as Array<{
      id: string;
      agenda_id: string;
      agenda_title?: string;
      leader?: 'bupati' | 'wakil_bupati';
      changed_by: string;
      changed_by_name?: string;
      change_type: AgendaHistoryItem['change_type'];
      previous_data: string | null;
      new_data: string;
      change_reason: string;
      created_at: string;
    }>;

    return rows.map((r) => ({
      ...r,
      previous_data: r.previous_data ? JSON.parse(r.previous_data) : null,
      new_data: JSON.parse(r.new_data),
    }));
  }

  public listLeaderUpdates(limit = 200): LeaderUpdateItem[] {
    const rows = this.db
      .prepare(
        `
        SELECT lu.*, p.full_name as updated_by_name
        FROM leader_updates lu
        LEFT JOIN profiles p ON p.id = lu.updated_by
        ORDER BY lu.server_received_at DESC, lu.created_at DESC
        LIMIT ?
      `
      )
      .all(limit) as Array<
      Omit<LeaderUpdateItem, 'approved_for_security'> & {approved_for_security: number}
    >;

    return rows.map((r) => ({
      ...r,
      approved_for_security: Boolean(r.approved_for_security),
    }));
  }

  public writeAuditLog(entry: {
    actor_id: string | null;
    actor_email: string | null;
    actor_role: string | null;
    action: string;
    entity: string;
    entity_id?: string | null;
    metadata?: Record<string, unknown>;
  }): void {
    this.db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, actor_email, actor_role, action, entity, entity_id, metadata, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        crypto.randomUUID(),
        entry.actor_id,
        entry.actor_email,
        entry.actor_role,
        entry.action,
        entry.entity,
        entry.entity_id ?? null,
        JSON.stringify(entry.metadata ?? {}),
        new Date().toISOString()
      );
  }

  public listAuditLogs(limit = 250): AuditLogItem[] {
    const rows = this.db
      .prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?')
      .all(limit) as Array<{
      id: string;
      actor_id: string | null;
      actor_email: string | null;
      actor_role: string | null;
      action: string;
      entity: string;
      entity_id: string | null;
      metadata: string;
      timestamp: string;
    }>;

    return rows.map((r) => ({
      ...r,
      metadata: r.metadata ? JSON.parse(r.metadata) : {},
    }));
  }

  public dispatchNotifications(params: {
    roles: UserRole[];
    type: NotificationItem['type'];
    title: string;
    message: string;
    reference_entity: string;
    reference_id: string;
    excludeUserId?: string;
    securityApprovedOnly?: boolean;
  }): void {
    const activeUsers = this.listUsers().filter(
      (u) => u.is_active && params.roles.includes(u.role) && u.id !== params.excludeUserId
    );
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO notifications (id, recipient_id, type, title, message, reference_entity, reference_id, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'unread', ?)
    `);

    for (const user of activeUsers) {
      if (params.securityApprovedOnly === false && user.role === 'pengamanan') {
        continue;
      }
      stmt.run(
        crypto.randomUUID(),
        user.id,
        params.type,
        params.title,
        params.message,
        params.reference_entity,
        params.reference_id,
        now
      );
    }
  }

  public listNotificationsForUser(userId: string): NotificationItem[] {
    return this.db
      .prepare('SELECT * FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 100')
      .all(userId) as NotificationItem[];
  }

  public listLiveLocations(): LiveLocationRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT ll.*, p.full_name as updated_by_name
        FROM live_locations ll
        LEFT JOIN profiles p ON p.id = ll.updated_by
        ORDER BY ll.leader ASC
      `
      )
      .all() as Array<
      Omit<LiveLocationRecord, 'is_live_streaming' | 'is_test_seed' | 'approved_for_security'> & {
        is_live_streaming: number;
        is_test_seed: number;
        approved_for_security: number;
      }
    >;

    return rows.map((r) => ({
      ...r,
      is_live_streaming: Boolean(r.is_live_streaming),
      is_test_seed: Boolean(r.is_test_seed),
      approved_for_security: Boolean(r.approved_for_security),
    }));
  }

  public getLiveLocation(leader: LeaderCode): LiveLocationRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT ll.*, p.full_name as updated_by_name
        FROM live_locations ll
        LEFT JOIN profiles p ON p.id = ll.updated_by
        WHERE ll.leader = ?
        LIMIT 1
      `
      )
      .get(leader) as
      | (Omit<
          LiveLocationRecord,
          'is_live_streaming' | 'is_test_seed' | 'approved_for_security'
        > & {
          is_live_streaming: number;
          is_test_seed: number;
          approved_for_security: number;
        })
      | undefined;

    if (!row) return null;
    return {
      ...row,
      is_live_streaming: Boolean(row.is_live_streaming),
      is_test_seed: Boolean(row.is_test_seed),
      approved_for_security: Boolean(row.approved_for_security),
    };
  }

  public upsertLiveLocation(input: {
    leader: LeaderCode;
    latitude: number;
    longitude: number;
    accuracy_m?: number | null;
    heading?: number | null;
    speed_mps?: number | null;
    location_text?: string;
    status?: string;
    is_live_streaming?: boolean;
    approved_for_security?: boolean;
    updated_by: string;
    updated_at?: string;
  }): LiveLocationRecord {
    const existing = this.getLiveLocation(input.leader);
    const updatedAt = input.updated_at || new Date().toISOString();
    const locationText =
      typeof input.location_text === 'string' && input.location_text.trim()
        ? input.location_text.trim().slice(0, 250)
        : existing?.location_text || '';
    const statusText =
      typeof input.status === 'string' && input.status.trim()
        ? input.status.trim().slice(0, 100)
        : existing?.status || 'Aktif';
    const approved =
      typeof input.approved_for_security === 'boolean'
        ? input.approved_for_security
        : existing?.approved_for_security ?? true;

    this.db
      .prepare(
        `
        INSERT INTO live_locations (
          leader, latitude, longitude, accuracy_m, heading, speed_mps,
          location_text, status, is_live_streaming, is_test_seed, approved_for_security,
          updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        ON CONFLICT(leader) DO UPDATE SET
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          accuracy_m = excluded.accuracy_m,
          heading = excluded.heading,
          speed_mps = excluded.speed_mps,
          location_text = excluded.location_text,
          status = excluded.status,
          is_live_streaming = excluded.is_live_streaming,
          is_test_seed = 0,
          approved_for_security = excluded.approved_for_security,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
      `
      )
      .run(
        input.leader,
        input.latitude,
        input.longitude,
        input.accuracy_m ?? null,
        input.heading ?? null,
        input.speed_mps ?? null,
        locationText,
        statusText,
        input.is_live_streaming ? 1 : 0,
        approved ? 1 : 0,
        input.updated_by,
        updatedAt
      );

    return this.getLiveLocation(input.leader)!;
  }

  public stopLiveStreaming(leader: LeaderCode, updatedBy: string): LiveLocationRecord | null {
    const existing = this.getLiveLocation(leader);
    if (!existing) return null;
    const now = new Date().toISOString();
    this.db
      .prepare(
        'UPDATE live_locations SET is_live_streaming = 0, updated_by = ?, updated_at = ? WHERE leader = ?'
      )
      .run(updatedBy, now, leader);
    return this.getLiveLocation(leader);
  }
}
