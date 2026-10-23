import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { clearLabels, removeLabel, useLabelQueue } from '../../db/labelQueue';
import { Sheet } from '../../components/Sheet';
import { pluralPl } from '../../lib/plural';
import { describeFilters, filterAndSort, loadStoredFilters } from '../artworks/listFilters';
import { useEurRate } from '../../db/useEurRate';
import { PdfSheet } from './PdfSheet';
import { useSyncState } from '../../sync/useSync';
import {
  availableCount,
  createCatalogCsv,
  createCatalogXlsx,
  createInventoryPdf,
  createLabelsPdf,
  createPriceListPdf,
  createShopifyCsv,
  inventoryCount,
} from './documentService';
import ui from '../../styles/ui.module.css';
import styles from './DocumentsPage.module.css';

type Open = 'cennik' | 'inwentaryzacja' | 'etykiety' | 'xlsx' | 'csv' | 'shopify' | undefined;

function Row({ title, subtitle, format, onClick }: { title: string; subtitle: string; format: string; onClick: () => void }) {
  return (
    <button type="button" className={`${ui.listRow} ${styles.row}`} onClick={onClick}>
      <span className={styles.file} aria-hidden="true">
        <span>{format}</span>
      </span>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{title}</span>
        <span className={styles.rowSub}>{subtitle}</span>
      </span>
      <span className={ui.chev} aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function LabelsSheet({ onClose }: { onClose: () => void }) {
  const queue = useLabelQueue();
  const titles = useLiveQuery(async () => new Map((await db.artworks.toArray()).map((a) => [a.id, a])), []);
  const [creating, setCreating] = useState(false);

  if (creating) {
    return (
      <PdfSheet
        title="Etykiety ścienne"
        description={`Arkusz A4: ${queue.length} ${pluralPl(queue.length, 'etykieta', 'etykiety', 'etykiet')} 10 × 7 cm.`}
        generate={() => createLabelsPdf()}
        onClose={onClose}
      />
    );
  }

  return (
    <Sheet title="Etykiety ścienne" onClose={onClose}>
      {queue.length === 0 ? (
        <p className={ui.hint}>
          Arkusz jest pusty. Etykiety dodajesz z karty dzieła przyciskiem „Etykieta” (na arkusz mieści się 8).
        </p>
      ) : (
        <div className={ui.listCard}>
          {queue.map((q) => (
            <div key={q.artworkId} className={ui.listRow}>
              <span>{titles?.get(q.artworkId)?.title ?? 'Dzieło usunięte'}</span>
              <button
                type="button"
                className={`${ui.btn} ${ui.danger}`}
                style={{ minHeight: 44 }}
                onClick={() => void removeLabel(q.artworkId)}
              >
                Usuń
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`${ui.btn} ${ui.primary} ${ui.block}`}
        disabled={queue.length === 0}
        onClick={() => setCreating(true)}
      >
        Utwórz arkusz
      </button>
      {queue.length > 0 && (
        <button type="button" className={`${ui.btn} ${ui.block}`} onClick={() => void clearLabels()}>
          Wyczyść arkusz
        </button>
      )}
    </Sheet>
  );
}

export function DocumentsPage() {
  const [open, setOpen] = useState<Open>();
  const queue = useLabelQueue();
  const eur = useEurRate();
  const isAdmin = useSyncState().role === 'admin';
  const filters = loadStoredFilters();
  const stats = useLiveQuery(async () => {
    const all = await db.artworks.toArray();
    return {
      listed: filterAndSort(all, filters, eur?.rate).length,
      inventory: await inventoryCount(),
      total: all.filter((a) => !a.deleted).length,
      available: await availableCount(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eur?.rate], { listed: 0, inventory: 0, total: 0, available: 0 });
  const close = () => setOpen(undefined);

  return (
    <div className={styles.page}>
      <h1 className={ui.screenTitle}>Dokumenty</h1>
      <p className={ui.hint}>
        Filtry cennika są takie same jak w katalogu: {describeFilters(filters)}. Eksporty obejmują cały katalog.
      </p>

      <section>
        <h2 className={ui.sectionLabel}>PDF</h2>
        <div className={ui.listCard}>
          <Row
            title="Cennik"
            subtitle={`${stats.listed} ${pluralPl(stats.listed, 'dzieło', 'dzieła', 'dzieł')} · tabela z miniaturami`}
            format="PDF"
            onClick={() => setOpen('cennik')}
          />
          <Row
            title="Lista inwentaryzacyjna"
            subtitle={`${stats.inventory} ${pluralPl(stats.inventory, 'dzieło', 'dzieła', 'dzieł')} · według lokalizacji`}
            format="PDF"
            onClick={() => setOpen('inwentaryzacja')}
          />
          <Row
            title="Etykiety ścienne"
            subtitle={`${queue.length} w arkuszu · 10 × 7 cm`}
            format="PDF"
            onClick={() => setOpen('etykiety')}
          />
        </div>
      </section>

      <section>
        <h2 className={ui.sectionLabel}>Eksport</h2>
        <div className={ui.listCard}>
          <Row
            title="Cały katalog XLSX"
            subtitle={`${stats.total} ${pluralPl(stats.total, 'dzieło', 'dzieła', 'dzieł')} · Excel`}
            format="XLSX"
            onClick={() => setOpen('xlsx')}
          />
          <Row
            title="Cały katalog CSV"
            subtitle={`${stats.total} ${pluralPl(stats.total, 'dzieło', 'dzieła', 'dzieł')} · UTF-8, średnik`}
            format="CSV"
            onClick={() => setOpen('csv')}
          />
          <Row
            title="Sklep Shopify CSV"
            subtitle={`${stats.available} ${pluralPl(stats.available, 'dzieło', 'dzieła', 'dzieł')} · tylko status „Dostępne”`}
            format="CSV"
            onClick={() => setOpen('shopify')}
          />
        </div>
        {!isAdmin && (
          <p className={ui.hint} style={{ marginTop: 8 }}>
            Rola pracownik: plik nie zawiera cen zakupu ani minimalnych.
          </p>
        )}
      </section>

      {open === 'cennik' && (
        <PdfSheet
          title="Cennik"
          description="Cennik wszystkich dzieł z bieżących filtrów katalogu: miniatura, tytuł, artysta, wymiary i cena sprzedaży. Bez cen wewnętrznych."
          generate={() => createPriceListPdf(filters)}
          onClose={close}
        />
      )}
      {open === 'inwentaryzacja' && (
        <PdfSheet
          title="Lista inwentaryzacyjna"
          description="Dzieła bez sprzedanych, pogrupowane według lokalizacji, z polem do odhaczenia przy każdym."
          generate={() => createInventoryPdf()}
          onClose={close}
        />
      )}
      {open === 'etykiety' && <LabelsSheet onClose={close} />}
      {open === 'xlsx' && (
        <PdfSheet
          title="Cały katalog (XLSX)"
          description="Wszystkie pola dzieł w arkuszu Excela. Plik można wczytać z powrotem w Ustawienia → Import."
          note={isAdmin ? 'Plik zawiera ceny zakupu i minimalne — nie udostępniaj go osobom spoza galerii.' : undefined}
          generate={() => createCatalogXlsx(isAdmin)}
          onClose={close}
        />
      )}
      {open === 'csv' && (
        <PdfSheet
          title="Cały katalog (CSV)"
          description="Wszystkie pola dzieł w pliku CSV (UTF-8, średnik jako separator — otwiera się w polskim Excelu)."
          note={isAdmin ? 'Plik zawiera ceny zakupu i minimalne — nie udostępniaj go osobom spoza galerii.' : undefined}
          generate={() => createCatalogCsv(isAdmin)}
          onClose={close}
        />
      )}
      {open === 'shopify' && (
        <PdfSheet
          title="Sklep Shopify (CSV)"
          description="Dzieła ze statusem „Dostępne” w formacie importu produktów Shopify: każde jako szkic produktu w 1 sztuce. Ceny w euro są przeliczone na złote po kursie NBP."
          note="Zdjęć nie ma w pliku — dodasz je w Shopify. W Shopify: Produkty → Importuj."
          generate={() => createShopifyCsv()}
          onClose={close}
        />
      )}
    </div>
  );
}
