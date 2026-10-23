import { db } from './db';
import type { PrivatePrices } from './types';

export interface PriceInput {
  purchasePrice?: number;
  minPrice?: number;
}

/**
 * Zapisuje ceny prywatne (zakupu i minimalną) dzieła i dokłada je do kolejki wysyłki.
 * Wywoływać wyłącznie dla admina — pracownik w ogóle nie widzi tych pól.
 */
export async function savePrices(artworkId: string, input: PriceInput): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.prices, db.outbox, async () => {
    const cur = await db.prices.get(artworkId);
    if (!cur && input.purchasePrice === undefined && input.minPrice === undefined) return;
    const row: PrivatePrices = {
      id: artworkId,
      purchasePrice: input.purchasePrice,
      minPrice: input.minPrice,
      updatedAt: new Date(Math.max(Date.now(), cur ? Date.parse(cur.updatedAt) + 1 : 0)).toISOString(),
    };
    await db.prices.put(row);
    await db.outbox.put({
      id: `prices:${artworkId}`,
      entity: 'prices',
      entityId: artworkId,
      op: 'upsert',
      queuedAt: now,
      attempts: 0,
    });
  });
}
