import crypto from 'node:crypto';
import type {Request, Response, NextFunction} from 'express';
import type {UserProfile} from '../src/types/simpro.ts';

const SESSION_COOKIE_NAME = 'simpro_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 jam

function getSessionSecret(): string {
  return (
    process.env.SIMPRO_SESSION_SECRET ||
    'simpro-dev-local-session-secret-ubah-pada-staging-production'
  );
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(keyHex, 'hex');
  if (derivedBuffer.length !== keyBuffer.length) return false;
  return crypto.timingSafeEqual(derivedBuffer, keyBuffer);
}

interface SessionPayload {
  uid: string;
  exp: number;
}

export function createSessionToken(uid: string): string {
  const payload: SessionPayload = {
    uid,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.uid || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) out[key] = val;
  }
  return out;
}

function isHttpsRequest(req: Request): boolean {
  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return req.secure || proto === 'https' || process.env.NODE_ENV === 'production';
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  });
}

export interface AuthenticatedRequest extends Request {
  currentUser?: UserProfile;
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export function buildAuthMiddleware(
  getUserById: (id: string) => UserProfile | null,
  isViewerEnabled: () => boolean
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const cookies = parseCookies(req.headers.cookie);
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : undefined;
    const token = cookies[SESSION_COOKIE_NAME] || bearer;

    if (!token) {
      res.status(401).json({error: 'Autentikasi diperlukan. Silakan masuk terlebih dahulu.'});
      return;
    }

    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(401).json({error: 'Sesi telah berakhir atau tidak valid. Silakan masuk kembali.'});
      return;
    }

    const user = getUserById(payload.uid);
    if (!user) {
      res.status(401).json({error: 'Akun pengguna tidak ditemukan.'});
      return;
    }

    if (!user.is_active) {
      clearSessionCookie(req, res);
      res.status(403).json({
        error: 'Akun Anda telah dinonaktifkan oleh Administrator. Hubungi Admin SIMPRO.',
      });
      return;
    }

    if (user.role === 'pimpinan_viewer' && !isViewerEnabled()) {
      res.status(403).json({
        error:
          'Akses Pimpinan / Viewer saat ini dinonaktifkan oleh Administrator sesuai kebijakan instansi.',
      });
      return;
    }

    req.currentUser = user;
    next();
  };
}
