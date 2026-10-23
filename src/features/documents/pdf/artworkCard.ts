import type { Artwork } from '../../../db/types';
import { formatDate, formatDimensions, formatNumber, formatPrice } from '../../../lib/format';
import { BASIS_LABELS, CATEGORY_LABELS, LOCATION_LABELS } from '../../../lib/labels';
import {
  A4,
  HAIRLINE,
  MUTED,
  createPdf,
  drawHairline,
  drawLogo,
  drawPhoto,
  drawText,
  embedPhoto,
  wrapText,
  type PdfAssets,
} from './common';
import { rgb } from 'pdf-lib';

export type CardVariant =
  | { kind: 'client' }
  /** Wersja wewnętrzna: tylko dla admina, z cenami wewnętrznymi. */
  | { kind: 'internal'; purchasePrice?: number; minPrice?: number };

const MARGIN = 42;

/** Karta dzieła (A4): logo, zdjęcie główne, dane i cena. Wersja „client” nigdy nie zawiera cen wewnętrznych. */
export async function buildArtworkCardPdf(
  assets: PdfAssets,
  artwork: Artwork,
  photo: Uint8Array | ArrayBuffer | undefined,
  variant: CardVariant = { kind: 'client' },
  generatedAt: Date = new Date(),
): Promise<Uint8Array> {
  const ctx = await createPdf(assets, `${artwork.title} — ${artwork.artist}`);
  const page = ctx.doc.addPage([A4.w, A4.h]);
  const innerW = A4.w - 2 * MARGIN;
  let y = A4.h - MARGIN;

  // Nagłówek: logo + numer inwentarzowy
  drawLogo(ctx, page, MARGIN, y - 36, 72);
  drawText(ctx, page, 'KARTA DZIEŁA', { x: MARGIN, y: y - 10, size: 8, color: MUTED, align: 'right', width: innerW });
  drawText(ctx, page, artwork.invNo, { x: MARGIN, y: y - 24, size: 11, bold: true, align: 'right', width: innerW });
  y -= 52;
  drawHairline(page, MARGIN, A4.w - MARGIN, y);
  y -= 14;

  if (variant.kind === 'internal') {
    page.drawRectangle({ x: MARGIN, y: y - 22, width: innerW, height: 22, color: rgb(1, 0.93, 0.8) });
    drawText(ctx, page, 'WERSJA WEWNĘTRZNA — zawiera ceny wewnętrzne, nie udostępniać klientom', {
      x: MARGIN + 8,
      y: y - 15,
      size: 8.5,
      bold: true,
      color: rgb(0.55, 0.3, 0),
    });
    y -= 34;
  }

  // Zdjęcie główne
  const photoH = variant.kind === 'internal' ? 300 : 335;
  const image = await embedPhoto(ctx.doc, photo);
  drawPhoto(ctx, page, image, { x: MARGIN, y: y - photoH, w: innerW, h: photoH });
  y -= photoH + 22;

  // Tytuł, artysta, cena
  for (const line of wrapText(ctx, artwork.title, ctx.bold, 22, innerW).slice(0, 2)) {
    drawText(ctx, page, line, { x: MARGIN, y: y - 16, size: 22, bold: true });
    y -= 27;
  }
  drawText(ctx, page, `${artwork.artist}${artwork.year ? `, ${artwork.year}` : ''}`, { x: MARGIN, y: y - 12, size: 13 });
  drawText(ctx, page, formatPrice(artwork.salePrice, artwork.currency), {
    x: MARGIN,
    y: y - 14,
    size: 18,
    bold: true,
    align: 'right',
    width: innerW,
  });
  y -= 34;
  drawHairline(page, MARGIN, A4.w - MARGIN, y);
  y -= 8;

  // Tabela danych
  const rows: [string, string | undefined][] = [
    ['Kategoria', CATEGORY_LABELS[artwork.category]],
    ['Technika', artwork.technique],
    ['Materiał / podłoże', artwork.material],
    ['Wymiary', formatDimensions(artwork.dimensionsCm)],
    ['Waga', artwork.weightKg ? `${formatNumber(artwork.weightKg)} kg` : undefined],
    ['Edycja', artwork.edition],
    ['Lokalizacja', LOCATION_LABELS[artwork.location]],
  ];
  if (variant.kind === 'internal') {
    rows.push(['Podstawa', BASIS_LABELS[artwork.basis]]);
    rows.push([
      'Cena zakupu',
      variant.purchasePrice !== undefined ? formatPrice(variant.purchasePrice, artwork.currency) : undefined,
    ]);
    rows.push([
      'Cena minimalna',
      variant.minPrice !== undefined ? formatPrice(variant.minPrice, artwork.currency) : undefined,
    ]);
  }
  for (const [label, value] of rows) {
    if (!value) continue;
    drawText(ctx, page, label, { x: MARGIN, y: y - 14, size: 9.5, color: MUTED });
    drawText(ctx, page, value, { x: MARGIN + 130, y: y - 14, size: 10.5 });
    y -= 19;
  }

  // Opis
  if (artwork.description) {
    y -= 8;
    const maxLines = Math.max(2, Math.floor((y - 70) / 13));
    const lines = wrapText(ctx, artwork.description, ctx.regular, 10, innerW);
    const shown = lines.slice(0, maxLines);
    if (lines.length > maxLines) shown[shown.length - 1] = `${shown[shown.length - 1].replace(/…$/, '')}…`;
    for (const line of shown) {
      drawText(ctx, page, line, { x: MARGIN, y: y - 11, size: 10, color: rgb(0.25, 0.24, 0.22) });
      y -= 13;
    }
  }

  // Stopka
  page.drawLine({ start: { x: MARGIN, y: 46 }, end: { x: A4.w - MARGIN, y: 46 }, thickness: 0.5, color: HAIRLINE });
  drawText(ctx, page, 'SztuKaFe · Kraków', { x: MARGIN, y: 30, size: 8.5, color: MUTED });
  drawText(ctx, page, `Wygenerowano ${formatDate(generatedAt.toISOString())}`, {
    x: MARGIN,
    y: 30,
    size: 8.5,
    color: MUTED,
    align: 'right',
    width: innerW,
  });
  return ctx.doc.save();
}
