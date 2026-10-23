import regularUrl from '@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url';
import boldUrl from '@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf?url';
import logoUrl from '../../../assets/sztukafe-logo-black.png?url';
import type { PdfAssets } from './common';

let cached: Promise<PdfAssets> | undefined;

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Nie udało się wczytać czcionki do dokumentu.');
  return res.arrayBuffer();
}

/**
 * Czcionki i logo do PDF ładujemy dopiero przy pierwszym dokumencie (to ok. 1,3 MB) i trzymamy w pamięci.
 * Pliki są w pamięci podręcznej aplikacji (Workbox), więc dokumenty powstają także bez internetu.
 */
export function loadPdfAssets(): Promise<PdfAssets> {
  cached ??= Promise.all([fetchBytes(regularUrl), fetchBytes(boldUrl), fetchBytes(logoUrl)])
    .then(([regular, bold, logo]) => ({ regular, bold, logo }))
    .catch((e) => {
      cached = undefined; // pozwala spróbować ponownie
      throw e;
    });
  return cached;
}
