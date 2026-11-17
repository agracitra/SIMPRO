import {isSupabaseConfigured, supabase} from '../lib/supabaseClient.ts';
import {sessionToken} from '../lib/sessionToken.ts';
import type {SystemModeInfo, UserProfile} from '../types/simpro.ts';
import {offlineDb} from './offlineDb.ts';

const CACHED_SESSION_KEY = 'current_user_profile';

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = sessionToken.get();
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Permintaan gagal (${res.status})`);
  }
  return data as T;
}

export const authService = {
  async getSystemMode(): Promise<SystemModeInfo> {
    try {
      return await apiJson<SystemModeInfo>('/api/system/mode');
    } catch {
      return {
        mode: isSupabaseConfigured ? 'supabase_connected' : 'local_isolated',
        supabaseConfigured: isSupabaseConfigured,
        isNonProductionTestSeed: !isSupabaseConfigured,
        externalNotificationsConfigured: false,
      };
    }
  },

  async login(email: string, password: string): Promise<UserProfile> {
    if (isSupabaseConfigured && supabase) {
      const {data, error} = await supabase.auth.signInWithPassword({email, password});
      if (error || !data.user) {
        throw new Error(error?.message || 'Autentikasi Supabase gagal.');
      }
      const {data: profile, error: profErr} = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
      if (profErr || !profile) {
        await supabase.auth.signOut();
        throw new Error('Profil pengguna tidak ditemukan pada tabel profiles.');
      }
      if (!profile.is_active) {
        await supabase.auth.signOut();
        throw new Error('Akun Anda berstatus nonaktif. Hubungi Administrator SIMPRO.');
      }
      const typed = profile as UserProfile;
      await offlineDb.saveSnapshot(CACHED_SESSION_KEY, typed);
      return typed;
    }

    const res = await apiJson<{user: UserProfile; token?: string}>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({email, password}),
    });
    if (res.token) {
      sessionToken.set(res.token);
    }
    await offlineDb.saveSnapshot(CACHED_SESSION_KEY, res.user);
    return res.user;
  },

  async logout(): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
    const token = sessionToken.get();
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: token ? {Authorization: `Bearer ${token}`} : undefined,
    }).catch(() => {});
    sessionToken.clear();
    await offlineDb.saveSnapshot(CACHED_SESSION_KEY, null);
  },

  async getSession(isOnline: boolean): Promise<UserProfile | null> {
    if (!isOnline) {
      const cached = await offlineDb.loadSnapshot<UserProfile | null>(CACHED_SESSION_KEY);
      return cached?.payload ?? null;
    }

    if (isSupabaseConfigured && supabase) {
      const {data} = await supabase.auth.getUser();
      if (!data.user) return null;
      const {data: profile} = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();
      if (!profile || !profile.is_active) return null;
      const typed = profile as UserProfile;
      await offlineDb.saveSnapshot(CACHED_SESSION_KEY, typed);
      return typed;
    }

    try {
      const res = await apiJson<{user: UserProfile}>('/api/auth/session');
      await offlineDb.saveSnapshot(CACHED_SESSION_KEY, res.user);
      return res.user;
    } catch {
      sessionToken.clear();
      return null;
    }
  },

  async requestPasswordRecovery(email: string): Promise<string> {
    if (isSupabaseConfigured && supabase) {
      const {error} = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) {
        throw new Error(error.message);
      }
      return 'Tautan pemulihan kata sandi telah dikirim melalui layanan Supabase Auth ke email terdaftar.';
    }

    const res = await apiJson<{message: string}>('/api/auth/password-recovery', {
      method: 'POST',
      body: JSON.stringify({email}),
    });
    return res.message;
  },
};
