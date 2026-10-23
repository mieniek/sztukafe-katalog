import { findDuplicateInvNos, requestNewInvNo } from '../db/invNoRepair';
import { DriveError, NetworkError } from './driveApi';
import { FakeDrive } from './fakeDrive';
import { reserveInvNo } from './invNoCounter';
import type { ArtworkFile, DriveFolders } from './remoteFormat';
import { advanceClock, device, edit, iso, seed } from './testHelpers';

describe('SyncEngine', () => {
  it('wysyła dzieło ze zdjęciem na Dysk i nadaje finalny numer', async () => {
    const drive = new FakeDrive();
    const a = device(drive, 'a@x.pl');
    const art = await seed(a);

    const summary = await a.engine.syncNow();
    expect(summary.failed).toBe(0);

    const local = (await a.db.artworks.get(art.id))!;
    expect(local.invNo).toBe('SZK-2026-0001');
    expect(local.invNoProvisional).toBe(false);
    expect(await a.db.outbox.count()).toBe(0);

    const names = [...drive.entries.values()].map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining([`${art.id}.json`, 'settings.json', 'artworks', 'photos', 'config', 'backups']));
    expect(names.filter((n) => n.endsWith('.jpg'))).toHaveLength(2); // oryginał + miniatura

    const file = [...drive.entries.values()].find((e) => e.name === `${art.id}.json`)!.content as ArtworkFile;
    expect(file.artwork.invNo).toBe('SZK-2026-0001');
    expect(file.photos).toHaveLength(1);
  });

  it('drugie urządzenie pobiera dzieło z miniaturą, a oryginał dopiero na żądanie', async () => {
    const drive = new FakeDrive();
    const a = device(drive, 'a@x.pl');
    const b = device(drive, 'a@x.pl');
    const art = await seed(a);
    await a.engine.syncNow();

    await b.engine.syncNow();
    const onB = (await b.db.artworks.get(art.id))!;
    expect(onB.title).toBe('Zima');
    const photo = (await b.db.photos.get(onB.photoIds[0]))!;
    expect(photo.thumb).toBeDefined();
    expect(photo.original).toBeUndefined();

    await b.engine.fetchOriginal(photo.id);
    expect((await b.db.photos.get(photo.id))!.original).toBeDefined();
  });

  it('dwa urządzenia dodają dzieła offline — po synchronizacji numery się nie powtarzają', async () => {
    const drive = new FakeDrive();
    const a = device(drive, 'a@x.pl');
    const b = device(drive, 'a@x.pl');
    const onA = await seed(a, { title: 'Dzieło A' });
    const onB = await seed(b, { title: 'Dzieło B' });
    expect(onA.invNo).not.toBe(onB.invNo); // tymczasowe numery są losowe

    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    for (const d of [a, b]) {
      const all = await d.db.artworks.toArray();
      expect(all).toHaveLength(2);
      const numbers = all.map((x) => x.invNo).sort();
      expect(numbers).toEqual(['SZK-2026-0001', 'SZK-2026-0002']);
      expect(all.every((x) => !x.invNoProvisional)).toBe(true);
    }
  });

  it('wykrywa i naprawia powtórzony numer po wyścigu o licznik', async () => {
    const drive = new FakeDrive();
    const a = device(drive, 'a@x.pl');
    const b = device(drive, 'a@x.pl');
    await seed(a, { title: 'A', createdAt: iso(0), updatedAt: iso(0) });
    await seed(b, { title: 'B', createdAt: iso(5), updatedAt: iso(5) });

    // B zdąży odczytać licznik i zapisać go dokładnie wtedy, gdy A kończy swoją rezerwację.
    let settingsWrites = 0; // settings.json zapisuje tylko rezerwacja numeru
    drive.beforeWriteJson = async (name) => {
      if (name !== 'settings.json' || ++settingsWrites < 1) return;
      drive.beforeWriteJson = undefined;
      await b.engine.syncNow();
    };
    await a.engine.syncNow();
    drive.beforeWriteJson = undefined;
    await b.engine.syncNow();
    await a.engine.syncNow();

    const dupes = await findDuplicateInvNos(a.db);
    expect(dupes).toHaveLength(1);
    const later = dupes[0][1];

    await requestNewInvNo(later.id, a.db);
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await findDuplicateInvNos(a.db)).toHaveLength(0);
    expect(await findDuplicateInvNos(b.db)).toHaveLength(0);
  });

  it('konflikt: nowsza edycja wygrywa, przegrana wersja trafia do „Konflikty”', async () => {
    const drive = new FakeDrive();
    const a = device(drive, 'a@x.pl');
    const b = device(drive, 'a@x.pl');
    const art = await seed(a);
    await a.engine.syncNow();
    await b.engine.syncNow();

    // Obie strony edytują to samo dzieło; B później.
    await edit(a, art.id, { title: 'Wersja A' }, iso(10));
    await edit(b, art.id, { title: 'Wersja B' }, iso(20));

    await a.engine.syncNow(); // A wysyła swoją wersję
    const sB = await b.engine.syncNow(); // B widzi cudzą zmianę, ale jego jest nowsza
    expect(sB.conflicts).toBe(1);
    const conflicts = await b.db.conflicts.toArray();
    expect(conflicts[0].losingVersion.title).toBe('Wersja A');
    expect((await b.db.artworks.get(art.id))!.title).toBe('Wersja B');

    await a.engine.syncNow();
    expect((await a.db.artworks.get(art.id))!.title).toBe('Wersja B');
  });

  it('konflikt: gdy na Dysku jest nowsza wersja, przegrywają niewysłane zmiany lokalne', async () => {
    const drive = new FakeDrive();
    const a = device(drive, 'a@x.pl');
    const b = device(drive, 'a@x.pl');
    const art = await seed(a);
    await a.engine.syncNow();
    await b.engine.syncNow();

    await edit(b, art.id, { title: 'Stara edycja B' }, iso(10));
    await edit(a, art.id, { title: 'Nowa edycja A' }, iso(20));
    await a.engine.syncNow();
    await b.engine.syncNow();

    expect((await b.db.artworks.get(art.id))!.title).toBe('Nowa edycja A');
    expect((await b.db.conflicts.toArray())[0].losingVersion.title).toBe('Stara edycja B');
    expect(await b.db.outbox.count()).toBe(0); // przegrana zmiana nie jest już wysyłana
  });

  it('przekazuje usunięcie dzieła na inne urządzenia', async () => {
    const drive = new FakeDrive();
    const a = device(drive, 'a@x.pl');
    const b = device(drive, 'a@x.pl');
    const art = await seed(a);
    await a.engine.syncNow();
    await b.engine.syncNow();

    await edit(a, art.id, { deleted: true }, iso(30));
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect((await b.db.artworks.get(art.id))!.deleted).toBe(true);
  });

  it('bez sieci zachowuje kolejkę i zgłasza brak połączenia', async () => {
    const drive = new FakeDrive();
    const a = device(drive, 'a@x.pl');
    await seed(a);
    drive.offline = true;
    await expect(a.engine.syncNow()).rejects.toBeInstanceOf(NetworkError);
    expect(await a.db.outbox.count()).toBe(2);

    drive.offline = false;
    await a.engine.syncNow();
    expect(await a.db.outbox.count()).toBe(0);
  });

  it('po błędzie ponawia z rosnącym opóźnieniem i nie gubi kolejki', async () => {
    const drive = new FakeDrive();
    let failUploads = true;
    const a = device(drive, 'a@x.pl', (api) => ({
      ...api,
      uploadBlob: (args) =>
        failUploads ? Promise.reject(new DriveError('Chwilowy błąd', 500)) : api.uploadBlob(args),
    }));
    const art = await seed(a);

    const first = await a.engine.syncNow();
    expect(first.failed).toBe(1);
    const photoItem = (await a.db.outbox.toArray()).find((i) => i.entity === 'photo')!;
    expect(photoItem.attempts).toBe(1);
    expect(photoItem.nextAttemptAt).toBeDefined();
    expect(await a.db.outbox.count()).toBe(2); // dzieło czeka na zdjęcie

    // Zaraz po błędzie nie próbujemy ponownie…
    failUploads = false;
    expect((await a.engine.syncNow()).pushed).toBe(0);
    // …ale po upływie czasu oczekiwania — tak.
    advanceClock(60_000);
    await a.engine.syncNow();
    expect(await a.db.outbox.count()).toBe(0);
    expect((await a.db.artworks.get(art.id))!.invNoProvisional).toBe(false);
  });

  it('„Synchronizuj teraz” ignoruje czas oczekiwania', async () => {
    const drive = new FakeDrive();
    let failUploads = true;
    const a = device(drive, 'a@x.pl', (api) => ({
      ...api,
      uploadBlob: (args) =>
        failUploads ? Promise.reject(new DriveError('Chwilowy błąd', 500)) : api.uploadBlob(args),
    }));
    await seed(a);
    await a.engine.syncNow();
    failUploads = false;
    await a.engine.syncNow(true);
    expect(await a.db.outbox.count()).toBe(0);
  });

  it('po usunięciu zdjęcia kasuje pliki na Dysku', async () => {
    const drive = new FakeDrive();
    const a = device(drive, 'a@x.pl');
    const art = await seed(a);
    await a.engine.syncNow();
    const photoId = art.photoIds[0];

    await a.db.photos.update(photoId, { deleted: true });
    await a.db.outbox.put({ id: `photo:${photoId}`, entity: 'photo', entityId: photoId, op: 'delete', queuedAt: iso(40), attempts: 0 });
    await a.engine.syncNow();
    expect([...drive.entries.values()].filter((e) => e.name.endsWith('.jpg'))).toHaveLength(0);
    expect(await a.db.photos.get(photoId)).toBeUndefined();
  });

  it('nie dubluje własnych zmian przy kolejnych przebiegach', async () => {
    const drive = new FakeDrive();
    const a = device(drive, 'a@x.pl');
    await seed(a);
    await a.engine.syncNow();
    const writes = drive.writes.length;
    const again = await a.engine.syncNow();
    expect(again).toEqual({ pushed: 0, pulled: 0, conflicts: 0, failed: 0 });
    expect(drive.writes.length).toBe(writes);
  });
});

describe('reserveInvNo', () => {
  it('numeruje kolejno w obrębie roku', async () => {
    const drive = new FakeDrive();
    const api = drive.as('a@x.pl');
    const root = await api.createFolder('r');
    const config = await api.createFolder('config', root.id);
    const folders = { rootId: root.id, configId: config.id } as DriveFolders;
    expect(await reserveInvNo(api, folders, 2026)).toBe('SZK-2026-0001');
    expect(await reserveInvNo(api, folders, 2026)).toBe('SZK-2026-0002');
    expect(await reserveInvNo(api, folders, 2027)).toBe('SZK-2027-0001');
  });
});
