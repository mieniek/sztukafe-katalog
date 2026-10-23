import type { Artwork } from '../db/types';
import type { DriveApi, DriveFile } from './driveApi';
import type { DriveFolders } from './remoteFormat';

export const KEEP_BACKUPS = 30;
export const BACKUP_NAME = /^\d{4}-\d{2}-\d{2}\.json$/;

/** Pełny zrzut katalogu bez zdjęć i bez cen prywatnych (te leżą w osobnym folderze). */
export interface BackupFile {
  schema: 1;
  createdAt: string;
  createdBy: string;
  artworks: Artwork[];
}

export interface BackupInfo {
  fileId: string;
  name: string; // RRRR-MM-DD.json
  date: string; // RRRR-MM-DD
}

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function listBackups(drive: DriveApi, folders: DriveFolders): Promise<BackupInfo[]> {
  const files = await drive.listFiles(folders.backupsId);
  return files
    .filter((f: DriveFile) => BACKUP_NAME.test(f.name))
    .map((f) => ({ fileId: f.id, name: f.name, date: f.name.replace('.json', '') }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Zapisuje kopię z dzisiejszą datą (ta sama doba = nadpisanie) i usuwa najstarsze ponad 30. */
export async function createBackup(
  drive: DriveApi,
  folders: DriveFolders,
  artworks: Artwork[],
  user: string,
  now: Date,
): Promise<BackupInfo> {
  const name = `${localDate(now)}.json`;
  const existing = (await listBackups(drive, folders)).find((b) => b.name === name);
  const data: BackupFile = { schema: 1, createdAt: now.toISOString(), createdBy: user, artworks };
  const file = await drive.writeJson({ name, parentId: folders.backupsId, data, fileId: existing?.fileId });

  const all = await listBackups(drive, folders);
  for (const old of all.slice(KEEP_BACKUPS)) await drive.deleteFile(old.fileId);
  return { fileId: file.id, name, date: name.replace('.json', '') };
}

export function readBackup(drive: DriveApi, fileId: string): Promise<BackupFile> {
  return drive.readJson<BackupFile>(fileId);
}
