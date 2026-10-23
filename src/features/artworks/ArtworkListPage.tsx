import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { useEurRate } from '../../db/useEurRate';
import type { Artwork, Status } from '../../db/types';
import { ArtworkThumb } from '../../components/ArtworkThumb';
import { Sheet } from '../../components/Sheet';
import { StatusDot } from '../../components/StatusDot';
import { formatPrice } from '../../lib/format';
import { formatRate } from '../../lib/nbp';
import { pluralPl } from '../../lib/plural';
import { STATUS_LABELS, entries } from '../../lib/labels';
import {
  filterAndSort,
  loadStoredFilters,
  needsWork,
  storeFilters,
  type ListFilters,
  type SortKey,
} from './listFilters';
import ui from '../../styles/ui.module.css';
import styles from './ArtworkListPage.module.css';

/** Tryby sortowania przełączane stuknięciem (jak w designie): data → numer → cena. */
const SORT_CYCLE: { key: SortKey; label: string }[] = [
  { key: 'added_desc', label: 'Data dodania' },
  { key: 'inv_asc', label: 'Nr inw.' },
  { key: 'price_desc', label: 'Cena' },
];

function Row({ a }: { a: Artwork }) {
  return (
    <li>
      <Link to={`/dzielo/${a.id}`} className={styles.row}>
        <ArtworkThumb artworkId={a.id} photoId={a.photoIds[0]} className={styles.thumb} />
        <span className={styles.info}>
          <span className={styles.inv}>{a.invNo}</span>
          <span className={styles.name}>{a.title}</span>
          <span className={styles.artist}>{a.artist}</span>
          {needsWork(a) && <span className={styles.todo}>do uzupełnienia</span>}
        </span>
        <span className={styles.side}>
          <span className={styles.price}>{formatPrice(a.salePrice, a.currency)}</span>
          <StatusDot status={a.status} label />
        </span>
      </Link>
    </li>
  );
}

function Tile({ a }: { a: Artwork }) {
  return (
    <li>
      <Link to={`/dzielo/${a.id}`} className={styles.gridTile}>
        <span className={styles.frame}>
          <ArtworkThumb artworkId={a.id} photoId={a.photoIds[0]} className={styles.gridImg} />
          <span className={styles.badge}>
            <StatusDot status={a.status} label />
          </span>
          {needsWork(a) && <span className={`${styles.badge} ${styles.badgeTodo}`}>do uzupełnienia</span>}
        </span>
        <span className={styles.name}>{a.title}</span>
        <span className={styles.artist}>{formatPrice(a.salePrice, a.currency)}</span>
      </Link>
    </li>
  );
}

