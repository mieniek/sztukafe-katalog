import { db } from '../db/db';
import { setCurrentUser } from '../db/artworks';
import type { Role } from '../db/types';
import { AuthError, DriveError, NetworkError } from './driveApi';
import { GoogleDriveClient } from './driveClient';
import { GoogleAuth, googleClientId } from './googleAuth';
import { ACCESS_KEY, SyncEngine } from './syncEngine';
import type { AccessInfo, AppUser } from './access';
import type { BackupFile, BackupInfo } from './backups';

export type AuthState = 'not-configured' | 'signed-out' | 'signed-in' | 'needs-login';
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  auth: AuthState;
  status: SyncStatus;
  email?: string;
  displayName?: string;
  /** Rola na tym urządzeniu. Bez konfiguracji Google (praca tylko lokalna) właściciel urządzenia jest adminem. */
  role: Role;
  users: AppUser[];
  lastSyncAt?: string;
  lastBackupAt?: string;
  error?: string;
}

const LINKED_KEY = 'google.linked';
const EMAIL_KEY = 'google.email';
const NAME_KEY = 'google.name';
const LAST_SYNC_KEY = 'sync.lastSuccessAt';
const LAST_BACKUP_KEY = 'backup.lastAt';
const INTERVAL_MS = 2 * 60_000;
const BACKUP_EVERY_MS = 24 * 60 * 60_000;

/**
 * Łączy logowanie, silnik synchronizacji i wyzwalacze: start aplikacji, powrót online,
 * powrót do zakładki oraz cykliczne odświeżanie co 2 minuty.
 */
class SyncService {
  private auth = new GoogleAuth();
  private drive = new GoogleDriveClient(this.auth);
  private engine = new SyncEngine(db, this.drive);
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setInterval>;
  private started = false;

  private state: SyncState = {
    auth: googleClientId() ? 'signed-out' : 'not-configured',
    status: 'idle',
    role: 'admin',
    users: [],
  };

  // --- stan dla Reacta (useSyncExternalStore) ---
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private applyAccess(access?: AccessInfo) {
    if (access) this.set({ role: access.role, users: access.users });
  }

  /** Wywoływane raz przy starcie aplikacji. */
  async start(): Promise<void> {
    if (this.started || this.state.auth === 'not-configured') return;
    this.started = true;

    const meta = async <T>(key: string) => (await db.meta.get(key))?.value as T | undefined;
    const email = await meta<string>(EMAIL_KEY);
    this.set({
      lastSyncAt: await meta<string>(LAST_SYNC_KEY),
      lastBackupAt: await meta<string>(LAST_BACKUP_KEY),
      displayName: await meta<string>(NAME_KEY),
    });
    // Rolę z poprzedniej sesji znamy od razu, także bez sieci.
    this.applyAccess(await meta<AccessInfo>(ACCESS_KEY));
    const linked = (await meta<boolean>(LINKED_KEY)) === true;
    if (linked && email) {
      setCurrentUser(email);
      this.set({ auth: 'signed-in', email });
    }

    window.addEventListener('online', () => void this.sync());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.sync();
    });
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.sync();
    }, INTERVAL_MS);

    if (linked) void this.sync();
  }

  /** Musi być wywołane z kliknięcia (przeglądarka blokuje okno logowania bez gestu użytkownika). */
  async signIn(): Promise<void> {
    try {
      await this.auth.signIn();
      const user = await this.drive.getUser();
      await db.meta.bulkPut([
        { key: LINKED_KEY, value: true },
        { key: EMAIL_KEY, value: user.email },
        { key: NAME_KEY, value: user.displayName ?? '' },
      ]);
      setCurrentUser(user.email);
      this.set({ auth: 'signed-in', email: user.email, displayName: user.displayName, error: undefined });
      await this.sync(true);
    } catch (e) {
      this.handleError(e);
    }
  }

  async signOut(): Promise<void> {
    this.auth.signOut();
    await db.meta.bulkDelete([LINKED_KEY, EMAIL_KEY, NAME_KEY]);
    setCurrentUser(undefined);
    this.set({ auth: 'signed-out', email: undefined, displayName: undefined, status: 'idle', error: undefined });
  }

  /** `force` = ignoruj czas oczekiwania po wcześniejszych błędach. */
  async sync(force = false): Promise<void> {
    if (this.state.auth !== 'signed-in' && this.state.auth !== 'needs-login') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.set({ status: 'offline' });
      return;
    }
    this.set({ status: 'syncing' });
    try {
      await this.engine.syncNow(force);
      const lastSyncAt = new Date().toISOString();
      await db.meta.put({ key: LAST_SYNC_KEY, value: lastSyncAt });
      this.set({ status: 'idle', auth: 'signed-in', lastSyncAt, error: undefined });
      this.applyAccess(this.engine.getAccess());
      await this.backupIfDue();
    } catch (e) {
      this.handleError(e);
    }
  }

  /** Raz na dobę (tylko admin), przy pierwszym otwarciu aplikacji po upływie 24 h od ostatniej kopii. */
  private async backupIfDue(): Promise<void> {
    if (this.state.role !== 'admin' || this.engine.getAccess()?.role !== 'admin') return;
    const last = this.state.lastBackupAt ? Date.parse(this.state.lastBackupAt) : 0;
    if (Date.now() - last < BACKUP_EVERY_MS) return;
    try {
      await this.createBackup();
    } catch {
      // kopia się nie udała — spróbujemy przy następnej synchronizacji
    }
  }

  async createBackup(): Promise<BackupInfo> {
    const info = await this.engine.createBackup();
    const lastBackupAt = new Date().toISOString();
    await db.meta.put({ key: LAST_BACKUP_KEY, value: lastBackupAt });
    this.set({ lastBackupAt });
    return info;
  }

  listBackups = () => this.engine.listBackups();
  readBackup = (fileId: string): Promise<BackupFile> => this.engine.readBackup(fileId);

  async setUserRole(email: string, role: Role): Promise<void> {
    this.set({ users: await this.engine.setUserRole(email, role) });
  }

  async removeUser(email: string): Promise<void> {
    this.set({ users: await this.engine.removeUser(email) });
  }

  private handleError(e: unknown) {
    if (e instanceof AuthError) {
      // Kolejka `outbox` zostaje nietknięta — po ponownym zalogowaniu wszystko pójdzie dalej.
      this.set({ auth: this.state.email ? 'needs-login' : 'signed-out', status: 'idle', error: e.message });
    } else if (e instanceof NetworkError) {
      this.set({ status: 'offline', error: undefined });
    } else if (e instanceof DriveError) {
      this.set({ status: 'error', error: e.message });
    } else {
      this.set({ status: 'error', error: e instanceof Error ? e.message : 'Nieznany błąd synchronizacji.' });
    }
  }

  /** Pobiera oryginał zdjęcia z Dysku, jeśli lokalnie jest tylko miniatura. Błędy są ciche. */
  async fetchOriginal(photoId: string): Promise<void> {
    if (this.state.auth !== 'signed-in' || !this.auth.hasValidToken()) return;
    try {
      await this.engine.fetchOriginal(photoId);
    } catch {
      // zostaje miniatura; spróbujemy przy następnym otwarciu
    }
  }

  stop() {
    clearInterval(this.timer);
  }
}

export const syncService = new SyncService();
