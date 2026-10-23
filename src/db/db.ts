import Dexie, { type Table } from 'dexie';
import type {
  Artwork,
  ConflictRecord,
  MetaEntry,
  OutboxItem,
  Photo,
  PrivatePrices,
  RemoteArtwork,
} from './types';

/**
 * Schemat lokalnej bazy. Każda zmiana schematu = NOWA wersja `this.version(n)`
 * z funkcją `.upgrade()` — starych wersji nie edytujemy i nie usuwamy.
 */
export class KatalogDB extends Dexie {
  artworks!: Table<Artwork, string>;
  photos!: Table<Photo, string>;
  outbox!: Table<OutboxItem, string>;
  meta!: Table<MetaEntry, string>;
  conflicts!: Table<ConflictRecord, string>;
  remoteArtworks!: Table<RemoteArtwork, string>;
  prices!: Table<PrivatePrices, string>;

  constructor(name = 'sztukafe-katalog') {
    super(name);
    this.version(1).stores({
      artworks: 'id, invNo, status, category, createdAt, updatedAt',
      photos: 'id, artworkId',
      outbox: 'id, entity, entityId, queuedAt',
      meta: 'key',
      conflicts: 'id, entityId',
    });
    // Wersja 2 (faza 3): mapowanie dzieło → plik na Dysku Google. Nowa tabela, dane bez zmian.
    this.version(2).stores({
      remoteArtworks: 'id',
    });
    // Wersja 3 (faza 4): ceny zakupu i minimalne (tylko urządzenia adminów). Nowa tabela, dane bez zmian.
    this.version(3).stores({
      prices: 'id',
    });
  }
}

export const db = new KatalogDB();

/** Prosi przeglądarkę, by nie kasowała danych lokalnych przy braku miejsca (ważne na iOS). */
export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // brak wsparcia — dane i tak zostają w IndexedDB
  }
}
