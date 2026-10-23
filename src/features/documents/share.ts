export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

/** Nazwa pliku bez polskich znaków i znaków specjalnych (bezpieczna w WhatsApp, Mailu i systemie plików). */
export function safeFileName(name: string): string {
  return (
    name
      .replace(/ł/g, 'l')
      .replace(/Ł/g, 'L')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'dokument'
  );
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type FileKind = 'pdf' | 'csv' | 'xlsx';

export const FILE_MIME: Record<FileKind, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * Udostępnia plik przez systemowe okno (WhatsApp, Mail, „Zapisz w Plikach”…); gdy przeglądarka tego nie umie — pobiera go.
 * Musi być wywołane bezpośrednio z kliknięcia, z gotowymi już bajtami (inaczej iOS odrzuci udostępnianie).
 */
export async function shareFile(
  bytes: Uint8Array,
  fileName: string,
  title: string,
  kind: FileKind = 'pdf',
): Promise<ShareResult> {
  const base = safeFileName(fileName.toLowerCase().endsWith(`.${kind}`) ? fileName.slice(0, -(kind.length + 1)) : fileName);
  const file = new File([bytes as BlobPart], `${base}.${kind}`, { type: FILE_MIME[kind] });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      // inny błąd (np. brak zgody) — pobieramy plik
    }
  }
  download(file);
  return 'downloaded';
}

export const sharePdf = (bytes: Uint8Array, fileName: string, title: string) => shareFile(bytes, fileName, title, 'pdf');
