import { rgb } from 'pdf-lib';
import type { Artwork } from '../../../db/types';
import { formatDimensions, formatPrice } from '../../../lib/format';
import { A4, MM, MUTED, createPdf, drawLogo, drawText, ellipsize, wrapText, type PdfAssets } from './common';

/** Jedna etykieta ścienna 10 × 7 cm. */
export interface LabelSpec {
  artwork: Artwork;
  showPrice: boolean;
}

export const LABEL = { w: 100 * MM, h: 70 * MM };
export const LABELS_PER_SHEET = 8; // 2 kolumny × 4 rzędy na A4
const COLS = 2;
const ROWS = 4;
const PAD = 6 * MM;

/** Arkusz A4 z etykietami 10 × 7 cm (do 8 na arkusz; kolejne trafiają na następne arkusze). */
export async function buildLabelSheetPdf(assets: PdfAssets, labels: LabelSpec[]): Promise<Uint8Array> {
  const ctx = await createPdf(assets, 'Etykiety ścienne');
  const offsetX = (A4.w - COLS * LABEL.w) / 2;
  const offsetY = (A4.h - ROWS * LABEL.h) / 2;
  const sheets = Math.max(1, Math.ceil(labels.length / LABELS_PER_SHEET));

  for (let s = 0; s < sheets; s++) {
    const page = ctx.doc.addPage([A4.w, A4.h]);
    for (let i = 0; i < LABELS_PER_SHEET; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = offsetX + col * LABEL.w;
      const top = A4.h - offsetY - row * LABEL.h;
      const y = top - LABEL.h;
      // Cienka ramka = linia cięcia (też dla pustych miejsc, żeby arkusz można było dokończyć później)
      page.drawRectangle({ x, y, width: LABEL.w, height: LABEL.h, borderColor: rgb(0.8, 0.8, 0.78), borderWidth: 0.4 });
      const spec = labels[s * LABELS_PER_SHEET + i];
      if (!spec) continue;
      drawLabel(ctx, page, spec, x, y);
    }
  }
  return ctx.doc.save();
}

function drawLabel(ctx: Awaited<ReturnType<typeof createPdf>>, page: import('pdf-lib').PDFPage, spec: LabelSpec, x: number, y: number) {
  const { artwork } = spec;
  const innerW = LABEL.w - 2 * PAD;
  const left = x + PAD;
  let cursor = y + LABEL.h - PAD;

  drawText(ctx, page, ellipsize(ctx, artwork.artist, ctx.bold, 12, innerW), { x: left, y: cursor - 11, size: 12, bold: true });
  cursor -= 20;
  for (const line of wrapText(ctx, artwork.title, ctx.regular, 11.5, innerW).slice(0, 2)) {
    drawText(ctx, page, line, { x: left, y: cursor - 10, size: 11.5 });
    cursor -= 14;
  }
  if (artwork.year) {
    drawText(ctx, page, String(artwork.year), { x: left, y: cursor - 20, size: 18, bold: true });
    cursor -= 28;
  }
  const details = [artwork.technique, formatDimensions(artwork.dimensionsCm)].filter(Boolean).join(' · ');
  for (const line of wrapText(ctx, details, ctx.regular, 9, innerW).slice(0, 2)) {
    drawText(ctx, page, line, { x: left, y: cursor - 9, size: 9, color: MUTED });
    cursor -= 12;
  }

  // Stopka: logo (przygaszone) i cena
  drawLogo(ctx, page, left, y + PAD - 2, 34, 0.55);
  if (spec.showPrice) {
    drawText(ctx, page, formatPrice(artwork.salePrice, artwork.currency), {
      x: left,
      y: y + PAD + 4,
      size: 14,
      bold: true,
      align: 'right',
      width: innerW,
    });
  }
}
