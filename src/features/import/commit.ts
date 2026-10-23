import { createArtwork, currentUser } from '../../db/artworks';
import { savePrices } from '../../db/prices';
import type { ImportPlan } from './plan';

export interface ImportResult {
  imported: number;
  incomplete: number;
  skippedDuplicates: number;
}

/**
 * Zapisuje plan w katalogu. Dzieła bez zdjęć dostają numery tymczasowe (finalne nada synchronizacja),
 * a te z brakami — oznaczenie „do uzupełnienia”. Ceny wewnętrzne zapisuje tylko admin.
 */
export async function importPlan(
  plan: ImportPlan,
  options: { isAdmin: boolean; onProgress?: (done: number, total: number) => void },
): Promise<ImportResult> {
  const toImport = plan.rows.filter((r) => r.status !== 'duplicate');
  let imported = 0;
  let incomplete = 0;
  for (const row of toImport) {
    const created = await createArtwork(row.input, [], currentUser(), { needsCompletion: row.missing });
    if (options.isAdmin && (row.purchasePrice !== undefined || row.minPrice !== undefined)) {
      await savePrices(created.id, { purchasePrice: row.purchasePrice, minPrice: row.minPrice });
    }
    imported++;
    if (row.status === 'incomplete') incomplete++;
    options.onProgress?.(imported, toImport.length);
  }
  return { imported, incomplete, skippedDuplicates: plan.duplicates };
}
