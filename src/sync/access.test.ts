import { restoreFromBackup } from '../db/backupRestore';
import { KEEP_BACKUPS } from './backups';
import { FakeDrive } from './fakeDrive';
import { PRIVATE_ROOT_NAME } from './access';
import type { RemoteSettings } from './remoteFormat';
import { device, edit, iso, seed, type Device } from './testHelpers';

const ADMIN = 'admin@x.pl';
const STAFF = 'staff@x.pl';

async function putPrices(d: Device, artworkId: string, purchasePrice: number, minPrice: number, at = iso(50)) {
  await d.db.prices.put({ id: artworkId, purchasePrice, minPrice, updatedAt: at });
  await d.db.outbox.put({ id: `prices:${artworkId}`, entity: 'prices', entityId: artworkId, op: 'upsert', queuedAt: at, attempts: 0 });
}

const settingsOf = (drive: FakeDrive) =>
  [...drive.entries.values()].find((e) => e.name === 'settings.json')!.content as RemoteSettings;

describe('role i uprawnienia', () => {
  it('pierwsza zalogowana osoba zostaje adminem i dostaje folder z cenami', async () => {
    const drive = new FakeDrive();
    const admin = device(drive, ADMIN);
    await admin.engine.syncNow();

    expect(admin.engine.getAccess()?.role).toBe('admin');
    expect(settingsOf(drive).users).toEqual([{ email: ADMIN, role: 'admin' }]);
    const names = [...drive.entries.values()].map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining([PRIVATE_ROOT_NAME, 'prices']));
  });

  it('pracownik nie widzi folderu z cenami ani w aplikacji, ani na Dysku', async () => {
    const drive = new FakeDrive();
    const admin = device(drive, ADMIN);
    const staff = device(drive, STAFF);
    const art = await seed(admin);
    await admin.engine.syncNow();
    await putPrices(admin, art.id, 400, 800);
    await admin.engine.setUserRole(STAFF, 'pracownik');
    await admin.engine.syncNow();

    await staff.engine.syncNow();
    expect(staff.engine.getAccess()?.role).toBe('pracownik');
    // dzieło dostał…
    expect((await staff.db.artworks.get(art.id))?.title).toBe('Zima');
    // …ale cen nie ma na urządzeniu…
    expect(await staff.db.prices.count()).toBe(0);
    // …i Dysk w ogóle nie pokazuje mu folderu z cenami ani plików w nim.
    const staffDrive = drive.as(STAFF);
    expect(await staffDrive.findFolder(PRIVATE_ROOT_NAME)).toBeUndefined();
    const priceFile = [...drive.entries.values()].find((e) => e.name === `${art.id}.json` && e.content && 'purchasePrice' in (e.content as object))!;
    expect(drive.canAccess(STAFF, priceFile.id)).toBe(false);
    await expect(staffDrive.readJson(priceFile.id)).rejects.toThrow();
    // główny folder jest mu udostępniony
    expect(drive.canAccess(STAFF, [...drive.entries.values()].find((e) => e.name === 'SztuKaFe-Katalog')!.id)).toBe(true);
  });

  it('cena zakupu i minimalna trafiają na drugie urządzenie admina', async () => {
    const drive = new FakeDrive();
    const a1 = device(drive, ADMIN);
    const a2 = device(drive, ADMIN);
    const art = await seed(a1);
    await a1.engine.syncNow();
    await putPrices(a1, art.id, 400, 800);
    await a1.engine.syncNow();

    await a2.engine.syncNow();
    expect(await a2.db.prices.get(art.id)).toMatchObject({ purchasePrice: 400, minPrice: 800 });

    // późniejsza zmiana też dochodzi (zmiana ceny na a2 → a1)
    await putPrices(a2, art.id, 450, 900, iso(80));
    await a2.engine.syncNow();
    await a1.engine.syncNow();
    expect(await a1.db.prices.get(art.id)).toMatchObject({ purchasePrice: 450, minPrice: 900 });
  });

  it('awans na admina daje dostęp do cen, a odebranie roli usuwa je z urządzenia', async () => {
    const drive = new FakeDrive();
    const admin = device(drive, ADMIN);
    const staff = device(drive, STAFF);
    const art = await seed(admin);
    await admin.engine.syncNow();
    await putPrices(admin, art.id, 400, 800);
    await admin.engine.setUserRole(STAFF, 'pracownik');
    await admin.engine.syncNow();
    await staff.engine.syncNow();
    expect(await staff.db.prices.count()).toBe(0);

    await admin.engine.setUserRole(STAFF, 'admin');
    await staff.engine.syncNow();
    expect(staff.engine.getAccess()?.role).toBe('admin');
    expect(await staff.db.prices.get(art.id)).toMatchObject({ purchasePrice: 400 });

    await admin.engine.setUserRole(STAFF, 'pracownik');
    await staff.engine.syncNow();
    expect(await staff.db.prices.count()).toBe(0);
    expect(await drive.as(STAFF).findFolder(PRIVATE_ROOT_NAME)).toBeUndefined();
  });

  it('pracownik nie może zarządzać użytkownikami ani robić kopii', async () => {
    const drive = new FakeDrive();
    const admin = device(drive, ADMIN);
    const staff = device(drive, STAFF);
    await admin.engine.syncNow();
    await admin.engine.setUserRole(STAFF, 'pracownik');
    await staff.engine.syncNow();

    await expect(staff.engine.setUserRole('ktos@x.pl', 'admin')).rejects.toThrow(/admin/);
    await expect(staff.engine.createBackup()).rejects.toThrow(/admin/);
  });

  it('nie pozwala usunąć siebie ani ostatniego admina i sprawdza adres e-mail', async () => {
    const drive = new FakeDrive();
    const admin = device(drive, ADMIN);
    await admin.engine.syncNow();
    await expect(admin.engine.removeUser(ADMIN)).rejects.toThrow(/siebie/);
    await expect(admin.engine.setUserRole(ADMIN, 'pracownik')).rejects.toThrow(/admin/);
    await expect(admin.engine.setUserRole('to-nie-email', 'pracownik')).rejects.toThrow(/e-mail/);
  });

  it('usunięcie użytkownika odbiera mu dostęp do katalogu', async () => {
    const drive = new FakeDrive();
    const admin = device(drive, ADMIN);
    const staff = device(drive, STAFF);
    await seed(admin);
    await admin.engine.syncNow();
    await admin.engine.setUserRole(STAFF, 'pracownik');
    await staff.engine.syncNow();
    expect(await staff.db.artworks.count()).toBe(1);

    await admin.engine.removeUser(STAFF);
    expect(await drive.as(STAFF).findFolder('SztuKaFe-Katalog')).toBeUndefined();
    expect(settingsOf(drive).users).toEqual([{ email: ADMIN, role: 'admin' }]);
  });
});

