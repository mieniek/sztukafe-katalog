import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/db';
import { loadPhotoDrafts, updateArtwork, type PhotoDraft } from '../../db/artworks';
import { savePrices } from '../../db/prices';
import type { Artwork, PrivatePrices } from '../../db/types';
import { useToast } from '../../components/Toast';
import { useSyncState } from '../../sync/useSync';
import { ArtworkForm } from './ArtworkForm';
import { valuesFromArtwork, valuesToInput, valuesToPrices } from './formValues';
import ui from '../../styles/ui.module.css';

type Loaded = { artwork: Artwork; prices?: PrivatePrices } | 'missing';

export function EditArtworkPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isAdmin = useSyncState().role === 'admin';
  const [loaded, setLoaded] = useState<Loaded>();
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [saving, setSaving] = useState(false);

  // Wczytujemy raz: zmiany z synchronizacji nie mogą nadpisać tego, co użytkownik właśnie wpisuje.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const artwork = await db.artworks.get(id);
      if (cancelled) return;
      if (!artwork || artwork.deleted) return setLoaded('missing');
      const drafts = await loadPhotoDrafts(artwork);
      const prices = isAdmin ? await db.prices.get(id) : undefined;
      if (cancelled) return;
      setPhotos(drafts);
      setLoaded({ artwork, prices });
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isAdmin]);

  if (!loaded) return <p className={ui.hint}>Wczytuję…</p>;
  if (loaded === 'missing') {
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 className={ui.screenTitle}>Nie znaleziono dzieła</h1>
        <Link to="/katalog" className={ui.btn}>
          Wróć do katalogu
        </Link>
      </section>
    );
  }
  const { artwork, prices } = loaded;

  return (
    <ArtworkForm
      mode="edit"
      title="Edycja dzieła"
      badge={artwork.invNo}
      initial={valuesFromArtwork(artwork, prices)}
      photos={photos}
      onPhotosChange={setPhotos}
      isAdmin={isAdmin}
      submitLabel="Zapisz zmiany"
      saving={saving}
      onCancel={() => navigate(`/dzielo/${artwork.id}`)}
      onSubmit={async (values) => {
        setSaving(true);
        try {
          await updateArtwork(artwork.id, valuesToInput(values), photos);
          if (isAdmin) await savePrices(artwork.id, valuesToPrices(values));
          toast('Zapisano zmiany');
          navigate(`/dzielo/${artwork.id}`, { replace: true });
        } catch {
          toast('Nie udało się zapisać zmian. Spróbuj ponownie.');
          setSaving(false);
        }
      }}
    />
  );
}
