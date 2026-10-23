import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createArtwork, newPhotoDraft, type PhotoDraft } from '../../db/artworks';
import { savePrices } from '../../db/prices';
import type { PhotoKind } from '../../db/types';
import { BlobImage } from '../../components/BlobImage';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PhotoInputs, type PhotoInputsHandle } from '../../components/PhotoInputs';
import { useToast } from '../../components/Toast';
import { PHOTO_KIND_LABELS } from '../../lib/labels';
import { useSyncState } from '../../sync/useSync';
import { ArtworkForm } from './ArtworkForm';
import { emptyForm, valuesToInput, valuesToPrices } from './formValues';
import styles from './NewArtworkPage.module.css';

interface Shot {
  kind: PhotoKind;
  title: string;
  hint: string;
  required: boolean;
}

/** Pięć ujęć kreatora (design: wskaźnik 5 kroków). Tylko przód jest wymagany. */
const SHOTS: Shot[] = [
  { kind: 'przod', title: 'Przód', hint: 'wymagane · całe dzieło w kadrze', required: true },
  { kind: 'tyl', title: 'Tył', hint: 'opcjonalne · opisy, pieczątki', required: false },
  { kind: 'sygnatura', title: 'Sygnatura', hint: 'opcjonalne · z bliska', required: false },
  { kind: 'detal', title: 'Detal', hint: 'opcjonalne · faktura, technika', required: false },
  { kind: 'inne', title: 'Inne ujęcie', hint: 'opcjonalne · rama, montaż', required: false },
];

export const formatElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function NewArtworkPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const sync = useSyncState();
  const inputs = useRef<PhotoInputsHandle>(null);
  const started = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const [step, setStep] = useState(0); // 0–4 = ujęcia, 5 = formularz
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = formatElapsed(now - started.current);
  const inForm = step >= SHOTS.length;
  const shot = SHOTS[Math.min(step, SHOTS.length - 1)];

  function cancel() {
    if (photos.length > 0) setConfirmCancel(true);
    else navigate(-1);
  }

  function onPhoto(blobs: { thumb: Blob; original: Blob }) {
    setPhotos((prev) => [...prev, newPhotoDraft(shot.kind, blobs)]);
    setFlash(true);
    setTimeout(() => {
      setFlash(false);
      setStep((s) => s + 1);
    }, 180);
  }

  const cancelDialog = confirmCancel && (
    <ConfirmDialog
      title="Odrzucić nowe dzieło?"
      message="Zrobione zdjęcia i wpisane dane nie zostaną zapisane."
      confirmLabel="Odrzuć"
      cancelLabel="Wróć do dodawania"
      danger
      onCancel={() => setConfirmCancel(false)}
      onConfirm={() => navigate(-1)}
    />
  );

  if (!inForm) {
    return (
      <div className={styles.camera}>
        <PhotoInputs ref={inputs} onPhoto={onPhoto} onBusyChange={setBusy} onError={(m) => toast(m)} />
        <div className={styles.cameraTop}>
          <button type="button" className={styles.pill} onClick={cancel}>
            Anuluj
          </button>
          <div className={styles.steps} role="img" aria-label={`Ujęcie ${step + 1} z ${SHOTS.length}`}>
            {SHOTS.map((s, i) => (
              <span
                key={s.kind}
                className={`${styles.stepBar} ${i === step ? styles.stepNow : ''} ${i < step ? styles.stepDone : ''}`}
              />
            ))}
          </div>
          <span className={styles.timer}>{elapsed}</span>
        </div>

        <div className={styles.shotInfo}>
          <h1 className={styles.shotTitle}>{shot.title}</h1>
          <p className={styles.shotHint}>{shot.hint}</p>
        </div>

        <div className={styles.viewfinder}>
          <div className={styles.frameLines} />
          <p className={styles.viewHint}>{busy ? 'Przetwarzam zdjęcie…' : 'Stuknij spust, aby otworzyć aparat'}</p>
          {flash && <div className={styles.flash} />}
        </div>

        {photos.length > 0 && (
          <ul className={styles.thumbs} aria-label="Zrobione zdjęcia">
            {photos.map((p) => (
              <li key={p.id}>
                <BlobImage blob={p.thumb} alt={PHOTO_KIND_LABELS[p.kind]} className={styles.thumb} />
              </li>
            ))}
          </ul>
        )}

        <button type="button" className={styles.galleryLink} disabled={busy} onClick={() => inputs.current?.openGallery()}>
          Wybierz z galerii
        </button>

        <div className={styles.controls}>
          {shot.required ? (
            <span />
          ) : (
            <button type="button" className={styles.side} onClick={() => setStep((s) => s + 1)}>
              Pomiń
            </button>
          )}
          <button
            type="button"
            className={styles.shutter}
            aria-label={`Zrób zdjęcie: ${shot.title}`}
            disabled={busy}
            onClick={() => inputs.current?.openCamera()}
          >
            <span />
          </button>
          {shot.required ? (
            <span />
          ) : (
            <button type="button" className={`${styles.side} ${styles.sideRight}`} onClick={() => setStep(SHOTS.length)}>
              Do danych ›
            </button>
          )}
        </div>
        {cancelDialog}
      </div>
    );
  }

  return (
    <>
      <ArtworkForm
        mode="new"
        title="Nowe dzieło"
        badge={`${elapsed} · ${photos.length} zdj.`}
        initial={emptyForm()}
        photos={photos}
        onPhotosChange={setPhotos}
        isAdmin={sync.role === 'admin'}
        submitLabel="Zapisz dzieło"
        saving={saving}
        onCancel={cancel}
        onSubmit={async (values) => {
          setSaving(true);
          try {
            const created = await createArtwork(valuesToInput(values), photos);
            if (sync.role === 'admin') await savePrices(created.id, valuesToPrices(values));
            const offline = sync.auth === 'signed-in' && (sync.status === 'offline' || navigator.onLine === false);
            toast(`Zapisano w ${formatElapsed(Date.now() - started.current)}${offline ? ' · wyślę po odzyskaniu sieci' : ''}`);
            navigate(`/dzielo/${created.id}`, { replace: true });
          } catch {
            toast('Nie udało się zapisać dzieła. Spróbuj ponownie.');
            setSaving(false);
          }
        }}
      />
      {cancelDialog}
    </>
  );
}
