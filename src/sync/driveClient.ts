import {
  AuthError,
  DriveError,
  FOLDER_MIME,
  NetworkError,
  type ChangesPage,
  type DriveApi,
  type DriveFile,
  type DrivePermission,
  type DriveUser,
} from './driveApi';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FILE_FIELDS = 'id,name,parents,createdTime,modifiedTime,trashed';

export interface TokenSource {
  /** Zwraca ważny token dostępu (w razie potrzeby odnawia po cichu); rzuca AuthError. */
  getToken(): Promise<string>;
  /** Wywoływane po odpowiedzi 401: unieważnia token, żeby kolejny getToken pobrał nowy. */
  invalidate(): void;
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Klient Google Drive API v3 oparty o zwykły `fetch`. */
export class GoogleDriveClient implements DriveApi {
  constructor(private readonly tokens: TokenSource) {}

  private async request(url: string, init: RequestInit = {}, retried = false): Promise<Response> {
    const token = await this.tokens.getToken();
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    } catch {
      throw new NetworkError();
    }
    if (res.status === 401) {
      this.tokens.invalidate();
      if (retried) throw new AuthError();
      return this.request(url, init, true);
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json())?.error?.message ?? '';
      } catch {
        // odpowiedź bez treści JSON
      }
      throw new DriveError(`Google Drive: ${detail || res.statusText} (${res.status})`, res.status);
    }
    return res;
  }

  private async json<T>(url: string, init?: RequestInit): Promise<T> {
    return (await this.request(url, init)).json() as Promise<T>;
  }

  async getUser(): Promise<DriveUser> {
    const about = await this.json<{ user: { emailAddress: string; displayName?: string } }>(
      `${API}/about?fields=user(emailAddress,displayName)`,
    );
    return { email: about.user.emailAddress, displayName: about.user.displayName };
  }

  async listPermissions(fileId: string): Promise<DrivePermission[]> {
    const r = await this.json<{ permissions: DrivePermission[] }>(
      `${API}/files/${fileId}/permissions?fields=permissions(id,emailAddress,role)&pageSize=100`,
    );
    return r.permissions ?? [];
  }

  async createPermission(fileId: string, email: string, role: 'writer' | 'reader'): Promise<void> {
    await this.request(`${API}/files/${fileId}/permissions?sendNotificationEmail=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'user', role, emailAddress: email }),
    });
  }

  async deletePermission(fileId: string, permissionId: string): Promise<void> {
    try {
      await this.request(`${API}/files/${fileId}/permissions/${permissionId}`, { method: 'DELETE' });
    } catch (e) {
      if (e instanceof DriveError && e.status === 404) return;
      throw e;
    }
  }

  private async listQuery(q: string, orderBy?: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        pageSize: '1000',
        spaces: 'drive',
      });
      if (orderBy) params.set('orderBy', orderBy);
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.json<{ files: DriveFile[]; nextPageToken?: string }>(`${API}/files?${params}`);
      files.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }

  async findFolder(name: string, parentId?: string): Promise<DriveFile | undefined> {
    const parent = parentId ? ` and ${quote(parentId)} in parents` : '';
    const found = await this.listQuery(
      `name = ${quote(name)} and mimeType = '${FOLDER_MIME}' and trashed = false${parent}`,
      'createdTime',
    );
    return found[0];
  }

  async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    return this.json<DriveFile>(`${API}/files?fields=${FILE_FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
    });
  }

  async findFile(name: string, parentId: string): Promise<DriveFile | undefined> {
    const found = await this.listQuery(
      `name = ${quote(name)} and ${quote(parentId)} in parents and trashed = false`,
      'createdTime',
    );
    return found[0];
  }

  listFiles(parentId: string): Promise<DriveFile[]> {
    return this.listQuery(`${quote(parentId)} in parents and trashed = false`);
  }

  async readJson<T>(fileId: string): Promise<T> {
    return (await this.request(`${API}/files/${fileId}?alt=media`)).json() as Promise<T>;
  }

  async writeJson(args: { name: string; parentId: string; data: unknown; fileId?: string }): Promise<DriveFile> {
    const boundary = `sztukafe${Math.random().toString(36).slice(2)}`;
    const metadata = args.fileId ? { name: args.name } : { name: args.name, parents: [args.parentId] };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(args.data)}\r\n` +
      `--${boundary}--`;
    const url = args.fileId
      ? `${UPLOAD}/files/${args.fileId}?uploadType=multipart&fields=${FILE_FIELDS}`
      : `${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`;
    return this.json<DriveFile>(url, {
      method: args.fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
  }

  /** Przesyłanie wznawialne (resumable): zdjęcia mogą mieć kilka MB. */
  async uploadBlob(args: { name: string; parentId: string; blob: Blob }): Promise<DriveFile> {
    const start = await this.request(`${UPLOAD}/files?uploadType=resumable&fields=${FILE_FIELDS}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': args.blob.type || 'application/octet-stream',
        'X-Upload-Content-Length': String(args.blob.size),
      },
      body: JSON.stringify({ name: args.name, parents: [args.parentId] }),
    });
    const location = start.headers.get('Location');
    if (!location) throw new DriveError('Google Drive nie zwrócił adresu przesyłania.', 500);
    let res: Response;
    try {
      res = await fetch(location, { method: 'PUT', body: args.blob });
    } catch {
      throw new NetworkError();
    }
    if (!res.ok) throw new DriveError(`Nie udało się wysłać pliku (${res.status}).`, res.status);
    return (await res.json()) as DriveFile;
  }

  async downloadBlob(fileId: string): Promise<Blob> {
    return (await this.request(`${API}/files/${fileId}?alt=media`)).blob();
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      await this.request(`${API}/files/${fileId}`, { method: 'DELETE' });
    } catch (e) {
      if (e instanceof DriveError && e.status === 404) return; // już go nie ma
      throw e;
    }
  }

  async getStartPageToken(): Promise<string> {
    const r = await this.json<{ startPageToken: string }>(`${API}/changes/startPageToken`);
    return r.startPageToken;
  }

  async listChanges(pageToken: string): Promise<ChangesPage> {
    const params = new URLSearchParams({
      pageToken,
      pageSize: '200',
      includeRemoved: 'true',
      spaces: 'drive',
      fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FILE_FIELDS}))`,
    });
    return this.json<ChangesPage>(`${API}/changes?${params}`);
  }
}
