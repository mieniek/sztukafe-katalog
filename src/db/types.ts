export type Category =
  | 'malarstwo'
  | 'rysunek'
  | 'grafika'
  | 'fotografia'
  | 'rzezba'
  | 'ceramika'
  | 'szklo'
  | 'bizuteria_rzemioslo';
export type Status = 'dostepne' | 'w_magazynie' | 'zarezerwowane' | 'sprzedane';
export type Location = 'sala_wystawowa' | 'magazyn';
export type Basis = 'wlasnosc' | 'komis';
export type Currency = 'PLN' | 'EUR';
export type PhotoKind = 'przod' | 'tyl' | 'sygnatura' | 'detal' | 'inne' | 'certyfikat';

export interface Artwork {
  id: string; // UUID v4 (stabilny klucz, niezależny od numeru)
  invNo: string; // SZK-2026-0001
  invNoProvisional: boolean; // true = nadany lokalnie, do potwierdzenia
  title: string;
  artist: string;
  year?: number;
  category: Category;
  technique?: string;
  material?: string;
  dimensionsCm: { w: number; h: number; d?: number };
  weightKg?: number;
  edition?: string;
  description?: string;
  certificate?: { photoId?: string; note?: string };
  basis: Basis;
  status: Status;
  location: Location;
  reservation?: { until: string; note?: string };
  salePrice: number;
  currency: Currency;
  photoIds: string[]; // [0] = zdjęcie główne
  soldAt?: string; // kiedy status zmieniono na „sprzedane”
  /** Pola wymagane, których brakuje (rekord z importu „do uzupełnienia”): title, artist, dimensions, salePrice. */
  needsCompletion?: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  deleted?: boolean;
}

/** Ceny widoczne tylko dla admina — leżą w osobnym folderze na Dysku (plan, pkt 3.1). */
export interface PrivatePrices {
  id: string; // id dzieła
  purchasePrice?: number;
  minPrice?: number;
  updatedAt: string;
}

export type Role = 'admin' | 'pracownik';

export interface Photo {
  id: string;
  artworkId: string;
  kind: PhotoKind;
  thumb: Blob;
  original?: Blob;
  driveFileId?: string;
  driveThumbId?: string;
  deleted?: boolean; // zdjęcie usunięte z dzieła (znacznik do synchronizacji)
}

export interface OutboxItem {
  id: string; // `${entity}:${entityId}` — nowsza operacja zastępuje starszą
  entity: 'artwork' | 'prices' | 'photo' | 'settings';
  entityId: string;
  op: 'upsert' | 'delete';
  queuedAt: string;
  attempts: number;
  nextAttemptAt?: string; // wznowienie po błędzie (wykładniczy czas oczekiwania)
  lastError?: string;
}

/** Co wiemy o pliku dzieła na Dysku: pozwala odróżnić własne zmiany od cudzych. */
export interface RemoteArtwork {
  id: string; // id dzieła
  fileId: string; // id pliku artworks/{id}.json
  remoteUpdatedAt: string; // artwork.updatedAt z ostatniej wysłanej / pobranej wersji
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export interface ConflictRecord {
  id: string;
  entityId: string;
  losingVersion: Artwork;
  detectedAt: string;
}
