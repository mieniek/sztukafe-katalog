import type { KatalogDB } from '../db/db';
import type { Artwork, OutboxItem, Photo, PrivatePrices, RemoteArtwork, Role } from '../db/types';
import { AuthError, DriveError, NetworkError, type DriveApi, type DriveFile, type DriveUser } from './driveApi';
import {
  ensurePrivateFolders,
  removeUser,
  resolveAccess,
  restrictSharing,
  setUser,
  type AccessInfo,
  type AppUser,
  type PrivateFolders,
  type UserAdminContext,
} from './access';
import { createBackup, listBackups, readBackup, type BackupFile, type BackupInfo } from './backups';
import { reserveInvNo } from './invNoCounter';
import {
  FOLDER_NAMES,
  type ArtworkFile,
  type DriveFolders,
  type PhotoRef,
} from './remoteFormat';

export interface SyncSummary {
  pushed: number;
  pulled: number;
  conflicts: number;
  failed: number;
}

interface EngineOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const FOLDERS_KEY = 'drive.folders';
const TOKEN_KEY = 'drive.changesToken';
export const ACCESS_KEY = 'access';
const PRIVATE_KEY = 'drive.private';
const PRICES_PULLED_KEY = 'prices.pulled';
const SHARING_LOCKED_KEY = 'drive.sharingLocked';
const MAX_BACKOFF_MS = 30 * 60_000;

/**
 * Synchronizacja lokalnej bazy (Dexie) z folderem na Dysku Google.
 * Kolejność w każdym przebiegu: najpierw pobranie cudzych zmian (żeby wykryć konflikty),
 * potem wysłanie własnych z kolejki `outbox`.
 */
