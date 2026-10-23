import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { RATE_KEY, type StoredRate } from './rates';

/** Ostatni znany kurs EUR (undefined, dopóki żaden nie został pobrany ani wpisany). */
export function useEurRate(): StoredRate | undefined {
  return useLiveQuery(async () => (await db.meta.get(RATE_KEY))?.value as StoredRate | undefined, []);
}
