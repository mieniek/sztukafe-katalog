import { db } from './db';
import {
  createArtwork,
  loadPhotoDrafts,
  newPhotoDraft,
  setArtworkStatus,
  softDeleteArtwork,
  updateArtwork,
  type ArtworkInput,
} from './artworks';

const input = (): ArtworkInput => ({
  title: 'Zima',
  artist: 'Jan Kowalski',
  category: 'malarstwo',
  dimensionsCm: { w: 60, h: 80 },
  basis: 'wlasnosc',
  status: 'dostepne',
  location: 'sala_wystawowa',
  salePrice: 1500,
  currency: 'PLN',
});

const blobs = () => ({ thumb: new Blob(['t']), original: new Blob(['o']) });

beforeEach(async () => {
  await Promise.all([db.artworks.clear(), db.photos.clear(), db.outbox.clear()]);
});

describe('repozytorium dzieł', () => {
  it('zapisuje dzieło ze zdjęciami i dokłada je do kolejki wysyłki', async () => {
    const photos = [newPhotoDraft('przod', blobs()), newPhotoDraft('tyl', blobs())];
    const created = await createArtwork(input(), photos);

    expect(created.invNoProvisional).toBe(true);
    expect(created.photoIds).toEqual(photos.map((p) => p.id));
    expect(await db.artworks.count()).toBe(1);
    expect(await db.photos.count()).toBe(2);
    expect(await db.outbox.count()).toBe(3);
  });

  it('nadaje różne numery kolejnym dziełom', async () => {
    const a = await createArtwork(input(), [newPhotoDraft('przod', blobs())]);
    const b = await createArtwork(input(), [newPhotoDraft('przod', blobs())]);
    expect(a.invNo).not.toBe(b.invNo);
  });

  it('zmienia status i wymaga daty rezerwacji', async () => {
    const a = await createArtwork(input(), [newPhotoDraft('przod', blobs())]);
    await expect(setArtworkStatus(a.id, 'zarezerwowane')).rejects.toThrow();

    await setArtworkStatus(a.id, 'zarezerwowane', { until: '2026-11-30', note: 'Pani Ewa' });
    expect((await db.artworks.get(a.id))?.reservation?.until).toBe('2026-11-30');

    await setArtworkStatus(a.id, 'sprzedane');
    const sold = await db.artworks.get(a.id);
    expect(sold?.status).toBe('sprzedane');
    expect(sold?.reservation).toBeUndefined();
  });

  it('przy edycji dodaje i usuwa zdjęcia (usunięte zostają jako znacznik)', async () => {
    const first = newPhotoDraft('przod', blobs());
    const second = newPhotoDraft('tyl', blobs());
    const a = await createArtwork(input(), [first, second]);

    const drafts = await loadPhotoDrafts(a);
    const added = newPhotoDraft('detal', blobs());
    await updateArtwork(a.id, { ...input(), title: 'Zima II' }, [drafts[0], added]);

    const after = await db.artworks.get(a.id);
    expect(after?.title).toBe('Zima II');
    expect(after?.photoIds).toEqual([first.id, added.id]);
    expect((await db.photos.get(second.id))?.deleted).toBe(true);
    expect((await db.outbox.get(`photo:${second.id}`))?.op).toBe('delete');
  });

  it('usuwa miękko: rekord zostaje, kolejka dostaje operację usunięcia', async () => {
    const a = await createArtwork(input(), [newPhotoDraft('przod', blobs())]);
    await softDeleteArtwork(a.id);
    expect((await db.artworks.get(a.id))?.deleted).toBe(true);
    expect((await db.outbox.get(`artwork:${a.id}`))?.op).toBe('delete');
  });
});
