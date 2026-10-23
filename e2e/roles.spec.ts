import { expect, test } from '@playwright/test';
import { addArtwork, newDevice, signIn, syncNow, visibleText } from './support/app';
import { FakeGoogle } from './support/fakeGoogle';

test.describe('Role: admin i pracownik', () => {
  test('pracownik nie widzi cen zakupu ani minimalnych — w aplikacji ani na Dysku', async ({ browser }, info) => {
    const google = new FakeGoogle();
    const opts = info.project.use;
    const admin = await newDevice(browser, opts, google, 'admin@x.pl');
    const staff = await newDevice(browser, opts, google, 'staff@x.pl');

    // Content-Security-Policy nie może blokować logowania, synchronizacji ani zapisu (nic w konsoli o naruszeniu)
    const violations: string[] = [];
    for (const { page } of [admin, staff]) {
      page.on('console', (m) => /content security policy/i.test(m.text()) && violations.push(m.text()));
    }

    // admin: pierwsza zalogowana osoba, dodaje dzieło z cenami wewnętrznymi
    await signIn(admin.page);
    await addArtwork(admin.page, { title: 'Obraz z cenami', artist: 'Jan Kowalski', price: '9000', purchase: '3000', min: '7000' });
    await expect(admin.page.getByText('Cena zakupu')).toBeVisible();
    await expect(admin.page.getByText('3 000 zł')).toBeVisible();
    await syncNow(admin.page);

    // admin dodaje pracownika w aplikacji (udostępnia mu folder główny, nie prywatny)
    await admin.page.goto('/#/ustawienia/uzytkownicy');
    await admin.page.getByLabel('Adres Google').fill('staff@x.pl');
    await admin.page.getByRole('button', { name: 'Dodaj osobę' }).click();
    await expect(admin.page.getByText('Udostępnić katalog tej osobie?')).toBeVisible();
    await admin.page.getByRole('button', { name: 'Udostępnij', exact: true }).click();
    await expect(admin.page.getByText('Dodano osobę — dostała zaproszenie od Google')).toBeVisible();
    await expect(admin.page.getByText('staff@x.pl')).toBeVisible();

    // pracownik loguje się i synchronizuje
    await signIn(staff.page);
    await syncNow(staff.page);
    await staff.page.goto('/#/katalog');
    await expect(visibleText(staff.page, 'Obraz z cenami')).toBeVisible();

    // karta dzieła: cena sprzedaży jest, ceny wewnętrzne nie
    await visibleText(staff.page, 'Obraz z cenami').click();
    await expect(staff.page.getByText('9 000 zł').first()).toBeVisible();
    await expect(staff.page.getByText('Cena zakupu')).toHaveCount(0);
    await expect(staff.page.getByText('Cena minimalna')).toHaveCount(0);
    await expect(staff.page.getByText('3 000 zł')).toHaveCount(0);

    // formularz edycji i dodawania: brak bloku cen wewnętrznych
    await staff.page.getByRole('link', { name: 'Edytuj' }).click();
    await expect(staff.page.getByText('Ceny wewnętrzne')).toHaveCount(0);
    await expect(staff.page.getByLabel('Cena zakupu')).toHaveCount(0);

    // Ustawienia: bez grupy Administracja
    await staff.page.goto('/#/ustawienia');
    await expect(staff.page.getByText('Administracja')).toHaveCount(0);
    await expect(staff.page.getByText('staff@x.pl · pracownik')).toBeVisible();

    // Eksport pracownika nie zawiera cen wewnętrznych
    await staff.page.goto('/#/dokumenty');
    await expect(staff.page.getByText('Rola pracownik: plik nie zawiera cen zakupu ani minimalnych.')).toBeVisible();

    // Na Dysku: folder z cenami istnieje, ale pracownik nie ma do niego dostępu
    const privateRoot = [...google.drive.entries.values()].find((e) => e.name === 'SztuKaFe-Prywatne')!;
    expect(privateRoot).toBeTruthy();
    const priceFile = [...google.drive.entries.values()].find((e) => 'purchasePrice' in ((e.content as object) ?? {}))!;
    expect(google.drive.canAccess('admin@x.pl', priceFile.id)).toBe(true);
    expect(google.drive.canAccess('staff@x.pl', priceFile.id)).toBe(false);
    expect(await google.drive.as('staff@x.pl').findFolder('SztuKaFe-Prywatne')).toBeUndefined();

    expect(violations).toEqual([]);
    // folder główny ma odebrane edytorom prawo udostępniania (zmienia uprawnienia tylko właściciel)
    const root = [...google.drive.entries.values()].find((e) => e.name === 'SztuKaFe-Katalog')!;
    expect(root.writersCanShare).toBe(false);

    await admin.context.close();
    await staff.context.close();
  });
});