export function ArtworkListPage() {
  const [filters, setFilters] = useState<ListFilters>(loadStoredFilters);
  const [priceSheet, setPriceSheet] = useState(false);
  const [draft, setDraft] = useState({ from: '', to: '' });
  const all = useLiveQuery(() => db.artworks.toArray());
  const eur = useEurRate();
  const shown = useMemo(() => filterAndSort(all ?? [], filters, eur?.rate), [all, filters, eur?.rate]);
  const total = (all ?? []).filter((a) => !a.deleted).length;

  useEffect(() => {
    storeFilters(filters);
  }, [filters]);

  const set = <K extends keyof ListFilters>(key: K, value: ListFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const sortIndex = Math.max(0, SORT_CYCLE.findIndex((s) => s.key === filters.sort));
  const sort = SORT_CYCLE[sortIndex];
  const hasPrice = !!(filters.priceFrom || filters.priceTo);

  return (
    <section className={styles.page}>
      <div className={styles.head}>
        <h1 className={ui.screenTitle}>Katalog</h1>
        <button
          type="button"
          className={ui.pill}
          onClick={() => set('sort', SORT_CYCLE[(sortIndex + 1) % SORT_CYCLE.length].key)}
          aria-label={`Sortowanie: ${sort.label}. Stuknij, aby zmienić.`}
        >
          ↕ {sort.label}
        </button>
      </div>

      <input
        type="search"
        className={`${ui.input} ${styles.search}`}
        placeholder="Szukaj: tytuł, artysta"
        aria-label="Szukaj: tytuł, artysta"
        value={filters.query}
        onChange={(e) => set('query', e.target.value)}
      />

      <div className={ui.chips} role="group" aria-label="Filtry">
        <button
          type="button"
          className={`${ui.chip} ${filters.status === '' ? ui.chipOn : ''}`}
          onClick={() => set('status', '')}
        >
          Wszystkie
        </button>
        {entries(STATUS_LABELS).map(([s, label]) => (
          <button
            key={s}
            type="button"
            className={`${ui.chip} ${filters.status === s ? ui.chipOn : ''}`}
            onClick={() => set('status', s as Status)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={`${ui.chip} ${filters.todo ? ui.chipOn : ''}`}
          aria-pressed={filters.todo}
          onClick={() => set('todo', !filters.todo)}
        >
          Do uzupełnienia
        </button>
        <button
          type="button"
          className={`${ui.chip} ${hasPrice ? ui.chipOn : ''}`}
          onClick={() => {
            setDraft({ from: filters.priceFrom, to: filters.priceTo });
            setPriceSheet(true);
          }}
        >
          Cena{hasPrice ? ' ✓' : ''}
        </button>
      </div>

      {all === undefined ? (
        <p className={ui.hint}>Wczytuję…</p>
      ) : total === 0 ? (
        <div className={ui.card}>
          <p>Katalog jest jeszcze pusty.</p>
          <Link to="/nowe" className={`${ui.btn} ${ui.primary}`} style={{ marginTop: 12 }}>
            Dodaj pierwsze dzieło
          </Link>
        </div>
      ) : shown.length === 0 ? (
        <p className={styles.empty}>Nic nie znaleziono. Zmień wyszukiwanie lub filtr.</p>
      ) : (
        <>
          <p className={ui.hint} aria-live="polite">
            {shown.length} {pluralPl(shown.length, 'dzieło', 'dzieła', 'dzieł')} · {sort.label.toLowerCase()}
          </p>
          <ul className={styles.list}>
            {shown.map((a) => (
              <Row key={a.id} a={a} />
            ))}
          </ul>
          <ul className={styles.grid}>
            {shown.map((a) => (
              <Tile key={a.id} a={a} />
            ))}
          </ul>
        </>
      )}

      {priceSheet && (
        <Sheet title="Cena sprzedaży" onClose={() => setPriceSheet(false)}>
          <div className={ui.row}>
            <div className={ui.field}>
              <label htmlFor="flt-from" className={ui.label}>
                Od
              </label>
              <input
                id="flt-from"
                className={ui.input}
                inputMode="decimal"
                value={draft.from}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
              />
            </div>
            <div className={ui.field}>
              <label htmlFor="flt-to" className={ui.label}>
                Do
              </label>
              <input
                id="flt-to"
                className={ui.input}
                inputMode="decimal"
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
              />
            </div>
          </div>
          <p className={ui.hint}>Kwoty w złotych. Dzieła w EUR są przeliczane po kursie NBP{eur ? ` (${formatRate(eur.rate)})` : ' — kursu jeszcze nie pobrano, więc porównujemy kwotę w EUR'}.</p>
          <button
            type="button"
            className={`${ui.btn} ${ui.primary} ${ui.block}`}
            onClick={() => {
              setFilters((f) => ({ ...f, priceFrom: draft.from, priceTo: draft.to }));
              setPriceSheet(false);
            }}
          >
            Zastosuj
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.block}`}
            onClick={() => {
              setFilters((f) => ({ ...f, priceFrom: '', priceTo: '' }));
              setPriceSheet(false);
            }}
          >
            Wyczyść
          </button>
        </Sheet>
      )}
    </section>
  );
}
