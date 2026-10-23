import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { useEurRate } from '../../db/useEurRate';
import { restoreArtwork, setArtworkStatus, softDeleteArtwork } from '../../db/artworks';
import type { Artwork, Photo, Status } from '../../db/types';
import { BlobImage } from '../../components/BlobImage';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Segment } from '../../components/Segment';
import { useToast } from '../../components/Toast';
import { MISSING_LABELS, type MissingField } from '../import/plan';
import { formatDate, formatDimensions, formatNumber, formatPrice, todayIso } from '../../lib/format';
import { BASIS_LABELS, CATEGORY_LABELS, LOCATION_LABELS, PHOTO_KIND_LABELS, STATUS_LABELS } from '../../lib/labels';
import { formatRate } from '../../lib/nbp';
import { syncService } from '../../sync/syncService';
import { useSyncState } from '../../sync/useSync';
import ui from '../../styles/ui.module.css';
import styles from './ArtworkPage.module.css';

// Generatory PDF są duże (pdf-lib, czcionki) — ładujemy je dopiero, gdy ktoś stuknie „PDF” albo „Etykieta”.
const PdfSheet = lazy(() => import('../documents/PdfSheet').then((m) => ({ default: m.PdfSheet })));
const LabelSheet = lazy(() => import('../documents/LabelSheet').then((m) => ({ default: m.LabelSheet })));
const CardPreview = lazy(() => import('../documents/CardPreview').then((m) => ({ default: m.CardPreview })));
const createCardPdf = async (...args: Parameters<typeof import('../documents/documentService').createCardPdf>) =>
  (await import('../documents/documentService')).createCardPdf(...args);

const SHORT_STATUS: Record<Status, string> = {
  dostepne: 'Dostępne',
  w_magazynie: 'Magazyn',
  zarezerwowane: 'Rezerw.',
  sprzedane: 'Sprzedane',
};

