import imageCompression from 'browser-image-compression';

export interface ProcessedPhoto {
  original: Blob; // max 2560 px, JPEG q0.85
  thumb: Blob; // max 400 px
}

/** Błąd z komunikatem, który można pokazać użytkownikowi. */
export class ImageError extends Error {}

const HEIC = /\.(heic|heif)$/i;

function isHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || HEIC.test(file.name);
}

export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  if (file.type && !file.type.startsWith('image/') && !isHeic(file)) {
    throw new ImageError('Ten plik nie jest zdjęciem.');
  }
  try {
    // useWebWorker: false — wersja z workerem pobiera skrypt z internetu, a aplikacja ma działać offline.
    const original = await imageCompression(file, {
      maxWidthOrHeight: 2560,
      maxSizeMB: 12,
      initialQuality: 0.85,
      fileType: 'image/jpeg',
      useWebWorker: false,
    });
    const thumb = await imageCompression(original, {
      maxWidthOrHeight: 400,
      maxSizeMB: 1,
      initialQuality: 0.8,
      fileType: 'image/jpeg',
      useWebWorker: false,
    });
    return { original, thumb };
  } catch {
    if (isHeic(file)) {
      throw new ImageError(
        'Ta przeglądarka nie odczytuje zdjęć w formacie HEIC. Na iPhonie wybierz: Ustawienia → Aparat → Formaty → Najbardziej zgodne, albo zrób zdjęcie bezpośrednio z aplikacji.',
      );
    }
    throw new ImageError('Nie udało się odczytać zdjęcia. Spróbuj zrobić je jeszcze raz.');
  }
}
