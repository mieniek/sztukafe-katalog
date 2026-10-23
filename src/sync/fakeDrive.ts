import {
  DriveError,
  FOLDER_MIME,
  NetworkError,
  type ChangesPage,
  type DriveApi,
  type DriveFile,
  type DrivePermission,
} from './driveApi';

interface Entry extends DriveFile {
  mime: string;
  owner: string;
  content?: unknown; // JSON
  blob?: Blob;
}

/**
 * Dysk Google w pamięci — wyłącznie do testów. Zachowuje się jak prawdziwy:
 * foldery, pliki, historia zmian z tokenami, uprawnienia (plik widzi właściciel oraz osoby,
 * którym udostępniono go albo jego folder nadrzędny). Można go „odłączyć od sieci”.
 */
export class FakeDrive {
  entries = new Map<string, Entry>();
  permissions = new Map<string, DrivePermission[]>();
  private seq = 0;
  private clock = 0;
  private changeLog: { n: number; fileId: string }[] = [];
  offline = false;
  /** Do symulacji wyścigu: wywoływane przed każdym zapisem JSON. */
  beforeWriteJson?: (name: string) => Promise<void> | void;
  writes: string[] = [];

  private stamp(): string {
    return new Date(Date.UTC(2026, 0, 1) + ++this.clock * 1000).toISOString();
  }

  private touch(id: string) {
    this.changeLog.push({ n: this.changeLog.length + 1, fileId: id });
  }

  private guard() {
    if (this.offline) throw new NetworkError();
  }

  /** Czy `email` ma dostęp do wpisu (jest właścicielem albo ma uprawnienie na nim lub na folderze nadrzędnym). */
  canAccess(email: string, id: string | undefined, depth = 0): boolean {
    const e = id ? this.entries.get(id) : undefined;
    if (!e || depth > 10) return false;
    if (e.owner === email) return true;
    if (this.permissions.get(e.id)?.some((p) => p.emailAddress === email)) return true;
    return (e.parents ?? []).some((p) => this.canAccess(email, p, depth + 1));
  }

  /** Widok tego Dysku dla jednego użytkownika (np. jednego urządzenia). */
  as(email: string): DriveApi {
    const self = this;
    const pub = (e: Entry): DriveFile => ({
      id: e.id,
      name: e.name,
      parents: e.parents,
      createdTime: e.createdTime,
      modifiedTime: e.modifiedTime,
      trashed: e.trashed,
    });
    const visible = () => [...self.entries.values()].filter((e) => self.canAccess(email, e.id));
    const need = (id: string): Entry => {
      const e = self.entries.get(id);
      if (!e || !self.canAccess(email, id)) throw new DriveError('Nie znaleziono pliku', 404);
      return e;
    };
    return {
      async getUser() {
        self.guard();
        return { email, displayName: email.split('@')[0] };
      },
      async listPermissions(fileId) {
        self.guard();
        need(fileId);
        const owner: DrivePermission = { id: `owner-${fileId}`, emailAddress: self.entries.get(fileId)!.owner, role: 'owner' };
        return [owner, ...(self.permissions.get(fileId) ?? [])];
      },
      async createPermission(fileId, target, role) {
        self.guard();
        need(fileId);
        const list = self.permissions.get(fileId) ?? [];
        if (!list.some((p) => p.emailAddress === target)) {
          list.push({ id: `perm${++self.seq}`, emailAddress: target, role });
          self.permissions.set(fileId, list);
        }
      },
      async deletePermission(fileId, permissionId) {
        self.guard();
        need(fileId);
        self.permissions.set(
          fileId,
          (self.permissions.get(fileId) ?? []).filter((p) => p.id !== permissionId),
        );
      },
      async findFolder(name, parentId) {
        self.guard();
        const hit = visible()
          .filter((e) => e.mime === FOLDER_MIME && e.name === name && !e.trashed)
          .filter((e) => !parentId || e.parents?.includes(parentId))
          .sort((a, b) => a.createdTime!.localeCompare(b.createdTime!))[0];
        return hit && pub(hit);
      },
      async createFolder(name, parentId) {
        self.guard();
        const e: Entry = {
          id: `id${++self.seq}`,
          name,
          mime: FOLDER_MIME,
          owner: email,
          parents: parentId ? [parentId] : [],
          createdTime: self.stamp(),
        };
        e.modifiedTime = e.createdTime;
        self.entries.set(e.id, e);
        self.touch(e.id);
        return pub(e);
      },
      async findFile(name, parentId) {
        self.guard();
        const hit = visible()
          .filter((e) => e.name === name && e.parents?.includes(parentId) && !e.trashed)
          .sort((a, b) => a.createdTime!.localeCompare(b.createdTime!))[0];
        return hit && pub(hit);
      },
      async listFiles(parentId) {
        self.guard();
        return visible()
          .filter((e) => e.parents?.includes(parentId) && !e.trashed)
          .map(pub);
      },
      async readJson<T>(fileId: string) {
        self.guard();
        return structuredClone(need(fileId).content) as T;
      },
      async writeJson({ name, parentId, data, fileId }) {
        self.guard();
        await self.beforeWriteJson?.(name);
        self.writes.push(name);
        let e = fileId ? need(fileId) : undefined;
        if (!e) {
          e = {
            id: `id${++self.seq}`,
            name,
            mime: 'application/json',
            owner: email,
            parents: [parentId],
            createdTime: self.stamp(),
          };
          self.entries.set(e.id, e);
        }
        e.content = structuredClone(data);
        e.modifiedTime = self.stamp();
        self.touch(e.id);
        return pub(e);
      },
      async uploadBlob({ name, parentId, blob }) {
        self.guard();
        const e: Entry = {
          id: `id${++self.seq}`,
          name,
          mime: blob.type,
          owner: email,
          parents: [parentId],
          createdTime: self.stamp(),
          blob,
        };
        e.modifiedTime = e.createdTime;
        self.entries.set(e.id, e);
        self.touch(e.id);
        return pub(e);
      },
      async downloadBlob(fileId) {
        self.guard();
        const e = need(fileId);
        if (!e.blob) throw new DriveError('Nie znaleziono pliku', 404);
        return e.blob;
      },
      async deleteFile(fileId) {
        self.guard();
        if (self.entries.has(fileId)) {
          need(fileId);
          self.entries.delete(fileId);
          self.touch(fileId);
        }
      },
      async getStartPageToken() {
        self.guard();
        return String(self.changeLog.length);
      },
      async listChanges(pageToken): Promise<ChangesPage> {
        self.guard();
        const from = Number(pageToken);
        const slice = self.changeLog.filter((c) => c.n > from);
        const latest = new Map(slice.map((c) => [c.fileId, c]));
        const changes = [...latest.values()].flatMap((c) => {
          const e = self.entries.get(c.fileId);
          if (!e) return [{ fileId: c.fileId, removed: true }];
          return self.canAccess(email, e.id) ? [{ fileId: c.fileId, removed: false, file: pub(e) }] : [];
        });
        return { changes, newStartPageToken: String(self.changeLog.length) };
      },
    };
  }
}
