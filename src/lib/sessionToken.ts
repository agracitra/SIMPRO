const TOKEN_STORAGE_KEY = 'simpro_session_token';
let inMemoryToken: string | null = null;

export const sessionToken = {
  get(): string | null {
    if (inMemoryToken) return inMemoryToken;
    if (typeof window === 'undefined') return null;
    try {
      const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored) {
        inMemoryToken = stored;
        return stored;
      }
    } catch {
      // Abaikan jika akses localStorage dibatasi browser
    }
    return null;
  },

  set(token: string | null | undefined): void {
    inMemoryToken = token || null;
    if (typeof window === 'undefined') return;
    try {
      if (token) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Abaikan jika akses localStorage dibatasi browser
    }
  },

  clear(): void {
    this.set(null);
  },
};
