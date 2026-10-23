import { useLiveQuery } from 'dexie-react-hooks';
import { db as defaultDb, type KatalogDB } from './db';

/** Etykieta czekająca na arkusz A4. */
export interface QueuedLabel {
  artworkId: string;
  showPrice: boolean;
}

export const LABEL_QUEUE_KEY = 'labels.queue';
export const SHEET_CAPACITY = 8;

export async function getLabelQueue(database: KatalogDB = defaultDb): Promise<QueuedLabel[]> {
  return ((await database.meta.get(LABEL_QUEUE_KEY))?.value as QueuedLabel[] | undefined) ?? [];
}

async function save(queue: QueuedLabel[], database: KatalogDB) {
  await database.meta.put({ key: LABEL_QUEUE_KEY, value: queue });
}

/** Dodaje etykietę do arkusza. Ta sama praca nie powtarza się (zmienia się tylko ustawienie ceny). Zwraca false, gdy arkusz jest pełny. */
export async function addLabel(label: QueuedLabel, database: KatalogDB = defaultDb): Promise<boolean> {
  const queue = await getLabelQueue(database);
  const existing = queue.findIndex((q) => q.artworkId === label.artworkId);
  if (existing >= 0) {
    queue[existing] = label;
    await save(queue, database);
    return true;
  }
  if (queue.length >= SHEET_CAPACITY) return false;
  await save([...queue, label], database);
  return true;
}

export async function removeLabel(artworkId: string, database: KatalogDB = defaultDb): Promise<void> {
  await save((await getLabelQueue(database)).filter((q) => q.artworkId !== artworkId), database);
}

export async function clearLabels(database: KatalogDB = defaultDb): Promise<void> {
  await save([], database);
}

export function useLabelQueue(): QueuedLabel[] {
  return useLiveQuery(() => getLabelQueue(), [], []);
}
