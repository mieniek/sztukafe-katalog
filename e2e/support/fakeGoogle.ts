import type { BrowserContext, Route } from '@playwright/test';
import { FakeDrive } from '../../src/sync/fakeDrive';
import { DriveError } from '../../src/sync/driveApi';

/**
 * Atrapa Google dla testów e2e: skrypt logowania (Google Identity Services) i HTTP-owe API Dysku.
 * Prawdziwa aplikacja i prawdziwy `GoogleDriveClient` rozmawiają z atrapą jak z Google,
 * a dane trzyma ten sam `FakeDrive`, który sprawdzają testy synchronizacji w Vitest.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type,x-upload-content-type,x-upload-content-length',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': 'Location',
};

const GIS_STUB = `
window.google = { accounts: { oauth2: {
  initTokenClient(cfg) {
    return {
      callback: cfg.callback,
      requestAccessToken() {
        const email = localStorage.getItem('__e2e_email') || 'admin@x.pl';
        setTimeout(() => cfg.callback({ access_token: 'token-' + email, expires_in: 3600 }), 10);
      },
    };
  },
  revoke() {},
} } };
`;

export class FakeGoogle {
  readonly drive = new FakeDrive();
  /** Gdy true, każde zapytanie do Dysku kończy się brakiem sieci (symulacja offline po stronie Google). */
  down = false;
  private uploads = new Map<string, { name: string; parentId: string; mime: string }>();
  private seq = 0;

  /** Podpina atrapę do kontekstu przeglądarki; `email` to konto „zalogowane” na tym urządzeniu. */
  async attach(context: BrowserContext, email: string): Promise<void> {
    await context.addInitScript((e) => localStorage.setItem('__e2e_email', e), email);
    await context.route('https://accounts.google.com/gsi/client', (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body: GIS_STUB }),
    );
    await context.route('https://www.googleapis.com/**', (route) => this.handle(route));
  }

  private json(route: Route, body: unknown, status = 200) {
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }

  private async handle(route: Route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (this.down) return route.abort('internetdisconnected');

    const url = new URL(req.url());
    const auth = req.headers()['authorization'] ?? '';
    const email = auth.replace('Bearer token-', '') || 'admin@x.pl';
    const api = this.drive.as(email);
    const path = url.pathname;
    const q = url.searchParams;
    const unquote = (s: string) => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');

    try {
      if (path === '/drive/v3/about') {
        const u = await api.getUser();
        return this.json(route, { user: { emailAddress: u.email, displayName: u.displayName } });
      }

      if (path === '/drive/v3/files' && req.method() === 'GET') {
        const query = q.get('q') ?? '';
        let m = /^name = '(.+)' and mimeType = '[^']+' and trashed = false(?: and '(.+)' in parents)?$/.exec(query);
        if (m) {
          const f = await api.findFolder(unquote(m[1]), m[2] ? unquote(m[2]) : undefined);
          return this.json(route, { files: f ? [f] : [] });
        }
        m = /^name = '(.+)' and '(.+)' in parents and trashed = false$/.exec(query);
        if (m) {
          const f = await api.findFile(unquote(m[1]), unquote(m[2]));
          return this.json(route, { files: f ? [f] : [] });
        }
        m = /^'(.+)' in parents and trashed = false$/.exec(query);
        if (m) return this.json(route, { files: await api.listFiles(unquote(m[1])) });
        return this.json(route, { error: { message: `Nieobsługiwane zapytanie: ${query}` } }, 400);
      }

      if (path === '/drive/v3/files' && req.method() === 'POST') {
        const body = req.postDataJSON() as { name: string; parents?: string[] };
        return this.json(route, await api.createFolder(body.name, body.parents?.[0]));
      }

      if (path === '/upload/drive/v3/files' && q.get('uploadType') === 'multipart') {
        const { meta, data } = parseMultipart(req.headers()['content-type'] ?? '', req.postData() ?? '');
        return this.json(route, await api.writeJson({ name: meta.name, parentId: meta.parents?.[0], data }));
      }

      const patch = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(path);
      if (patch && req.method() === 'PATCH') {
        const { meta, data } = parseMultipart(req.headers()['content-type'] ?? '', req.postData() ?? '');
        return this.json(route, await api.writeJson({ name: meta.name, parentId: '', data, fileId: patch[1] }));
      }

      if (path === '/upload/drive/v3/files' && q.get('uploadType') === 'resumable') {
        const body = req.postDataJSON() as { name: string; parents: string[] };
        const id = `upload${++this.seq}`;
        this.uploads.set(id, { name: body.name, parentId: body.parents[0], mime: req.headers()['x-upload-content-type'] ?? '' });
        return route.fulfill({
          status: 200,
          headers: { ...CORS, Location: `https://www.googleapis.com/upload/resumable/${id}` },
          body: '{}',
        });
      }

      const put = /^\/upload\/resumable\/(.+)$/.exec(path);
      if (put && req.method() === 'PUT') {
        const info = this.uploads.get(put[1]);
        if (!info) return this.json(route, { error: { message: 'Nieznane przesyłanie' } }, 404);
        const bytes = req.postDataBuffer() ?? Buffer.alloc(0);
        const blob = new Blob([new Uint8Array(bytes)], { type: info.mime });
        return this.json(route, await api.uploadBlob({ name: info.name, parentId: info.parentId, blob }));
      }

      const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(path);
      if (one && req.method() === 'GET' && q.get('alt') === 'media') {
        try {
          const blob = await api.downloadBlob(one[1]);
          return route.fulfill({ status: 200, headers: CORS, body: Buffer.from(await blob.arrayBuffer()) });
        } catch (e) {
          if (!(e instanceof DriveError) || e.status !== 404) throw e;
          return this.json(route, await api.readJson(one[1]));
        }
      }
      if (one && req.method() === 'PATCH') {
        const body = req.postDataJSON() as { writersCanShare?: boolean };
        if (body.writersCanShare === false) await api.restrictSharing(one[1]);
        return this.json(route, { id: one[1] });
      }
      if (one && req.method() === 'DELETE') {
        await api.deleteFile(one[1]);
        return route.fulfill({ status: 204, headers: CORS });
      }

      if (path === '/drive/v3/changes/startPageToken') return this.json(route, { startPageToken: await api.getStartPageToken() });
      if (path === '/drive/v3/changes') return this.json(route, await api.listChanges(q.get('pageToken') ?? '0'));

      const perms = /^\/drive\/v3\/files\/([^/]+)\/permissions(?:\/([^/]+))?$/.exec(path);
      if (perms) {
        if (req.method() === 'GET') return this.json(route, { permissions: await api.listPermissions(perms[1]) });
        if (req.method() === 'POST') {
          const body = req.postDataJSON() as { emailAddress: string; role: 'writer' | 'reader' };
          await api.createPermission(perms[1], body.emailAddress, body.role);
          return this.json(route, {});
        }
        if (req.method() === 'DELETE') {
          await api.deletePermission(perms[1], perms[2]);
          return route.fulfill({ status: 204, headers: CORS });
        }
      }

      return this.json(route, { error: { message: `Nieobsługiwany adres: ${req.method()} ${path}` } }, 404);
    } catch (e) {
      if (e instanceof DriveError) return this.json(route, { error: { message: e.message } }, e.status);
      throw e;
    }
  }
}

/** Rozbiera ciało `multipart/related` używane przez klienta Dysku: metadane (JSON) + zawartość (JSON). */
function parseMultipart(contentType: string, body: string) {
  const boundary = /boundary=(.+)$/.exec(contentType)?.[1];
  if (!boundary) throw new Error('Brak granicy multipart');
  const parts = body
    .split(`--${boundary}`)
    .map((p) => p.trim())
    .filter((p) => p && p !== '--');
  const json = (part: string) => JSON.parse(part.slice(part.indexOf('\r\n\r\n') + 4).trim());
  return { meta: json(parts[0]) as { name: string; parents?: string[] }, data: json(parts[1]) as unknown };
}
