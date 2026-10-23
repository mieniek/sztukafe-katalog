import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { SHEET_CAPACITY, addLabel, useLabelQueue } from '../../db/labelQueue';
import { Sheet } from '../../components/Sheet';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { formatDimensions, formatPrice } from '../../lib/format';
import { PdfSheet } from './PdfSheet';
import { createLabelsPdf } from './documentService';
import logoBlack from '../../assets/sztukafe-logo-black.png';
import ui from '../../styles/ui.module.css';
import styles from './LabelSheet.module.css';

/** Etykieta ścienna z karty dzieła: podgląd 10 × 7 cm, przełącznik ceny, dodanie do arkusza A4. */
export function LabelSheet({ artworkId, onClose }: { artworkId: string; onClose: () => void }) {
  const toast = useToast();
  const artwork = useLiveQuery(() => db.artworks.get(artworkId), [artworkId]);
  const queue = useLabelQueue();
  const [showPrice, setShowPrice] = useState(true);
  const [single, setSingle] = useState(false);
  if (!artwork) return null;

  const queued = queue.some((q) => q.artworkId === artworkId);
  const details = [artwork.technique, formatDimensions(artwork.dimensionsCm)].filter(Boolean).join(' · ');

  if (single) {
    return (
      <PdfSheet
        title="Etykieta"
        description="Arkusz A4 z tą jedną etykietą (10 × 7 cm). Pozostałe miejsca zostają puste."
        generate={() => createLabelsPdf({ artworkId, showPrice })}
        onClose={onClose}
      />
    );
  }

  return (
    <Sheet title="Etykieta ścienna" onClose={onClose}>
      <div className={styles.label} aria-label="Podgląd etykiety 10 na 7 cm">
        <p className={styles.artist}>{artwork.artist}</p>
        <p className={styles.title}>{artwork.title}</p>
        {artwork.year && <p className={styles.year}>{artwork.year}</p>}
        <p className={styles.details}>{details}</p>
        <div className={styles.footer}>
          <img src={logoBlack} alt="" width={34} className={styles.logo} />
          {showPrice && <span className={styles.price}>{formatPrice(artwork.salePrice, artwork.currency)}</span>}
        </div>
      </div>

      <div className={styles.switchRow}>
        <span id="show-price-label">Pokaż cenę</span>
        <Switch label="Pokaż cenę na etykiecie" checked={showPrice} onChange={setShowPrice} />
      </div>

      <button
        type="button"
        className={`${ui.btn} ${ui.primary} ${ui.block}`}
        onClick={async () => {
          const ok = await addLabel({ artworkId, showPrice });
          if (!ok) return toast(`Arkusz pełny (${SHEET_CAPACITY}/${SHEET_CAPACITY})`);
          const n = queued ? queue.length : queue.length + 1;
          toast(queued ? `Etykieta zaktualizowana · ${n}/${SHEET_CAPACITY} na arkuszu` : `Etykieta dodana · ${n}/${SHEET_CAPACITY} na arkuszu`);
        }}
      >
        {queued ? 'Zaktualizuj na arkuszu A4' : 'Dodaj do arkusza A4'} ({queue.length}/{SHEET_CAPACITY})
      </button>
      <button type="button" className={`${ui.btn} ${ui.block}`} onClick={() => setSingle(true)}>
        Udostępnij tylko tę etykietę
      </button>
      <p className={ui.hint}>Gotowy arkusz znajdziesz w zakładce Dokumenty → Etykiety ścienne.</p>
    </Sheet>
  );
}