function Gallery({ artwork, onBack }: { artwork: Artwork; onBack: () => void }) {
  const photos = useLiveQuery(() => db.photos.bulkGet(artwork.photoIds), [artwork.photoIds.join()]);
  const list = (photos ?? []).filter((p): p is Photo => !!p && !p.deleted);
  const [index, setIndex] = useState(0);
  const [full, setFull] = useState<Photo>();
  const scroller = useRef<HTMLUListElement>(null);

  // Dzieło z innego urządzenia ma lokalnie tylko miniatury — oryginały pobieramy po otwarciu karty.
  const missing = list.filter((p) => !p.original && p.driveFileId).map((p) => p.id).join();
  useEffect(() => {
    for (const id of missing ? missing.split(',') : []) void syncService.fetchOriginal(id);
  }, [missing]);

  return (
    <div className={styles.galleryWrap}>
      {list.length === 0 ? (
        <div className={styles.noPhoto}>Brak zdjęcia</div>
      ) : (
        <ul
          ref={scroller}
          className={styles.gallery}
          aria-label="Zdjęcia dzieła"
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {list.map((p) => (
            <li key={p.id} className={styles.slide}>
              <button type="button" className={styles.slideBtn} onClick={() => setFull(p)} aria-label="Powiększ zdjęcie">
                <BlobImage
                  blob={p.original ?? p.thumb}
                  alt={`${artwork.title} — ${PHOTO_KIND_LABELS[p.kind]}`}
                  className={styles.photo}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={styles.back} onClick={onBack}>
        ‹ Wróć
      </button>
      {list.length > 0 && (
        <span className={styles.counter}>
          {index + 1}/{list.length}
        </span>
      )}
      {list.length > 1 && (
        <div className={styles.dots} aria-hidden="true">
          {list.map((p, i) => (
            <span key={p.id} className={`${styles.dotMark} ${i === index ? styles.dotOn : ''}`} />
          ))}
        </div>
      )}
      {full && (
        <div className={styles.fullscreen} onClick={() => setFull(undefined)} role="dialog" aria-label="Podgląd zdjęcia">
          <BlobImage blob={full.original ?? full.thumb} alt={artwork.title} className={styles.fullImg} />
          <button type="button" className={styles.fullClose} aria-label="Zamknij podgląd">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function StatusSwitcher({ artwork }: { artwork: Artwork }) {
  const toast = useToast();
  const [askDate, setAskDate] = useState(artwork.status === 'zarezerwowane' && !artwork.reservation?.until);
  const [until, setUntil] = useState(artwork.reservation?.until ?? '');
  const [note, setNote] = useState(artwork.reservation?.note ?? '');
  const [error, setError] = useState<string>();

  async function choose(status: Status) {
    if (status === 'zarezerwowane') {
      setAskDate(true);
      return;
    }
    if (status === artwork.status) return;
    setAskDate(false);
    await setArtworkStatus(artwork.id, status);
    toast(`Status: ${STATUS_LABELS[status]}`);
  }

  async function saveReservation() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) {
      setError('Rezerwacja wymaga daty, do kiedy obowiązuje.');
      return;
    }
    setError(undefined);
    await setArtworkStatus(artwork.id, 'zarezerwowane', { until, note: note.trim() || undefined });
    setAskDate(false);
    toast(`Status: ${STATUS_LABELS.zarezerwowane}`);
  }

  const options = (Object.keys(SHORT_STATUS) as Status[]).map((s) => ({
    value: s,
    label: SHORT_STATUS[s],
    dot: `var(--status-${s})`,
  }));

  return (
    <div className={styles.statusBlock}>
      <Segment label="Status dzieła" value={artwork.status} options={options} onChange={choose} />
      {askDate && (
        <div className={`${ui.card} ${styles.reservation}`}>
          <div className={ui.field}>
            <div className={ui.labelRow}>
              <label htmlFor="res-until" className={ui.label}>
                Rezerwacja do
              </label>
              <span className={ui.required}>wymagane</span>
            </div>
            <input
              id="res-until"
              type="date"
              min={todayIso()}
              className={`${ui.input} ${error || !until ? ui.invalid : ''}`}
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
            {error && (
              <p className={ui.error} role="alert">
                {error}
              </p>
            )}
          </div>
          <div className={ui.field}>
            <label htmlFor="res-note" className={ui.label}>
              Dla kogo / uwagi
            </label>
            <input id="res-note" className={ui.input} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className={ui.row}>
            <button type="button" className={ui.btn} onClick={() => setAskDate(false)}>
              Anuluj
            </button>
            <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={saveReservation}>
              Zarezerwuj
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value?: string; accent?: boolean }) {
  if (!value) return null;
  return (
    <div className={styles.fieldRow}>
      <dt>{label}</dt>
      <dd className={accent ? styles.accent : undefined}>{value}</dd>
    </div>
  );
}

export function ArtworkPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isAdmin = useSyncState().role === 'admin';
  const eur = useEurRate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sheet, setSheet] = useState<'pdf' | 'label'>();
  const loaded = useLiveQuery(
    async () => ({ artwork: await db.artworks.get(id), prices: await db.prices.get(id) }),
    [id],
  );

  if (!loaded) return <p className={ui.hint}>Wczytuję…</p>;
  const { artwork, prices } = loaded;
  if (!artwork || artwork.deleted) {
    return (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 className={ui.screenTitle}>Nie znaleziono dzieła</h1>
        <p className={ui.hint}>Mogło zostać usunięte.</p>
        <Link to="/katalog" className={ui.btn}>
          Wróć do katalogu
        </Link>
      </section>
    );
  }

  return (
    <article className={styles.page}>
      <Gallery artwork={artwork} onBack={() => navigate(-1)} />

      <div className={styles.content}>
        <p className={styles.inv}>
          {artwork.invNo}
          {artwork.invNoProvisional && <span className={styles.provisional}>numer tymczasowy · po synchronizacji</span>}
        </p>
        <h1 className={styles.title}>{artwork.title}</h1>
        <p className={styles.artist}>
          {artwork.artist}
          {artwork.year ? `, ${artwork.year}` : ''}
        </p>
        <p className={styles.price}>{formatPrice(artwork.salePrice, artwork.currency)}</p>

        {(artwork.needsCompletion?.length || artwork.photoIds.length === 0) && (
          <div className={styles.todoBanner} role="note">
            <strong>Do uzupełnienia</strong>
            <span>
              {[
                ...(artwork.needsCompletion ?? []).map((k) => MISSING_LABELS[k as MissingField] ?? k),
                ...(artwork.photoIds.length === 0 ? ['zdjęcie'] : []),
              ].join(', ')}
            </span>
            <Link to={`/dzielo/${artwork.id}/edycja`} className={ui.btn}>
              Uzupełnij
            </Link>
          </div>
        )}
        <StatusSwitcher key={artwork.status + (artwork.reservation?.until ?? '')} artwork={artwork} />
        {artwork.status === 'zarezerwowane' && artwork.reservation && (
          <p className={ui.hint}>
            Rezerwacja do {formatDate(artwork.reservation.until)}
            {artwork.reservation.note ? ` — ${artwork.reservation.note}` : ''}
          </p>
        )}

        <div className={styles.actions}>
          <Link to={`/dzielo/${artwork.id}/edycja`} className={`${ui.btn} ${styles.action}`}>
            Edytuj
          </Link>
          <button type="button" className={`${ui.btn} ${styles.action}`} onClick={() => setSheet('pdf')}>
            PDF
          </button>
          <button type="button" className={`${ui.btn} ${styles.action}`} onClick={() => setSheet('label')}>
            Etykieta
          </button>
          <button
            type="button"
            className={`${ui.btn} ${styles.action} ${ui.danger}`}
            onClick={() => setConfirmDelete(true)}
          >
            Usuń
          </button>
        </div>

        <dl className={styles.details}>
          <Row label="Kategoria" value={CATEGORY_LABELS[artwork.category]} />
          <Row label="Technika" value={artwork.technique} />
          <Row label="Materiał / podłoże" value={artwork.material} />
          <Row label="Wymiary" value={formatDimensions(artwork.dimensionsCm)} />
          <Row label="Waga" value={artwork.weightKg ? `${formatNumber(artwork.weightKg)} kg` : undefined} />
          <Row label="Edycja" value={artwork.edition} />
          <Row label="Lokalizacja" value={LOCATION_LABELS[artwork.location]} />
          <Row label="Podstawa" value={BASIS_LABELS[artwork.basis]} />
          {artwork.currency === 'EUR' && eur && (
            <Row
              label="Cena w PLN"
              value={`${formatPrice(Math.round(artwork.salePrice * eur.rate), 'PLN')} (${eur.manual ? 'kurs ręczny' : 'NBP'} ${formatRate(eur.rate)})`}
            />
          )}
          {isAdmin && (
            <>
              <Row
                label="Cena zakupu"
                value={prices?.purchasePrice !== undefined ? formatPrice(prices.purchasePrice, artwork.currency) : undefined}
                accent
              />
              <Row
                label="Cena minimalna"
                value={prices?.minPrice !== undefined ? formatPrice(prices.minPrice, artwork.currency) : undefined}
                accent
              />
            </>
          )}
          <Row label="Opis" value={artwork.description} />
        </dl>

        <p className={styles.footer}>
          Dodał(a) {artwork.createdBy} · {formatDate(artwork.createdAt)}
        </p>
      </div>

      <Suspense fallback={null}>
      {sheet === 'pdf' && (
        <PdfSheet
          title="Karta dzieła (PDF)"
          preview={(v) => <CardPreview artworkId={artwork.id} internal={v === 'internal'} />}
          variants={
            isAdmin
              ? [
                  { value: 'client', label: 'Dla klienta' },
                  { value: 'internal', label: 'Wewnętrzna' },
                ]
              : undefined
          }
          note="Wersja dla klienta nie zawiera cen wewnętrznych."
          generate={(v) => createCardPdf(artwork.id, v === 'internal' ? 'internal' : 'client', isAdmin)}
          onClose={() => setSheet(undefined)}
        />
      )}
      {sheet === 'label' && <LabelSheet artworkId={artwork.id} onClose={() => setSheet(undefined)} />}
      </Suspense>
      {confirmDelete && (
        <ConfirmDialog
          title={`Usunąć „${artwork.title}”?`}
          message="Dzieło zniknie z katalogu na wszystkich urządzeniach. Tuż po usunięciu możesz to cofnąć."
          confirmLabel="Usuń dzieło"
          cancelLabel="Zostaw"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await softDeleteArtwork(artwork.id);
            navigate('/katalog', { replace: true });
            toast('Usunięto dzieło', { action: { label: 'Cofnij', onClick: () => void restoreArtwork(artwork.id) } });
          }}
        />
      )}
    </article>
  );
}
