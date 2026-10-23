import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Segment } from '../../components/Segment';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import type { GeneratedFile } from './documentService';
import { FILE_MIME, shareFile } from './share';
import ui from '../../styles/ui.module.css';
import styles from './PdfSheet.module.css';

interface Variant {
  value: string;
  label: string;
}

interface Props {
  title: string;
  description?: string;
  /** Podgląd dokumentu (np. karty dzieła); dostaje aktualnie wybraną wersję. */
  preview?: (variant: string) => ReactNode;
  /** Warianty dokumentu do wyboru (np. „Dla klienta” / „Wewnętrzna”). */
  variants?: Variant[];
  note?: string;
  generate: (variant: string) => Promise<GeneratedFile>;
  onClose: () => void;
}

type State =
  | { status: 'busy' }
  | { status: 'ready'; pdf: GeneratedFile; url: string }
  | { status: 'error'; message: string };

/**
 * Arkusz „utwórz i udostępnij”: dokument powstaje od razu po otwarciu, a przycisk „Udostępnij…”
 * działa na gotowych bajtach (iOS wymaga, by udostępnianie ruszyło tuż po stuknięciu).
 */
export function PdfSheet({ title, description, preview, variants, note, generate, onClose }: Props) {
  const toast = useToast();
  const [variant, setVariant] = useState(variants?.[0]?.value ?? '');
  const [state, setState] = useState<State>({ status: 'busy' });
  const generateRef = useRef(generate);
  generateRef.current = generate;

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    setState({ status: 'busy' });
    generateRef
      .current(variant)
      .then((pdf) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([pdf.bytes as BlobPart], { type: FILE_MIME[pdf.kind ?? 'pdf'] }));
        setState({ status: 'ready', pdf, url });
      })
      .catch((e) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Nie udało się utworzyć dokumentu.' });
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [variant]);

  async function share() {
    if (state.status !== 'ready') return;
    const result = await shareFile(state.pdf.bytes, state.pdf.fileName, state.pdf.title, state.pdf.kind ?? 'pdf');
    if (result === 'downloaded') toast('Plik zapisany na urządzeniu');
    if (result !== 'cancelled') onClose();
  }

  return (
    <Sheet title={title} onClose={onClose}>
      {description && <p className={styles.description}>{description}</p>}

      {variants && variants.length > 1 && (
        <Segment label="Wersja dokumentu" value={variant} options={variants} onChange={setVariant} />
      )}

      {preview && <div className={styles.preview}>{preview(variant)}</div>}

      {note && <p className={ui.hint}>{note}</p>}
      {state.status === 'error' && (
        <p className={ui.banner} role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && (state.pdf.kind ?? 'pdf') === 'pdf' && (
        <a className={styles.open} href={state.url} target="_blank" rel="noreferrer">
          Otwórz PDF
        </a>
      )}

      <button
        type="button"
        className={`${ui.btn} ${ui.primary} ${ui.block}`}
        disabled={state.status !== 'ready'}
        onClick={share}
      >
        {state.status === 'busy' ? 'Tworzę dokument…' : 'Udostępnij… (WhatsApp, Mail)'}
      </button>
      <button type="button" className={`${ui.btn} ${ui.block}`} onClick={onClose}>
        Zamknij
      </button>
    </Sheet>
  );
}
