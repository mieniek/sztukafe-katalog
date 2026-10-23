import { db } from './db';
import { currentUser } from './artworks';

/** Przywraca przegraną wersję jako nową edycję (trafi do kolejki wysyłki) i zamyka konflikt. */
export async function restoreConflictVersion(conflictId: string): Promise<void> {
  await db.transaction('rw', db.artworks, db.outbox, db.conflicts, async () => {
    const conflict = await db.conflicts.get(conflictId);
    if (!conflict) return;
    const cur = await db.artworks.get(conflict.entityId);
    const after = cur ? Date.parse(cur.updatedAt) + 1 : 0;
    const now = new Date(Math.max(Date.now(), after)).toISOString();
    await db.artworks.put({
      ...conflict.losingVersion,
      updatedAt: now,
      updatedBy: currentUser(),
    });
    await db.outbox.put({
      id: `artwork:${conflict.entityId}`,
      entity: 'artwork',
      entityId: conflict.entityId,
      op: 'upsert',
      queuedAt: now,
      attempts: 0,
    });
    await db.conflicts.delete(conflictId);
  });
}

export async function dismissConflict(conflictId: string): Promise<void> {
  await db.conflicts.delete(conflictId);
}