export class SyncEngine {
  private running?: Promise<SyncSummary>;
  private folders?: DriveFolders;
  private privateFolders?: PrivateFolders;
  private access?: AccessInfo;
  private me?: DriveUser;
  private photoFolders = new Map<string, string>();
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly db: KatalogDB,
    private readonly drive: DriveApi,
    options: EngineOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** `force` ignoruje czas oczekiwania po wcześniejszych błędach (przycisk „Synchronizuj teraz”). */
  syncNow(force = false): Promise<SyncSummary> {
    this.running ??= this.run(force).finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async run(force: boolean): Promise<SyncSummary> {
    const summary: SyncSummary = { pushed: 0, pulled: 0, conflicts: 0, failed: 0 };
    try {
      const folders = await this.ensureFolders();
      const access = await this.ensureAccess(folders);
      const priv = access.role === 'admin' ? this.privateFolders : undefined;
      await this.pull(folders, summary, priv);
      if (priv) await this.pullPricesFull(priv);
      await this.push(folders, summary, force);
    } catch (e) {
      if (e instanceof DriveError && e.status === 404) {
        // Folder zniknął albo został przeniesiony — przy następnym przebiegu szukamy go od nowa.
        this.folders = undefined;
        this.privateFolders = undefined;
        this.photoFolders.clear();
        await this.db.meta.bulkDelete([FOLDERS_KEY, PRIVATE_KEY]);
      }
      throw e;
    }
    return summary;
  }

  // ---------- foldery ----------

  private async ensureFolders(): Promise<DriveFolders> {
    if (this.folders) return this.folders;
    const saved = (await this.db.meta.get(FOLDERS_KEY))?.value as DriveFolders | undefined;
    if (saved) return (this.folders = saved);

    const root =
      (await this.drive.findFolder(FOLDER_NAMES.root)) ?? (await this.drive.createFolder(FOLDER_NAMES.root));
    const sub = async (name: string) =>
      ((await this.drive.findFolder(name, root.id)) ?? (await this.drive.createFolder(name, root.id))).id;
    const folders: DriveFolders = {
      rootId: root.id,
      artworksId: await sub(FOLDER_NAMES.artworks),
      photosId: await sub(FOLDER_NAMES.photos),
      configId: await sub(FOLDER_NAMES.config),
    };
    await this.db.meta.put({ key: FOLDERS_KEY, value: folders });
    return (this.folders = folders);
  }

  private async photoFolder(folders: DriveFolders, artworkId: string): Promise<string> {
    const cached = this.photoFolders.get(artworkId);
    if (cached) return cached;
    const folder =
      (await this.drive.findFolder(artworkId, folders.photosId)) ??
      (await this.drive.createFolder(artworkId, folders.photosId));
    this.photoFolders.set(artworkId, folder.id);
    return folder.id;
  }

  // ---------- role i ceny prywatne ----------

  /** Ustala rolę zalogowanej osoby; adminowi przygotowuje folder cen, pracownikowi usuwa lokalne ceny. */
  private async ensureAccess(folders: DriveFolders): Promise<AccessInfo> {
    const { db } = this;
    this.me ??= await this.drive.getUser();
    const access = await resolveAccess(this.drive, folders, this.me);
    const prev = (await db.meta.get(ACCESS_KEY))?.value as AccessInfo | undefined;
    this.access = access;
    await db.meta.put({ key: ACCESS_KEY, value: access });

    if (access.role === 'admin') {
      if (!this.privateFolders) {
        this.privateFolders = (await db.meta.get(PRIVATE_KEY))?.value as PrivateFolders | undefined;
      }
      if (!this.privateFolders?.backupsId) {
        // Brak folderu albo zapis sprzed przeniesienia kopii zapasowych do folderu prywatnego.
        this.privateFolders = await ensurePrivateFolders(this.drive);
        await db.meta.put({ key: PRIVATE_KEY, value: this.privateFolders });
      }
      await this.lockSharing(folders, access);
      if (prev?.role !== 'admin') await db.meta.delete(PRICES_PULLED_KEY);
    } else {
      this.privateFolders = undefined;
      if (prev?.role === 'admin' || (await db.prices.count()) > 0) {
        // Odebrano rolę admina: ceny prywatne znikają także z tego urządzenia.
        await db.prices.clear();
        await db.outbox.where('entity').equals('prices').delete();
        await db.meta.bulkDelete([PRIVATE_KEY, PRICES_PULLED_KEY]);
      }
    }
    return access;
  }

  /** Właściciel raz odbiera edytorom prawo udostępniania; błąd nie przerywa synchronizacji (ponowimy później). */
  private async lockSharing(folders: DriveFolders, access: AccessInfo): Promise<void> {
    if (!access.isOwner || !this.privateFolders) return;
    if ((await this.db.meta.get(SHARING_LOCKED_KEY))?.value === true) return;
    try {
      await restrictSharing(this.drive, folders, this.privateFolders);
      await this.db.meta.put({ key: SHARING_LOCKED_KEY, value: true });
    } catch (e) {
      if (e instanceof AuthError || e instanceof NetworkError) throw e;
    }
  }

  /** Zapomina foldery, rolę i konto (po wylogowaniu z usunięciem danych urządzenia). */
  reset(): void {
    this.folders = undefined;
    this.privateFolders = undefined;
    this.access = undefined;
    this.me = undefined;
    this.photoFolders.clear();
  }

  getAccess(): AccessInfo | undefined {
    return this.access;
  }

  private async adminContext(): Promise<UserAdminContext> {
    const folders = await this.ensureFolders();
    if (!this.access) await this.ensureAccess(folders);
    if (this.access?.role !== 'admin' || !this.privateFolders) {
      throw new Error('Tylko admin może to zrobić.');
    }
    return { drive: this.drive, folders, privateFolders: this.privateFolders, me: this.access };
  }

  private async rememberUsers(users: AppUser[]): Promise<AppUser[]> {
    if (this.access) {
      this.access = { ...this.access, users };
      await this.db.meta.put({ key: ACCESS_KEY, value: this.access });
    }
    return users;
  }

  /** Dodaje osobę albo zmienia jej rolę (admin) i dostosowuje uprawnienia na Dysku. */
  async setUserRole(email: string, role: Role): Promise<AppUser[]> {
    return this.rememberUsers(await setUser(await this.adminContext(), email, role));
  }

  async removeUser(email: string): Promise<AppUser[]> {
    return this.rememberUsers(await removeUser(await this.adminContext(), email));
  }

  private async applyPrices(file: DriveFile): Promise<void> {
    const remote = await this.drive.readJson<PrivatePrices>(file.id);
    if (!remote?.id) return;
    const { db } = this;
    await db.transaction('rw', db.prices, db.outbox, async () => {
      const local = await db.prices.get(remote.id);
      if (!local || remote.updatedAt > local.updatedAt) {
        await db.prices.put(remote);
        await db.outbox.delete(`prices:${remote.id}`); // starsza zmiana lokalna przegrywa
      }
    });
  }

  private async pullPricesFull(priv: PrivateFolders): Promise<void> {
    if ((await this.db.meta.get(PRICES_PULLED_KEY))?.value === true) return;
    for (const f of await this.drive.listFiles(priv.pricesId)) {
      if (f.name.endsWith('.json')) await this.applyPrices(f);
    }
    await this.db.meta.put({ key: PRICES_PULLED_KEY, value: true });
  }

  private async pushPrices(item: OutboxItem): Promise<'done'> {
    // Pracownik nigdy nie wysyła cen — pozycja jest po prostu odrzucana.
    if (this.access?.role !== 'admin' || !this.privateFolders) return 'done';
    const row = await this.db.prices.get(item.entityId);
    if (!row) return 'done';
    const name = `${row.id}.json`;
    const existing = await this.drive.findFile(name, this.privateFolders.pricesId);
    await this.drive.writeJson({ name, parentId: this.privateFolders.pricesId, data: row, fileId: existing?.id });
    return 'done';
  }

  // ---------- kopie zapasowe (admin) ----------

  async createBackup(): Promise<BackupInfo> {
    const ctx = await this.adminContext();
    const artworks = await this.db.artworks.toArray();
    return createBackup(this.drive, ctx.privateFolders.backupsId, artworks, ctx.me.email, new Date(this.now()));
  }

  async listBackups(): Promise<BackupInfo[]> {
    const ctx = await this.adminContext();
    return listBackups(this.drive, ctx.privateFolders.backupsId);
  }

  async readBackup(fileId: string): Promise<BackupFile> {
    await this.adminContext();
    return readBackup(this.drive, fileId);
  }

  // ---------- pobieranie ----------

  private async pull(folders: DriveFolders, summary: SyncSummary, priv?: PrivateFolders): Promise<void> {
    const saved = (await this.db.meta.get(TOKEN_KEY))?.value as string | undefined;
    if (!saved) return this.fullPull(folders, summary);

    try {
      let pageToken = saved;
      for (;;) {
        const page = await this.drive.listChanges(pageToken);
        for (const change of page.changes) {
          const f = change.file;
          if (change.removed || !f || f.trashed || !f.name.endsWith('.json')) continue;
          if (priv && f.parents?.includes(priv.pricesId)) await this.applyPrices(f);
          else if (f.parents?.includes(folders.artworksId)) await this.applyArtworkFile(f, summary);
        }
        if (page.nextPageToken) {
          pageToken = page.nextPageToken;
          continue;
        }
        await this.db.meta.put({ key: TOKEN_KEY, value: page.newStartPageToken ?? pageToken });
        return;
      }
    } catch (e) {
      // Token mógł wygasnąć — pełne pobranie jest bezpieczne, bo każdą zmianę stosujemy idempotentnie.
      if (e instanceof DriveError && [400, 404, 410].includes(e.status)) {
        await this.db.meta.delete(TOKEN_KEY);
        return this.fullPull(folders, summary);
      }
      throw e;
    }
  }

  private async fullPull(folders: DriveFolders, summary: SyncSummary): Promise<void> {
    // Token pobieramy PRZED listą plików, żeby nie przegapić zmian z czasu pobierania.
    const startToken = await this.drive.getStartPageToken();
    const files = await this.drive.listFiles(folders.artworksId);
    for (const f of files) {
      if (f.name.endsWith('.json')) await this.applyArtworkFile(f, summary);
    }
    await this.db.meta.put({ key: TOKEN_KEY, value: startToken });
  }

  private async applyArtworkFile(file: DriveFile, summary: SyncSummary): Promise<void> {
    const content = await this.drive.readJson<ArtworkFile>(file.id);
    if (!content?.artwork?.id) return;
    await this.ingestPhotos(content);
    await this.applyRemote(content.artwork, file.id, summary);
  }

  /** Miniatury pobieramy od razu (są małe), oryginały dopiero na żądanie. */
  private async ingestPhotos(content: ArtworkFile): Promise<void> {
    for (const ref of content.photos ?? []) {
      const existing = await this.db.photos.get(ref.id);
      if (existing?.driveFileId) continue;
      if (existing) {
        await this.db.photos.update(ref.id, { driveFileId: ref.driveFileId, driveThumbId: ref.driveThumbId });
        continue;
      }
      if (!ref.driveThumbId) continue;
      const thumb = await this.drive.downloadBlob(ref.driveThumbId);
      await this.db.photos.put({
        id: ref.id,
        artworkId: content.artwork.id,
        kind: ref.kind,
        thumb,
        driveFileId: ref.driveFileId,
        driveThumbId: ref.driveThumbId,
      });
    }
  }

  /** Last-write-wins na całym rekordzie; przegrana wersja ląduje w `conflicts` (plan, pkt 4.2). */
  private async applyRemote(remote: Artwork, fileId: string, summary: SyncSummary): Promise<void> {
    const { db } = this;
    await db.transaction('rw', db.artworks, db.outbox, db.remoteArtworks, db.conflicts, async () => {
      const local = await db.artworks.get(remote.id);
      const known = await db.remoteArtworks.get(remote.id);
      const pending = await db.outbox.get(`artwork:${remote.id}`);
      const record: RemoteArtwork = { id: remote.id, fileId, remoteUpdatedAt: remote.updatedAt };

      if (known && known.fileId === fileId && known.remoteUpdatedAt === remote.updatedAt) return; // własne echo

      if (!local) {
        await db.artworks.put(remote);
        await db.remoteArtworks.put(record);
        summary.pulled++;
        return;
      }

      if (!pending) {
        if (remote.updatedAt > local.updatedAt) {
          await db.artworks.put(remote);
          summary.pulled++;
        }
        await db.remoteArtworks.put(record);
        return;
      }

      // Mamy niewysłane zmiany lokalne, a na Dysku jest nowa wersja — to konflikt.
      if (remote.updatedAt > local.updatedAt) {
        await this.saveConflict(local, summary);
        await db.artworks.put(remote);
        await db.outbox.delete(pending.id);
        summary.pulled++;
      } else {
        await this.saveConflict(remote, summary);
      }
      await db.remoteArtworks.put(record);
    });
  }

  private async saveConflict(loser: Artwork, summary: SyncSummary): Promise<void> {
    await this.db.conflicts.put({
      id: `${loser.id}:${loser.updatedAt}`,
      entityId: loser.id,
      losingVersion: loser,
      detectedAt: new Date(this.now()).toISOString(),
    });
    summary.conflicts++;
  }

  // ---------- wysyłanie ----------

  private async push(folders: DriveFolders, summary: SyncSummary, force: boolean): Promise<void> {
    const rank = (i: OutboxItem) => (i.entity === 'photo' ? 0 : i.entity === 'artwork' ? 1 : 2);
    const items = (await this.db.outbox.toArray()).sort(
      (a, b) => rank(a) - rank(b) || a.queuedAt.localeCompare(b.queuedAt),
    );
    const blockedPhotos = new Set<string>();

    for (const item of items) {
      if (!force && item.nextAttemptAt && item.nextAttemptAt > new Date(this.now()).toISOString()) {
        if (item.entity === 'photo') blockedPhotos.add(item.entityId);
        continue;
      }
      try {
        const outcome = await this.pushItem(folders, item, blockedPhotos);
        if (outcome === 'done') {
          // Jeśli w międzyczasie ktoś zmienił dzieło, w kolejce jest już nowsza pozycja — jej nie ruszamy.
          await this.db.outbox
            .where('id')
            .equals(item.id)
            .filter((i) => i.queuedAt === item.queuedAt)
            .delete();
          summary.pushed++;
        }
      } catch (e) {
        if (e instanceof AuthError || e instanceof NetworkError) throw e;
        if (item.entity === 'photo') blockedPhotos.add(item.entityId);
        const attempts = item.attempts + 1;
        await this.db.outbox.update(item.id, {
          attempts,
          lastError: e instanceof Error ? e.message : String(e),
          nextAttemptAt: new Date(this.now() + Math.min(5000 * 2 ** attempts, MAX_BACKOFF_MS)).toISOString(),
        });
        summary.failed++;
      }
    }
  }

  private async pushItem(
    folders: DriveFolders,
    item: OutboxItem,
    blockedPhotos: Set<string>,
  ): Promise<'done' | 'deferred'> {
    switch (item.entity) {
      case 'photo':
        return item.op === 'delete' ? this.pushPhotoDelete(item) : this.pushPhotoUpsert(folders, item);
      case 'artwork':
        return this.pushArtwork(folders, item, blockedPhotos);
      case 'prices':
        return this.pushPrices(item);
      default:
        return 'done'; // ustawienia zmieniane są od razu, bez kolejki
    }
  }

  private async pushPhotoUpsert(folders: DriveFolders, item: OutboxItem): Promise<'done'> {
    const photo = await this.db.photos.get(item.entityId);
    if (!photo || photo.deleted) return 'done';
    const parentId = await this.photoFolder(folders, photo.artworkId);

    let driveFileId = photo.driveFileId;
    if (!driveFileId) {
      const blob = photo.original ?? photo.thumb;
      driveFileId = (await this.drive.uploadBlob({ name: `${photo.id}.jpg`, parentId, blob })).id;
      await this.db.photos.update(photo.id, { driveFileId }); // zapamiętujemy od razu na wypadek przerwania
    }
    if (!photo.driveThumbId) {
      const thumb = await this.drive.uploadBlob({ name: `${photo.id}_thumb.jpg`, parentId, blob: photo.thumb });
      await this.db.photos.update(photo.id, { driveThumbId: thumb.id });
    }
    return 'done';
  }

  private async pushPhotoDelete(item: OutboxItem): Promise<'done'> {
    const photo = await this.db.photos.get(item.entityId);
    if (!photo) return 'done';
    if (photo.driveFileId) await this.drive.deleteFile(photo.driveFileId);
    if (photo.driveThumbId) await this.drive.deleteFile(photo.driveThumbId);
    await this.db.photos.delete(photo.id); // dopiero teraz, gdy Dysk już o tym wie
    return 'done';
  }

  private async pushArtwork(
    folders: DriveFolders,
    item: OutboxItem,
    blockedPhotos: Set<string>,
  ): Promise<'done' | 'deferred'> {
    const { db } = this;
    let art = await db.artworks.get(item.entityId);
    if (!art) return 'done';

    const photos = (await db.photos.bulkGet(art.photoIds)).filter((p): p is Photo => !!p);
    if (!art.deleted) {
      // Plik dzieła zawiera odnośniki do zdjęć, więc zdjęcia muszą być już na Dysku.
      if (art.photoIds.some((id) => blockedPhotos.has(id))) return 'deferred';
      if (photos.some((p) => !p.driveFileId)) return 'deferred';
    }

    if (art.invNoProvisional && !art.deleted) {
      const year = new Date(art.createdAt).getFullYear();
      const invNo = await reserveInvNo(this.drive, folders, year, this.sleep);
      const finalized = await db.transaction('rw', db.artworks, async () => {
        const cur = await db.artworks.get(art!.id);
        if (!cur || cur.updatedAt !== art!.updatedAt) return undefined; // edytowane w trakcie — wrócimy do tego
        const next: Artwork = {
          ...cur,
          invNo,
          invNoProvisional: false,
          // Zawsze późniejszy niż poprzednia wersja, nawet gdy zegar urządzenia się spóźnia.
          updatedAt: new Date(Math.max(this.now(), Date.parse(cur.updatedAt) + 1)).toISOString(),
        };
        await db.artworks.put(next);
        return next;
      });
      if (!finalized) return 'deferred';
      art = finalized;
    }

    const refs: PhotoRef[] = photos
      .filter((p) => p.driveFileId)
      .map((p) => ({ id: p.id, kind: p.kind, driveFileId: p.driveFileId!, driveThumbId: p.driveThumbId }));
    const data: ArtworkFile = { schema: 1, artwork: art, photos: refs };
    const name = `${art.id}.json`;

    let fileId = (await db.remoteArtworks.get(art.id))?.fileId;
    fileId ??= (await this.drive.findFile(name, folders.artworksId))?.id;
    let written: DriveFile;
    try {
      written = await this.drive.writeJson({ name, parentId: folders.artworksId, data, fileId });
    } catch (e) {
      if (!(fileId && e instanceof DriveError && e.status === 404)) throw e;
      written = await this.drive.writeJson({ name, parentId: folders.artworksId, data });
    }
    await db.remoteArtworks.put({ id: art.id, fileId: written.id, remoteUpdatedAt: art.updatedAt });

    return 'done';
  }

  // ---------- na żądanie ----------

  /** Pobiera oryginał zdjęcia z Dysku (gdy lokalnie jest tylko miniatura). */
  async fetchOriginal(photoId: string): Promise<void> {
    const photo = await this.db.photos.get(photoId);
    if (!photo || photo.original || !photo.driveFileId) return;
    const original = await this.drive.downloadBlob(photo.driveFileId);
    await this.db.photos.update(photoId, { original });
  }
}
