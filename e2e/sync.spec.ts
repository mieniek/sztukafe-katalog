import { expect, test } from '@playwright/test';
import { addArtwork, newDevice, signIn, syncNow, visibleText } from './support/app';
import { FakeGoogle } from './support/fakeGoogle';

/** Dwa urządzenia tego samego użytkownika, wspólny (atrapowy) Dysk Google. */
test.describe('Synchronizacja z Dyskiem Google (atrapa)', () => {
  test('dzieło dodane offline na jednym urządzeniu pojawia się na drugim z finalnym numerem', async ({ browser }, info) => {
    const google = new FakeGoogle();
    const opts = info.project.use;
    const a = await newDevice(browser, opts, google, 'admin@x.pl');
    const b = await newDevice(browser, opts, google, 'admin@x.pl');

    await signIn(a.page);
    await signIn(b.page);

    // A: bez sieci (strona Google niedostępna) dodaje dzieło z 2 zdjęciami
    google.down = true;
    await addArtwork(a.page, { title: 'Dzieło z iPhone', artist: 'Anna Nowak', photos: 2, price: '2400' });
    await expect(a.page.getByText(/numer tymczasowy/)).toBeVisible();

    // sieć wraca → synchronizacja
    google.down = false;
    await syncNow(a.page);
    await a.page.goto('/#/katalog');
    await expect(visibleText(a.page, /SZK-\d{4}-0001/)).toBeVisible();
    await expect(a.page.getByText(/SZK-\d{4}-T/).filter({ visible: true })).toHaveCount(0);

    // B pobiera: tytuł, miniatura, cena i ten sam numer
    await syncNow(b.page);
    await b.page.goto('/#/katalog');
    await expect(visibleText(b.page, 'Dzieło z iPhone')).toBeVisible();
    await expect(b.page.getByText(/SZK-\d{4}-0001/)).toBeVisible();
    await expect(visibleText(b.page, '2 400 zł')).toBeVisible();

    // zdjęcia i dane są też na Dysku (plik dzieła + oryginały i miniatury)
    const names = [...google.drive.entries.values()].map((e) => e.name);
    expect(names.filter((n) => n.endsWith('.jpg')).length).toBe(4);
    expect(names.some((n) => n.endsWith('.json') && n !== 'settings.json')).toBe(true);

    await a.context.close();
    await b.context.close();
  });

  test('„Wyloguj i usuń dane” czyści urządzenie, a po ponownym zalogowaniu dane wracają z Dysku', async ({ browser }, info) => {
    const google = new FakeGoogle();
    const a = await newDevice(browser, info.project.use, google, 'admin@x.pl');
    await signIn(a.page);
    await addArtwork(a.page, { title: 'Do wyczyszczenia', artist: 'Anna Nowak', price: '1800' });
    await syncNow(a.page);

    await a.page.getByRole('button', { name: 'Wyloguj i usuń dane z tego urządzenia' }).click();
    await a.page.getByRole('button', { name: 'Wyloguj i usuń', exact: true }).click();
    await expect(a.page.getByRole('button', { name: 'Zaloguj przez Google' })).toBeVisible();

    // w bazie lokalnej nie zostaje nic poza ustawieniami blokady
    const left = await a.page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((ok, fail) => {
        const r = indexedDB.open('sztukafe-katalog');
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fail(r.error);
      });
      const count = (store: string) =>
        new Promise<number>((ok) => {
          const r = db.transaction(store).objectStore(store).count();
          r.onsuccess = () => ok(r.result);
        });
      const out: Record<string, number> = {};
      for (const s of ['artworks', 'photos', 'outbox', 'prices', 'remoteArtworks', 'meta']) out[s] = await count(s);
      db.close();
      return out;
    });
    expect(left).toEqual({ artworks: 0, photos: 0, outbox: 0, prices: 0, remoteArtworks: 0, meta: 0 });

    await a.page.goto('/#/katalog');
    await expect(a.page.getByText('Do wyczyszczenia')).toHaveCount(0);

    // dane są nadal na Dysku i wracają po zalogowaniu
    await signIn(a.page);
    await a.page.goto('/#/katalog');
    await expect(visibleText(a.page, 'Do wyczyszczenia')).toBeVisible();
    await a.context.close();
  });

  test('ta sama edycja na dwóch urządzeniach: wygrywa nowsza, przegrana trafia do „Konflikty”', async ({ browser }, info) => {
    const google = new FakeGoogle();
    const opts = info.project.use;
    const a = await newDevice(browser, opts, google, 'admin@x.pl');
    const b = await newDevice(browser, opts, google, 'admin@x.pl');
    await signIn(a.page);
    await signIn(b.page);

    await addArtwork(a.page, { title: 'Wspólne dzieło', artist: 'Jan Kowalski' });
    const url = a.page.url();
    await syncNow(a.page);
    await syncNow(b.page);

    // obie strony zmieniają tytuł, nie widząc swoich zmian (B później)
    google.down = true;
    for (const [device, title] of [[a, 'Wersja A'], [b, 'Wersja B']] as const) {
      await device.page.goto(url.replace(/^https?:\/\/[^/]+/, '') );
      await device.page.getByRole('link', { name: 'Edytuj' }).click();
      await device.page.getByLabel('Tytuł').fill(title);
      await device.page.getByRole('button', { name: 'Zapisz zmiany' }).click();
      await expect(device.page.getByRole('heading', { name: title })).toBeVisible();
      await device.page.waitForTimeout(1100); // wyraźnie różne znaczniki czasu
    }
    google.down = false;

    await syncNow(a.page); // A wysyła swoją (starszą) wersję
    await syncNow(b.page); // B widzi konflikt; jego wersja jest nowsza
    await b.page.goto('/#/ustawienia/konflikty');
    await expect(b.page.getByText('Wersja A')).toBeVisible();
    await expect(b.page.getByRole('button', { name: 'Przywróć tę wersję' })).toBeVisible();

    await syncNow(a.page);
    await a.page.goto('/#/katalog');
    await expect(visibleText(a.page, 'Wersja B')).toBeVisible();

    await a.context.close();
    await b.context.close();
  });

  test('po wygaśnięciu sesji pokazuje „Zaloguj ponownie” i nie gubi zmian', async ({ browser }, info) => {
    const google = new FakeGoogle();
    const a = await newDevice(browser, info.project.use, google, 'admin@x.pl');
    await signIn(a.page);

    // Dysk odrzuca token (401): aplikacja próbuje odnowić po cichu, a gdy się nie da — pokazuje baner
    await a.context.route('https://www.googleapis.com/**', (route) => route.fulfill({ status: 401, body: '{}' }));
    await a.context.route('https://accounts.google.com/gsi/client', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'window.google={accounts:{oauth2:{initTokenClient(c){return{requestAccessToken(){setTimeout(()=>c.callback({error:"interaction_required"}),10)}}},revoke(){}}}};',
      }),
    );
    await addArtwork(a.page, { title: 'Zmiana bez sesji', artist: 'Anna' });
    await a.page.reload();
    await a.page.waitForTimeout(1500);
    await expect(a.page.getByText('Sesja Google wygasła. Zmiany czekają na wysłanie.')).toBeVisible({ timeout: 20_000 });
    await expect(a.page.getByRole('button', { name: 'Zaloguj ponownie' })).toBeVisible();

    // dane zostały lokalnie
    await a.page.goto('/#/katalog');
    await expect(visibleText(a.page, 'Zmiana bez sesji')).toBeVisible();
    await a.context.close();
  });
});
