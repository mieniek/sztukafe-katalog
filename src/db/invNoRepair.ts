import { db as defaultDb, type KatalogDB } from './db';
import type { Artwork } from './types';
import { currentUser } from './artworks';

/** Grupy dzieł o tym samym (finalnym) numerze inwentarzowym. Zwykle pusta lista. */
export async function findDuplicateInvNos(database: KatalogDB = defaultDb): Promise<Artwork[][]> {
  const all = (await database.artworks.toArray()).filter((a) => !a.deleted && !a.invNoProvisional);
  const byNo = new Map<string, Artwork[]>();
  for (const a of all) byNo.set(a.invNo, [...(byNo.get(a.invNo) ?? []), a]);
  return [...byNo.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id)));
}

/** Oznacza numer jako tymczasowy — najbliższa synchronizacja nada nowy, unikalny. */
export async function requestNewInvNo(id: string, database: KatalogDB = defaultDb): Promise<void> {
  const now = new Date().toISOString();
  await database.transaction('rw', database.artworks, database.outbox, async () => {
    const cur = await database.artworks.get(id);
    if (!cur) return;
    await database.artworks.put({ ...cur, invNoProvisional: true, updatedAt: now, updatedBy: currentUser() });
    await database.outbox.put({ id: `artwork:${id}`, entity: 'artwork', entityId: id, op: 'upsert', queuedAt: now, attempts: 0 });
  });
}
