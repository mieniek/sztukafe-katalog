import { db } from './db';
import type { Artwork, OutboxItem, Photo, PhotoKind, Status } from './types';
import { newId } from '../lib/id';
import { provisionalInvNo } from '../lib/invNo';

/** Podpis zmian, gdy nikt nie jest zalogowany do Google. */
export const LOCAL_USER = 'lokalnie';

let signedInUser: string | undefined;

/** Ustawiane po zalogowaniu do Google: e-mail trafia do pól createdBy / updatedBy. */
export function setCurrentUser(email: string | undefined): void {
  signedInUser = email;
}

export function currentUser(): string {
  return signedInUser ?? LOCAL_USER;
}

export type ArtworkInput = Omit<
  Artwork,
  | 'id'
  | 'invNo'
  | 'invNoProvisional'
  | 'photoIds'
  | 'certificate'
  | 'createdAt'
  | 'updatedAt'
  | 'createdBy'
  | 'updatedBy'
  | 'deleted'
  | 'soldAt'
>;

/** Zdjęcie w trakcie edycji: albo nowe (z blobami), albo już zapisane w bazie. */
export interface PhotoDraft {
  id: string;
  kind: PhotoKind;
  thumb: Blob;
  original?: Blob;
  existing?: boolean;
}

function queue(entity: OutboxItem['entity'], entityId: string, op: OutboxItem['op'], now: string): OutboxItem {
  return { id: `${entity}:${entityId}`, entity, entityId, op, queuedAt: now, attempts: 0 };
}

async function uniqueInvNo(): Promise<string> {
  for (;;) {
    const candidate = provisionalInvNo();
    if (!(await db.artworks.where('invNo').equals(candidate).first())) return candidate;
  }
}

export function newPhotoDraft(kind: PhotoKind, blobs: { thumb: Blob; original: Blob }): PhotoDraft {
  return { id: newId(), kind, thumb: blobs.thumb, original: blobs.original };
}

export async function createArtwork(
  input: ArtworkInput,
  photos: PhotoDraft[],
  user: string = currentUser(),
  extra: { needsCompletion?: string[] } = {},
): Promise<Artwork> {
  const now = new Date().toISOString();
  const id = newId();
  const invNo = await uniqueInvNo();
  const artwork: Artwork = {
    ...input,
    id,
    invNo,
    invNoProvisional: true,
    photoIds: photos.map((p) => p.id),
    soldAt: input.status === 'sprzedane' ? now : undefined,
    needsCompletion: extra.needsCompletion?.length ? extra.needsCompletion : undefined,
    createdAt: now,
    updatedAt: now,
    createdBy: user,
    updatedBy: user,
  };
  await db.transaction('rw', db.artworks, db.photos, db.outbox, async () => {
    for (const p of photos) {
      await db.photos.put({ id: p.id, artworkId: id, kind: p.kind, thumb: p.thumb, original: p.original });
      await db.outbox.put(queue('photo', p.id, 'upsert', now));
    }
    await db.artworks.put(artwork);
    await db.outbox.put(queue('artwork', id, 'upsert', now));
  });
  return artwork;
}

/** `photos` = docelowa lista zdjęć w kolejności; pierwsze jest zdjęciem głównym. */
export async function updateArtwork(
  id: string,
  input: ArtworkInput,
  photos: PhotoDraft[],
  user: string = currentUser(),
): Promise<Artwork> {
  const now = new Date().toISOString();
  return db.transaction('rw', db.artworks, db.photos, db.outbox, async () => {
    const current = await db.artworks.get(id);
    if (!current) throw new Error('Nie znaleziono dzieła.');
    const finalIds = new Set(photos.map((p) => p.id));

    for (const oldId of current.photoIds) {
      if (!finalIds.has(oldId)) {
        await db.photos.update(oldId, { deleted: true });
        await db.outbox.put(queue('photo', oldId, 'delete', now));
      }
    }
    for (const p of photos) {
      if (p.existing) {
        const stored = await db.photos.get(p.id);
        if (stored && stored.kind !== p.kind) {
          await db.photos.update(p.id, { kind: p.kind });
          await db.outbox.put(queue('photo', p.id, 'upsert', now));
        }
      } else {
        await db.photos.put({ id: p.id, artworkId: id, kind: p.kind, thumb: p.thumb, original: p.original });
        await db.outbox.put(queue('photo', p.id, 'upsert', now));
      }
    }

    const updated: Artwork = {
      ...current,
      ...input,
      soldAt: input.status === 'sprzedane' ? (current.status === 'sprzedane' ? current.soldAt : now) : undefined,
      needsCompletion: undefined, // formularz nie zapisze się z brakami, więc po edycji rekord jest kompletny
      photoIds: photos.map((p) => p.id),
      updatedAt: now,
      updatedBy: user,
    };
    await db.artworks.put(updated);
    await db.outbox.put(queue('artwork', id, 'upsert', now));
    return updated;
  });
}

export async function setArtworkStatus(
  id: string,
  status: Status,
  reservation?: { until: string; note?: string },
  user: string = currentUser(),
): Promise<void> {
  if (status === 'zarezerwowane' && !reservation?.until) {
    throw new Error('Rezerwacja wymaga daty.');
  }
  const now = new Date().toISOString();
  await db.transaction('rw', db.artworks, db.outbox, async () => {
    const current = await db.artworks.get(id);
    if (!current) throw new Error('Nie znaleziono dzieła.');
    await db.artworks.put({
      ...current,
      status,
      soldAt: status === 'sprzedane' ? (current.status === 'sprzedane' ? current.soldAt : now) : undefined,
      reservation: status === 'zarezerwowane' ? reservation : undefined,
      updatedAt: now,
      updatedBy: user,
    });
    await db.outbox.put(queue('artwork', id, 'upsert', now));
  });
}

/** Miękkie usunięcie: rekord zostaje jako znacznik, żeby synchronizacja mogła go przekazać dalej. */
export async function softDeleteArtwork(id: string, user: string = currentUser()): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.artworks, db.outbox, async () => {
    const current = await db.artworks.get(id);
    if (!current) return;
    await db.artworks.put({ ...current, deleted: true, updatedAt: now, updatedBy: user });
    await db.outbox.put(queue('artwork', id, 'delete', now));
  });
}

export async function loadPhotoDrafts(artwork: Artwork): Promise<PhotoDraft[]> {
  const photos = await db.photos.bulkGet(artwork.photoIds);
  return photos
    .filter((p): p is Photo => !!p && !p.deleted)
    .map((p) => ({ id: p.id, kind: p.kind, thumb: p.thumb, original: p.original, existing: true }));
}

/** Cofnięcie usunięcia (np. przyciskiem „Cofnij” w powiadomieniu). */
export async function restoreArtwork(id: string, user: string = currentUser()): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.artworks, db.outbox, async () => {
    const current = await db.artworks.get(id);
    if (!current) return;
    await db.artworks.put({ ...current, deleted: false, updatedAt: now, updatedBy: user });
    await db.outbox.put(queue('artwork', id, 'upsert', now));
  });
}
