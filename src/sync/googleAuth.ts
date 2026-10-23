import { AuthError, NetworkError } from './driveApi';
import type { TokenSource } from './driveClient';

/**
 * Zakres dostępu do Dysku. Domyślnie pełny `drive`: zakres `drive.file` widzi tylko pliki, które
 * aplikacja sama utworzyła lub które użytkownik wskazał w oknie Google Picker, więc drugi użytkownik
 * nie zobaczyłby plików założonych przez pierwszego (patrz DECISIONS.md i docs/GOOGLE_SETUP.md).
 */
export const DRIVE_SCOPE =
  (import.meta.env.VITE_GOOGLE_SCOPE as string | undefined) || 'https://www.googleapis.com/auth/drive';

const GSI_URL = 'https://accounts.google.com/gsi/client';
const SAFETY_MARGIN_MS = 60_000;
const SILENT_TIMEOUT_MS = 15_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; hint?: string }): void;
  callback: (r: TokenResponse) => void;
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type: string; message?: string }) => void;
      }): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
}

declare global {
  interface Window {
    google?: Gis;
  }
}

export const googleClientId = (): string | undefined =>
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || undefined;

function loadGsi(): Promise<Gis> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_URL;
    script.async = true;
    script.onload = () =>
      window.google?.accounts?.oauth2 ? resolve(window.google) : reject(new NetworkError());
    script.onerror = () => {
      script.remove();
      reject(new NetworkError());
    };
    document.head.appendChild(script);
  });
}

/**
 * Logowanie Google (Google Identity Services, „token client”).
 * Token dostępu trzymamy wyłącznie w pamięci — nigdy w localStorage ani IndexedDB.
 */
export class GoogleAuth implements TokenSource {
  private token?: { value: string; expiresAt: number };
  private client?: TokenClient;
  private pending?: { resolve: (t: string) => void; reject: (e: Error) => void };
  private inFlight?: Promise<string>;

  private async ensureClient(clientId: string): Promise<TokenClient> {
    if (this.client) return this.client;
    const gis = await loadGsi();
    this.client = gis.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (r) => {
        const p = this.pending;
        this.pending = undefined;
        if (!p) return;
        if (r.error || !r.access_token) {
          p.reject(new AuthError(r.error_description || 'Logowanie do Google nie powiodło się.'));
          return;
        }
        this.token = {
          value: r.access_token,
          expiresAt: Date.now() + Number(r.expires_in ?? 3600) * 1000 - SAFETY_MARGIN_MS,
        };
        p.resolve(r.access_token);
      },
      error_callback: (e) => {
        const p = this.pending;
        this.pending = undefined;
        p?.reject(
          new AuthError(
            e.type === 'popup_closed' ? 'Okno logowania zostało zamknięte.' : 'Nie udało się otworzyć okna logowania.',
          ),
        );
      },
    });
    return this.client;
  }

  hasValidToken(): boolean {
    return !!this.token && this.token.expiresAt > Date.now();
  }

  /** `interactive` = true tylko z kliknięcia użytkownika (przeglądarki blokują okna bez gestu). */
  request(interactive: boolean): Promise<string> {
    const clientId = googleClientId();
    if (!clientId) return Promise.reject(new AuthError('Synchronizacja nie jest jeszcze skonfigurowana.'));
    this.inFlight ??= (async () => {
      const client = await this.ensureClient(clientId);
      return new Promise<string>((resolve, reject) => {
        const timer = interactive
          ? undefined
          : setTimeout(() => {
              this.pending = undefined;
              reject(new AuthError());
            }, SILENT_TIMEOUT_MS);
        const done = <T extends unknown[]>(fn: (...a: T) => void) =>
          (...a: T) => {
            clearTimeout(timer);
            fn(...a);
          };
        this.pending = { resolve: done(resolve), reject: done(reject) };
        client.requestAccessToken({ prompt: interactive ? 'select_account' : '' });
      });
    })().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  signIn(): Promise<string> {
    return this.request(true);
  }

  async getToken(): Promise<string> {
    if (this.token && this.hasValidToken()) return this.token.value;
    return this.request(false); // ciche odnowienie
  }

  invalidate(): void {
    this.token = undefined;
  }

  signOut(): void {
    const t = this.token?.value;
    this.token = undefined;
    if (t) window.google?.accounts.oauth2.revoke(t);
  }
}
