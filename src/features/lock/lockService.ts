import { db } from '../../db/db';

/**
 * Blokada aplikacji: Face ID / Touch ID / kod urządzenia (WebAuthn, wbudowany czytnik urządzenia)
 * oraz zapasowy kod PIN. UWAGA: to blokada DOSTĘPU do aplikacji, a nie szyfrowanie danych —
 * dane w pamięci przeglądarki nie są zaszyfrowane (patrz README).
 */

export interface LockState {
  ready: boolean;
  enabled: boolean;
  locked: boolean;
  hasPasskey: boolean;
  hasPin: boolean;
  /** Po ilu minutach w tle blokować; 0 = od razu. */
  lockAfterMin: number;
  promptDismissed: boolean;
}

interface PinRecord {
  salt: string;
  hash: string;
  iterations: number;
}

const K = {
  enabled: 'lock.enabled',
  credential: 'lock.credentialId',
  pin: 'lock.pin',
  afterMin: 'lock.afterMin',
  dismissed: 'lock.promptDismissed',
} as const;

export const LOCK_AFTER_OPTIONS = [0, 1, 5, 15] as const;
export const DEFAULT_LOCK_AFTER_MIN = 5;
export const MAX_PIN_FAILURES = 5;
export const PIN_PENALTY_MS = 30_000;
const PBKDF2_ITERATIONS = 200_000;

// --- kodowanie ---
const toB64 = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (text: string): Uint8Array => {
  const std = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function hashPin(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return toB64(bits);
}

export const PIN_PATTERN = /^\d{4,8}$/;

export class LockService {
  private state: LockState = {
    ready: false,
    enabled: false,
    locked: false,
    hasPasskey: false,
    hasPin: false,
    lockAfterMin: DEFAULT_LOCK_AFTER_MIN,
    promptDismissed: false,
  };
  private listeners = new Set<() => void>();
  private hiddenAt?: number;
  private failures = 0;
  private blockedUntil = 0;
  private started = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  private set(patch: Partial<LockState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private async get<T>(key: string): Promise<T | undefined> {
    return (await db.meta.get(key))?.value as T | undefined;
  }

  /** Wczytuje ustawienia. Jeśli blokada jest włączona, aplikacja startuje zablokowana. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const enabled = (await this.get<boolean>(K.enabled)) === true;
    this.set({
      ready: true,
      enabled,
      locked: enabled,
      hasPasskey: !!(await this.get<string>(K.credential)),
      hasPin: !!(await this.get<PinRecord>(K.pin)),
      lockAfterMin: (await this.get<number>(K.afterMin)) ?? DEFAULT_LOCK_AFTER_MIN,
      promptDismissed: (await this.get<boolean>(K.dismissed)) === true,
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.hiddenAt = Date.now();
        return;
      }
      const { enabled: on, locked, lockAfterMin } = this.state;
      if (on && !locked && this.hiddenAt !== undefined && Date.now() - this.hiddenAt >= lockAfterMin * 60_000) {
        this.set({ locked: true });
      }
      this.hiddenAt = undefined;
    });
  }

  lock(): void {
    if (this.state.enabled) this.set({ locked: true });
  }

  // --- Face ID / Touch ID / kod urządzenia ---

  async passkeyAvailable(): Promise<boolean> {
    try {
      return (
        typeof PublicKeyCredential !== 'undefined' &&
        (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
      );
    } catch {
      return false;
    }
  }

  /** Rejestruje klucz dostępu (passkey) tego urządzenia. Wymaga gestu użytkownika. */
  async registerPasskey(): Promise<void> {
    const cred = (await navigator.credentials.create({
      publicKey: {
        rp: { name: 'SztuKaFe Katalog' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'sztukafe', displayName: 'SztuKaFe' },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error('Nie udało się zarejestrować Face ID.');
    await db.meta.put({ key: K.credential, value: toB64(cred.rawId) });
    this.set({ hasPasskey: true });
  }

  /** Prosi system o Face ID / Touch ID / kod urządzenia. Zwraca true po poprawnej weryfikacji. */
  async unlockWithPasskey(): Promise<boolean> {
    const id = await this.get<string>(K.credential);
    if (!id) return false;
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: fromB64(id) as BufferSource, transports: ['internal'] }],
          userVerification: 'required',
          timeout: 60_000,
        },
      });
      return !!assertion;
    } catch {
      return false; // anulowano albo nie rozpoznano
    }
  }

  async removePasskey(): Promise<void> {
    await db.meta.delete(K.credential);
    this.set({ hasPasskey: false });
    await this.ensureStillProtected();
  }

  // --- PIN ---

  async setPin(pin: string): Promise<void> {
    if (!PIN_PATTERN.test(pin)) throw new Error('Kod PIN to 4–8 cyfr.');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const record: PinRecord = {
      salt: toB64(salt),
      hash: await hashPin(pin, salt, PBKDF2_ITERATIONS),
      iterations: PBKDF2_ITERATIONS,
    };
    await db.meta.put({ key: K.pin, value: record });
    this.set({ hasPin: true });
  }

  async removePin(): Promise<void> {
    await db.meta.delete(K.pin);
    this.set({ hasPin: false });
    await this.ensureStillProtected();
  }

  /** Sekundy do końca blokady po zbyt wielu błędnych próbach. */
  penaltySeconds(): number {
    return Math.max(0, Math.ceil((this.blockedUntil - Date.now()) / 1000));
  }

  async verifyPin(pin: string): Promise<boolean> {
    if (this.penaltySeconds() > 0) return false;
    const record = await this.get<PinRecord>(K.pin);
    if (!record) return false;
    const ok = (await hashPin(pin, fromB64(record.salt), record.iterations)) === record.hash;
    if (ok) {
      this.failures = 0;
      return true;
    }
    if (++this.failures >= MAX_PIN_FAILURES) {
      this.failures = 0;
      this.blockedUntil = Date.now() + PIN_PENALTY_MS;
    }
    return false;
  }

  // --- stan ---

  /** Odblokowanie po poprawnej weryfikacji (wywołuje ekran blokady). */
  unlock(): void {
    this.set({ locked: false });
  }

  /** Włącza blokadę; wymaga skonfigurowanego Face ID lub PIN-u. */
  async enable(): Promise<void> {
    if (!this.state.hasPasskey && !this.state.hasPin) throw new Error('Najpierw ustaw Face ID albo kod PIN.');
    await db.meta.put({ key: K.enabled, value: true });
    this.set({ enabled: true, locked: false });
  }

  async disable(): Promise<void> {
    await db.meta.put({ key: K.enabled, value: false });
    this.set({ enabled: false, locked: false });
  }

  /** Nie zostawiamy włączonej blokady bez żadnej metody odblokowania. */
  private async ensureStillProtected(): Promise<void> {
    if (this.state.enabled && !this.state.hasPasskey && !this.state.hasPin) await this.disable();
  }

  async setLockAfter(minutes: number): Promise<void> {
    await db.meta.put({ key: K.afterMin, value: minutes });
    this.set({ lockAfterMin: minutes });
  }

  async dismissPrompt(): Promise<void> {
    await db.meta.put({ key: K.dismissed, value: true });
    this.set({ promptDismissed: true });
  }
}

export const lockService = new LockService();
