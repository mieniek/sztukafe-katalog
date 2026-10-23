/** Błędy synchronizacji. `message` można pokazać użytkownikowi. */
export class AuthError extends Error {
  constructor(message = 'Trzeba zalogować się ponownie do Google.') {
    super(message);
  }
}

export class NetworkError extends Error {
  constructor(message = 'Brak połączenia z internetem.') {
    super(message);
  }
}

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface DriveFile {
  id: string;
  name: string;
  parents?: string[];
  createdTime?: string;
  modifiedTime?: string;
  trashed?: boolean;
}

export interface DriveChange {
  fileId: string;
  removed: boolean;
  file?: DriveFile;
}

export interface DrivePermission {
  id: string;
  emailAddress?: string;
  role: string; // owner | writer | reader ...
}

export interface DriveUser {
  email: string;
  displayName?: string;
}

export interface ChangesPage {
  changes: DriveChange[];
  nextPageToken?: string;
  newStartPageToken?: string;
}

/** Wszystko, czego SyncEngine potrzebuje od Dysku. Prawdziwa i testowa wersja implementują to samo. */
export interface DriveApi {
  getUser(): Promise<DriveUser>;
  listPermissions(fileId: string): Promise<DrivePermission[]>;
  /** Udostępnia plik/folder osobie o danym adresie Google. */
  createPermission(fileId: string, email: string, role: 'writer' | 'reader'): Promise<void>;
  deletePermission(fileId: string, permissionId: string): Promise<void>;
  /** Szuka folderu o danej nazwie (dostępnego dla użytkownika, także udostępnionego). Najstarszy wygrywa. */
  findFolder(name: string, parentId?: string): Promise<DriveFile | undefined>;
  createFolder(name: string, parentId?: string): Promise<DriveFile>;
  findFile(name: string, parentId: string): Promise<DriveFile | undefined>;
  listFiles(parentId: string): Promise<DriveFile[]>;
  readJson<T>(fileId: string): Promise<T>;
  /** Tworzy plik albo (gdy podano `fileId`) nadpisuje jego zawartość. */
  writeJson(args: { name: string; parentId: string; data: unknown; fileId?: string }): Promise<DriveFile>;
  uploadBlob(args: { name: string; parentId: string; blob: Blob }): Promise<DriveFile>;
  downloadBlob(fileId: string): Promise<Blob>;
  deleteFile(fileId: string): Promise<void>;
  getStartPageToken(): Promise<string>;
  listChanges(pageToken: string): Promise<ChangesPage>;
}

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
