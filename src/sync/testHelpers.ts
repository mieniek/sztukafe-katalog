import { KatalogDB } from '../db/db';
import type { Artwork } from '../db/types';
import { newId } from '../lib/id';
import { provisionalInvNo } from '../lib/invNo';
import type { DriveApi } from './driveApi';
import type { FakeDrive } from './fakeDrive';
import { SyncEngine } from './syncEngine';

let dbCounter = 0;
let clock = Date.UTC(2026, 5, 1);
export const advanceClock = (ms: number) => {
  clock += ms;
};

export function device(drive: FakeDrive, email: string, apiWrap?: (api: DriveApi) => DriveApi) {
  const db = new KatalogDB(`test-${++dbCounter}`);
  const api = apiWrap ? apiWrap(drive.as(email)) : drive.as(email);
  const engine = new SyncEngine(db, api, { sleep: async () => {}, now: () => clock });
  return { db, engine };
}
export type Device = ReturnType<typeof device>;

export const iso = (offsetMin = 0) => new Date(Date.UTC(2026, 5, 1, 12, offsetMin)).toISOString();

/** Dodaje dzieło tak jak robi to aplikacja: dzieło + zdjęcie + wpisy w kolejce. */
export async function seed(d: Device, over: Partial<Artwork> = {}): Promise<Artwork> {
  const id = newId();
  const photoId = newId();
  const art: Artwork = {
    id,
    invNo: provisionalInvNo(2026),
    invNoProvisional: true,
    title: 'Zima',
    artist: 'Jan Kowalski',
    category: 'malarstwo',
    dimensionsCm: { w: 60, h: 80 },
    basis: 'wlasnosc',
    status: 'dostepne',
    location: 'magazyn',
    salePrice: 1000,
    currency: 'PLN',
    photoIds: [photoId],
    createdAt: iso(),
    updatedAt: iso(),
    createdBy: 'a@x.pl',
    updatedBy: 'a@x.pl',
    ...over,
  };
  await d.db.photos.put({
    id: photoId,
    artworkId: id,
    kind: 'przod',
    thumb: new Blob(['t'], { type: 'image/jpeg' }),
    original: new Blob(['o'], { type: 'image/jpeg' }),
  });
  await d.db.artworks.put(art);
  const q = { queuedAt: art.updatedAt, attempts: 0, op: 'upsert' as const };
  await d.db.outbox.put({ id: `photo:${photoId}`, entity: 'photo', entityId: photoId, ...q });
  await d.db.outbox.put({ id: `artwork:${id}`, entity: 'artwork', entityId: id, ...q });
  return art;
}

/** Zmiana dzieła jak z formularza: nowy updatedAt + wpis w kolejce. */
export async function edit(d: Device, id: string, patch: Partial<Artwork>, at: string) {
  const cur = (await d.db.artworks.get(id))!;
  await d.db.artworks.put({ ...cur, ...patch, updatedAt: at });
  await d.db.outbox.put({ id: `artwork:${id}`, entity: 'artwork', entityId: id, op: 'upsert', queuedAt: at, attempts: 0 });
}

