import { db as defaultDb, type KatalogDB } from './db';
import { currentUser } from './artworks';
import type { BackupFile } from '../sync/backups';

const sameContent = (a: object, b: object) =>
  JSON.stringify({ ...a, updatedAt: '', updatedBy: '' }) === JSON.stringify({ ...b, updatedAt: '', updatedBy: '' });

/**
 * Przywraca dzieła do stanu z kopii. Nic nie kasuje: dzieła dodane po wykonaniu kopii zostają,
 * a dzieła usunięte od tamtej pory wracają. Przywrócone rekordy dostają nowy `updatedAt`,
 * więc wygrywają na pozostałych urządzeniach i trafiają do kolejki wysyłki.
 * Zwraca liczbę faktycznie zmienionych dzieł.
 */
export async function restoreFromBackup(backup: BackupFile, database: KatalogDB = defaultDb): Promise<number> {
  let changed = 0;
  await database.transaction('rw', database.artworks, database.photos, database.outbox, async () => {
    for (const saved of backup.artworks) {
      const cur = await database.artworks.get(saved.id);
      // Zostawiamy tylko zdjęcia, które nadal istnieją (usunięte z Dysku nie wrócą).
      const rows = await database.photos.bulkGet(saved.photoIds);
      const alive = saved.photoIds.filter((_, i) => rows[i] && !rows[i]!.deleted);
      const next = { ...saved, photoIds: alive.length > 0 ? alive : saved.photoIds };
      if (cur && sameContent(cur, next)) continue;
      const now = new Date(Math.max(Date.now(), cur ? Date.parse(cur.updatedAt) + 1 : 0)).toISOString();
      await database.artworks.put({ ...next, updatedAt: now, updatedBy: currentUser() });
      await database.outbox.put({
        id: `artwork:${saved.id}`,
        entity: 'artwork',
        entityId: saved.id,
        op: 'upsert',
        queuedAt: now,
        attempts: 0,
      });
      changed++;
    }
  });
  return changed;
}
