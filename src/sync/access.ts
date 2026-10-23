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
}

export interface PrivateFolders {
  rootId: string;
  pricesId: string;
}

export const PRIVATE_ROOT_NAME = 'SztuKaFe-Prywatne';
export const PRICES_FOLDER_NAME = 'prices';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (email: string) => email.trim().toLowerCase();

/** Pierwsza osoba, która się zaloguje (lista użytkowników jest pusta), zostaje adminem. */
export async function resolveAccess(drive: DriveApi, folders: DriveFolders, me: DriveUser): Promise<AccessInfo> {
  const email = norm(me.email);
  const { file, data } = await readSettings(drive, folders);
  let users = (data.users as AppUser[] | undefined) ?? [];
  if (users.length === 0) {
    users = [{ email, role: 'admin' }];
    await drive.writeJson({
      name: SETTINGS_FILE,
      parentId: folders.configId,
      fileId: file?.id,
      data: { ...data, version: data.version + 1, users },
    });
  }
  const mine = users.find((u) => norm(u.email) === email);
  return { email, displayName: me.displayName, role: mine?.role ?? 'pracownik', users };
}

/** Folder z cenami prywatnymi: leży poza folderem głównym, więc pracownik go nie widzi. */
export async function ensurePrivateFolders(drive: DriveApi): Promise<PrivateFolders> {
  const root = (await drive.findFolder(PRIVATE_ROOT_NAME)) ?? (await drive.createFolder(PRIVATE_ROOT_NAME));
  const prices =
    (await drive.findFolder(PRICES_FOLDER_NAME, root.id)) ?? (await drive.createFolder(PRICES_FOLDER_NAME, root.id));
  return { rootId: root.id, pricesId: prices.id };
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
  const { file, data } = await readSettings(ctx.drive, ctx.folders);
  const users = change((data.users as AppUser[] | undefined) ?? []);
  await ctx.drive.writeJson({
    name: SETTINGS_FILE,
    parentId: ctx.folders.configId,
    fileId: file?.id,
    data: { ...data, version: data.version + 1, users },
  });
  return users;
}

function requireAdmin(ctx: UserAdminContext) {
  if (ctx.me.role !== 'admin') throw new Error('Tylko admin może zarządzać użytkownikami.');
}

/** Dodaje osobę albo zmienia jej rolę oraz dopasowuje uprawnienia na Dysku. */
export async function setUser(ctx: UserAdminContext, emailInput: string, role: Role): Promise<AppUser[]> {
  requireAdmin(ctx);
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
  requireAdmin(ctx);
  const email = norm(emailInput);
  if (email === ctx.me.email) throw new Error('Nie możesz usunąć samego siebie.');
  await revoke(ctx.drive, ctx.privateFolders.rootId, email);
  await revoke(ctx.drive, ctx.folders.rootId, email);
  return saveUsers(ctx, (users) => users.filter((u) => norm(u.email) !== email));
}
