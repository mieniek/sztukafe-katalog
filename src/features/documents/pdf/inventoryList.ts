import type { Artwork, Location } from '../../../db/types';
import { formatDate, formatDimensions } from '../../../lib/format';
import { LOCATION_LABELS } from '../../../lib/labels';
import { A4, MUTED, createPdf, drawHairline, drawLogo, drawText, ellipsize, type PdfAssets } from './common';

const MARGIN = 40;
const ROW_H = 26;
const TOP = A4.h - MARGIN;
const BOX = 11;

/** Dzieła do inwentaryzacji: bez sprzedanych i usuniętych, pogrupowane według lokalizacji. */
export function inventoryGroups(artworks: Artwork[]): { location: Location; items: Artwork[] }[] {
  const active = artworks.filter((a) => !a.deleted && a.status !== 'sprzedane');
  return (Object.keys(LOCATION_LABELS) as Location[])
    .map((location) => ({
      location,
      items: active.filter((a) => a.location === location).sort((a, b) => a.invNo.localeCompare(b.invNo)),
    }))
    .filter((g) => g.items.length > 0);
}

type Line = { kind: 'group'; text: string } | { kind: 'item'; artwork: Artwork };

/** Lista inwentaryzacyjna (A4) z polem do odhaczenia przy każdym dziele. */
export async function buildInventoryListPdf(
  assets: PdfAssets,
  artworks: Artwork[],
  generatedAt: Date = new Date(),
): Promise<Uint8Array> {
  const ctx = await createPdf(assets, 'Lista inwentaryzacyjna');
  const groups = inventoryGroups(artworks);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const innerW = A4.w - 2 * MARGIN;

  const lines: Line[] = groups.flatMap((g): Line[] => [
    { kind: 'group', text: `${LOCATION_LABELS[g.location]} — ${g.items.length}` },
    ...g.items.map((artwork): Line => ({ kind: 'item', artwork })),
  ]);

  const firstCap = Math.floor((TOP - 110 - 40) / ROW_H);
  const nextCap = Math.floor((TOP - 60 - 40) / ROW_H);
  const pageCount = lines.length <= firstCap ? 1 : 1 + Math.ceil((lines.length - firstCap) / nextCap);

  let i = 0;
  for (let p = 0; p < pageCount; p++) {
    const page = ctx.doc.addPage([A4.w, A4.h]);
    let y = TOP;
    drawLogo(ctx, page, MARGIN, y - 30, 56);
    drawText(ctx, page, 'LISTA INWENTARYZACYJNA', { x: MARGIN, y: y - 12, size: 9, color: MUTED, align: 'right', width: innerW });
    drawText(ctx, page, formatDate(generatedAt.toISOString()), {
      x: MARGIN,
      y: y - 26,
      size: 11,
      bold: true,
      align: 'right',
      width: innerW,
    });
    if (p === 0) {
      y -= 52;
      drawText(ctx, page, 'Inwentaryzacja', { x: MARGIN, y: y - 16, size: 20, bold: true });
      drawText(ctx, page, `${total} dzieł do sprawdzenia · odhacz każde, które jest na miejscu`, {
        x: MARGIN,
        y: y - 32,
        size: 9.5,
        color: MUTED,
      });
      y -= 48;
    } else {
      y -= 40;
    }
    drawHairline(page, MARGIN, A4.w - MARGIN, y);

    const cap = p === 0 ? firstCap : nextCap;
    for (let r = 0; r < cap && i < lines.length; r++, i++) {
      const line = lines[i];
      const top = y - r * ROW_H;
      if (line.kind === 'group') {
        drawText(ctx, page, line.text.toUpperCase(), { x: MARGIN, y: top - 18, size: 9, bold: true, color: MUTED });
        continue;
      }
      const a = line.artwork;
      page.drawRectangle({ x: MARGIN, y: top - 19, width: BOX, height: BOX, borderColor: MUTED, borderWidth: 0.9 });
      drawText(ctx, page, a.invNo, { x: MARGIN + 22, y: top - 17, size: 8.5, color: MUTED });
      drawText(ctx, page, ellipsize(ctx, `${a.title} — ${a.artist}`, ctx.regular, 10, 290), {
        x: MARGIN + 104,
        y: top - 17,
        size: 10,
      });
      drawText(ctx, page, formatDimensions(a.dimensionsCm), {
        x: MARGIN,
        y: top - 17,
        size: 8.5,
        color: MUTED,
        align: 'right',
        width: innerW,
      });
      drawHairline(page, MARGIN + 22, A4.w - MARGIN, top - ROW_H + 2);
    }
    drawText(ctx, page, `SztuKaFe · Kraków    strona ${p + 1} z ${pageCount}`, {
      x: MARGIN,
      y: 24,
      size: 8,
      color: MUTED,
      align: 'center',
      width: innerW,
    });
  }
  if (total === 0) {
    drawText(ctx, ctx.doc.getPage(0), 'Brak dzieł do inwentaryzacji.', { x: MARGIN, y: TOP - 160, size: 11, color: MUTED });
  }
  return ctx.doc.save();
}
