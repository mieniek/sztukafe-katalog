import type { Artwork, PhotoKind } from '../db/types';

/** Nazwy folderów na Dysku Google (plan, pkt 3.1). */
export const FOLDER_NAMES = {
  root: 'SztuKaFe-Katalog',
  artworks: 'artworks',
  photos: 'photos',
  config: 'config',
  backups: 'backups',
} as const;

export interface DriveFolders {
  rootId: string;
  artworksId: string;
  photosId: string;
  configId: string;
  backupsId: string;
}

export interface PhotoRef {
  id: string;
  kind: PhotoKind;
  driveFileId: string;
  driveThumbId?: string;
}

/** Zawartość pliku artworks/{id}.json. */
export interface ArtworkFile {
  schema: 1;
  artwork: Artwork;
  photos: PhotoRef[];
}

/** Zawartość pliku config/settings.json. `version` rośnie przy każdym zapisie. */
export interface RemoteSettings {
  version: number;
  counter: Record<string, number>;
  [other: string]: unknown;
}

export const SETTINGS_FILE = 'settings.json';
