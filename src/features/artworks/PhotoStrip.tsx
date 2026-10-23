import { useRef, useState } from 'react';
import { newPhotoDraft, type PhotoDraft } from '../../db/artworks';
import { BlobImage } from '../../components/BlobImage';
import { PhotoInputs, type PhotoInputsHandle } from '../../components/PhotoInputs';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { PHOTO_KIND_LABELS } from '../../lib/labels';
import { MAX_PHOTOS } from './formValues';
import ui from '../../styles/ui.module.css';
import styles from './PhotoStrip.module.css';

interface Props {
  photos: PhotoDraft[];
  onChange: (photos: PhotoDraft[]) => void;
}

/** Pasek zdjęć w formularzu: miniatury z podpisem rodzaju, kafel „+” i akcje po stuknięciu. */
export function PhotoStrip({ photos, onChange }: Props) {
  const inputs = useRef<PhotoInputsHandle>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [addOpen, setAddOpen] = useState(false);
  const current = photos.find((p) => p.id === selected);

  function add() {
    if (photos.length >= MAX_PHOTOS) return toast(`Maksymalnie ${MAX_PHOTOS} zdjęć`);
    setAddOpen(true);
  }

  return (
    <div>
      <PhotoInputs
        ref={inputs}
        onBusyChange={setBusy}
        onError={(m) => toast(m)}
        onPhoto={(blobs) =>
          onChange([...photos, newPhotoDraft(photos.length === 0 ? 'przod' : 'inne', blobs)])
        }
      />
      <ul className={styles.strip} aria-label="Zdjęcia dzieła">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button type="button" className={styles.item} onClick={() => setSelected(p.id)}>
              <BlobImage blob={p.thumb} alt={i === 0 ? 'Zdjęcie główne' : PHOTO_KIND_LABELS[p.kind]} className={styles.thumb} />
              <span className={styles.kind}>{i === 0 ? 'Główne' : PHOTO_KIND_LABELS[p.kind]}</span>
            </button>
          </li>
        ))}
        <li>
          <button type="button" className={styles.add} onClick={add} disabled={busy} aria-label="Dodaj zdjęcie">
            {busy ? '…' : '+'}
          </button>
        </li>
      </ul>

      {addOpen && (
        <Sheet title="Dodaj zdjęcie" onClose={() => setAddOpen(false)}>
          <button
            type="button"
            className={`${ui.btn} ${ui.primary} ${ui.block}`}
            onClick={() => {
              setAddOpen(false);
              inputs.current?.openCamera();
            }}
          >
            Zrób zdjęcie
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.block}`}
            onClick={() => {
              setAddOpen(false);
              inputs.current?.openGallery();
            }}
          >
            Wybierz z galerii
          </button>
        </Sheet>
      )}

      {current && (
        <Sheet title={PHOTO_KIND_LABELS[current.kind]} onClose={() => setSelected(undefined)}>
          {photos[0]?.id !== current.id && (
            <button
              type="button"
              className={`${ui.btn} ${ui.block}`}
              onClick={() => {
                onChange([current, ...photos.filter((p) => p.id !== current.id)]);
                setSelected(undefined);
              }}
            >
              Ustaw jako główne
            </button>
          )}
          <button
            type="button"
            className={`${ui.btn} ${ui.block} ${ui.danger}`}
            onClick={() => {
              onChange(photos.filter((p) => p.id !== current.id));
              setSelected(undefined);
            }}
          >
            Usuń zdjęcie
          </button>
          <button type="button" className={`${ui.btn} ${ui.block}`} onClick={() => setSelected(undefined)}>
            Zamknij
          </button>
        </Sheet>
      )}
    </div>
  );
}
