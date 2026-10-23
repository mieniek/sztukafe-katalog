import type { Role } from '../db/types';
import type { DriveApi, DriveUser } from './driveApi';
import { readSettings } from './invNoCounter';
import { SETTINGS_FILE, type DriveFolders } from './remoteFormat';

export interface AppUser {
  email: string;
  role: Role;
}

/** Kim jest zalogowana osoba i co jej wolno. */
export interface AccessInfo {
  email: string;
  displayName?: string;
  role: Role;
  users: AppUser[];
  /** Właściciel folderu na Dysku (konto, które go założyło) — tylko on dodaje i usuwa osoby. */
  isOwner?: boolean;
}

export interface PrivateFolders {
  rootId: string;
  pricesId: string;
  backupsId: string;
}

export const PRIVATE_ROOT_NAME = 'SztuKaFe-Prywatne';
export const PRICES_FOLDER_NAME = 'prices';
export const BACKUPS_FOLDER_NAME = 'backups';
/** Lista osób i ról. Leży w folderze prywatnym, więc pracownik nie może jej ani odczytać, ani zmienić. */
export const USERS_FILE = 'users.json';

interface UsersFile {
  version: number;
  users: AppUser[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (email: string) => email.trim().toLowerCase();

/** Czy `email` jest właścicielem folderu. Edytor może nie móc wylistować uprawnień — wtedy: nie. */
async function isOwnerOf(drive: DriveApi, fileId: string, email: string): Promise<boolean> {
  try {
    const perms = await drive.listPermissions(fileId);
    return perms.some((p) => p.role === 'owner' && p.emailAddress && norm(p.emailAddress) === email);
  } catch {
    return false;
  }
}

/** Folder z cenami i kopiami: leży poza folderem głównym, więc pracownik go nie widzi. */
export async function ensurePrivateFolders(drive: DriveApi): Promise<PrivateFolders> {
  const root = (await drive.findFolder(PRIVATE_ROOT_NAME)) ?? (await drive.createFolder(PRIVATE_ROOT_NAME));
  const sub = async (name: string) =>
    ((await drive.findFolder(name, root.id)) ?? (await drive.createFolder(name, root.id))).id;
  return { rootId: root.id, pricesId: await sub(PRICES_FOLDER_NAME), backupsId: await sub(BACKUPS_FOLDER_NAME) };
}

async function writeUsers(drive: DriveApi, privateRootId: string, users: AppUser[]): Promise<void> {
  const file = await drive.findFile(USERS_FILE, privateRootId);
  const prev = file ? await drive.readJson<UsersFile>(file.id) : undefined;
  const data: UsersFile = { version: (prev?.version ?? 0) + 1, users };
  await drive.writeJson({ name: USERS_FILE, parentId: privateRootId, fileId: file?.id, data });
}

/**
 * Rolę przyznaje Dysk, nie aplikacja: adminem jest ten, kto widzi prywatny folder i figuruje w jego `users.json`.
 * Pracownik tego folderu nie widzi, a `settings.json` (który może edytować) nie decyduje o niczym.
 * Pierwsze uruchomienie (i migracja ze starszej wersji, gdzie lista była w `settings.json`) są możliwe tylko dla
 * właściciela folderu głównego — inaczej pracownik mógłby wyczyścić listę i ogłosić się adminem.
 */
export async function resolveAccess(drive: DriveApi, folders: DriveFolders, me: DriveUser): Promise<AccessInfo> {
  const email = norm(me.email);
  const result = (role: Role, users: AppUser[] = [], isOwner = false): AccessInfo => ({
    email,
    displayName: me.displayName,
    role,
    users,
    isOwner,
  });

  const privateRoot = await drive.findFolder(PRIVATE_ROOT_NAME);
  const usersFile = privateRoot && (await drive.findFile(USERS_FILE, privateRoot.id));
  if (usersFile) {
    const { users } = await drive.readJson<UsersFile>(usersFile.id);
    const mine = users.find((u) => norm(u.email) === email);
    if (mine?.role !== 'admin') return result('pracownik');
    return result('admin', users, await isOwnerOf(drive, folders.rootId, email));
  }

  if (!(await isOwnerOf(drive, folders.rootId, email))) return result('pracownik');

  // Właściciel bez users.json: pierwsze uruchomienie albo migracja listy z settings.json.
  const { file, data } = await readSettings(drive, folders);
  const legacy = (data.users as AppUser[] | undefined) ?? [];
  const users = legacy.some((u) => norm(u.email) === email) ? legacy : [...legacy, { email, role: 'admin' as Role }];
  const priv = await ensurePrivateFolders(drive);
  await writeUsers(drive, priv.rootId, users);
  if (file && legacy.length > 0) {
    const { users: _drop, ...rest } = data;
    await drive.writeJson({
      name: SETTINGS_FILE,
      parentId: folders.configId,
      fileId: file.id,
      data: { ...rest, version: data.version + 1 },
    });
  }
  return result('admin', users, true);
}

/** Odbiera edytorom prawo zmiany uprawnień — raz na urządzenie właściciela. */
export async function restrictSharing(drive: DriveApi, folders: DriveFolders, priv: PrivateFolders): Promise<void> {
  for (const id of [folders.rootId, folders.artworksId, folders.photosId, folders.configId, priv.rootId]) {
    await drive.restrictSharing(id);
  }
}

async function grant(drive: DriveApi, fileId: string, email: string): Promise<void> {
  const perms = await drive.listPermissions(fileId);
  if (perms.some((p) => p.emailAddress && norm(p.emailAddress) === email)) return;
  await drive.createPermission(fileId, email, 'writer');
}

async function revoke(drive: DriveApi, fileId: string, email: string): Promise<void> {
  const perms = await drive.listPermissions(fileId);
  for (const p of perms) {
    if (p.role !== 'owner' && p.emailAddress && norm(p.emailAddress) === email) {
      await drive.deletePermission(fileId, p.id);
    }
  }
}

export interface UserAdminContext {
  drive: DriveApi;
  folders: DriveFolders;
  privateFolders: PrivateFolders;
  me: AccessInfo;
}

async function saveUsers(ctx: UserAdminContext, change: (users: AppUser[]) => AppUser[]): Promise<AppUser[]> {
  const file = await ctx.drive.findFile(USERS_FILE, ctx.privateFolders.rootId);
  const current = file ? (await ctx.drive.readJson<UsersFile>(file.id)).users : [];
  const users = change(current);
  await writeUsers(ctx.drive, ctx.privateFolders.rootId, users);
  return users;
}

function requireOwner(ctx: UserAdminContext) {
  if (ctx.me.role !== 'admin') throw new Error('Tylko admin może zarządzać użytkownikami.');
  if (!ctx.me.isOwner) {
    throw new Error('Osoby dodaje i usuwa tylko właściciel folderu na Dysku Google (konto, które założyło katalog).');
  }
}

/** Dodaje osobę albo zmienia jej rolę oraz dopasowuje uprawnienia na Dysku. */
export async function setUser(ctx: UserAdminContext, emailInput: string, role: Role): Promise<AppUser[]> {
  requireOwner(ctx);
  const email = norm(emailInput);
  if (!EMAIL.test(email)) throw new Error('Wpisz poprawny adres e-mail konta Google.');
  if (email === ctx.me.email && role !== 'admin') {
    const otherAdmins = ctx.me.users.filter((u) => u.role === 'admin' && norm(u.email) !== email);
    if (otherAdmins.length === 0) throw new Error('Musi zostać przynajmniej jeden admin.');
  }
  // Najpierw uprawnienia — jeśli Google odrzuci adres, lista użytkowników się nie zmienia.
  await grant(ctx.drive, ctx.folders.rootId, email);
  if (role === 'admin') await grant(ctx.drive, ctx.privateFolders.rootId, email);
  else await revoke(ctx.drive, ctx.privateFolders.rootId, email);
  return saveUsers(ctx, (users) => {
    const rest = users.filter((u) => norm(u.email) !== email);
    return [...rest, { email, role }];
  });
}

export async function removeUser(ctx: UserAdminContext, emailInput: string): Promise<AppUser[]> {
  requireOwner(ctx);
  const email = norm(emailInput);
  if (email === ctx.me.email) throw new Error('Nie możesz usunąć samego siebie.');
  await revoke(ctx.drive, ctx.privateFolders.rootId, email);
  await revoke(ctx.drive, ctx.folders.rootId, email);
  return saveUsers(ctx, (users) => users.filter((u) => norm(u.email) !== email));
}
