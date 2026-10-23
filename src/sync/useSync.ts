import { useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { syncService, type SyncState } from './syncService';

export function useSyncState(): SyncState {
  return useSyncExternalStore(syncService.subscribe, syncService.getState);
}

/** Ile zmian czeka na wysłanie. */
export function usePendingCount(): number {
  return useLiveQuery(() => db.outbox.count(), [], 0);
}