describe('kopie zapasowe', () => {
  it('zapisuje kopię z datą w nazwie, bez cen prywatnych, i trzyma ostatnie 30', async () => {
    const drive = new FakeDrive();
    const admin = device(drive, ADMIN);
    const art = await seed(admin);
    await admin.engine.syncNow();
    await putPrices(admin, art.id, 400, 800);
    await admin.engine.syncNow();

    const info = await admin.engine.createBackup();
    expect(info.name).toMatch(/^\d{4}-\d{2}-\d{2}\.json$/);
    const backup = await admin.engine.readBackup(info.fileId);
    expect(backup.artworks).toHaveLength(1);
    expect(JSON.stringify(backup)).not.toContain('purchasePrice');

    // ta sama doba = nadpisanie, nie druga kopia
    await admin.engine.createBackup();
    expect(await admin.engine.listBackups()).toHaveLength(1);

    // 35 starszych kopii → zostaje 30 najnowszych
    const folder = [...drive.entries.values()].find((e) => e.name === 'backups')!;
    const api = drive.as(ADMIN);
    for (let i = 1; i <= 35; i++) {
      const day = new Date(Date.UTC(2020, 0, i)).toISOString().slice(0, 10);
      await api.writeJson({ name: `${day}.json`, parentId: folder.id, data: { day } });
    }
    await admin.engine.createBackup();
    const list = await admin.engine.listBackups();
    expect(list).toHaveLength(KEEP_BACKUPS);
    expect(list[0].name).toBe(info.name); // najnowsza zostaje
  });

  it('przywraca dzieła z kopii bez kasowania nowszych', async () => {
    const drive = new FakeDrive();
    const admin = device(drive, ADMIN);
    const old = await seed(admin, { title: 'Stare dzieło' });
    await admin.engine.syncNow();
    const info = await admin.engine.createBackup();

    // po kopii: edycja starego, usunięcie go i dodanie nowego
    await edit(admin, old.id, { title: 'Zmieniony tytuł' }, iso(10));
    const fresh = await seed(admin, { title: 'Nowe dzieło', createdAt: iso(20), updatedAt: iso(20) });
    await edit(admin, old.id, { deleted: true }, iso(30));

    const backup = await admin.engine.readBackup(info.fileId);
    const changed = await restoreFromBackup(backup, admin.db);
    expect(changed).toBe(1);

    const restored = (await admin.db.artworks.get(old.id))!;
    expect(restored.title).toBe('Stare dzieło');
    expect(restored.deleted).toBeFalsy();
    expect(await admin.db.artworks.get(fresh.id)).toBeDefined(); // nowsze zostaje
    expect((await admin.db.outbox.get(`artwork:${old.id}`))?.op).toBe('upsert'); // pójdzie na Dysk

    // ponowne przywrócenie nic już nie zmienia
    expect(await restoreFromBackup(backup, admin.db)).toBe(0);
  });
});
