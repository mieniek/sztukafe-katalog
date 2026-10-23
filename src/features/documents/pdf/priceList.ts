import type { Artwork } from '../../../db/types';
import { formatDate, formatDimensions, formatPrice } from '../../../lib/format';
import {
  A4,
  MUTED,
  createPdf,
  drawHairline,
  drawLogo,
  drawPhoto,
  drawText,
  ellipsize,
  embedPhoto,
  type PdfAssets,
} from './common';

export interface PriceListItem {
  artwork: Artwork;
  /** Miniatura (JPEG). */
  thumb?: Uint8Array | ArrayBuffer;
}

const MARGIN = 40;
const ROW_H = 58;
const THUMB = { w: 38, h: 46 };
const TOP = A4.h - MARGIN;

/**
 * Cennik (A4): tabela z miniaturą, nr inw., tytułem, artystą, wymiarami i ceną sprzedaży.
 * Nie zawiera żadnych cen wewnętrznych. `filterLabel` opisuje użyte filtry (jak w katalogu).
 */
export async function buildPriceListPdf(
  assets: PdfAssets,
  items: PriceListItem[],
  filterLabel: string,
  generatedAt: Date = new Date(),
): Promise<Uint8Array> {
  const ctx = await createPdf(assets, 'Cennik');
  const innerW = A4.w - 2 * MARGIN;
  const cols = {
    thumb: MARGIN,
    main: MARGIN + THUMB.w + 12,
    inv: MARGIN + 300,
    price: MARGIN,
  };
  const mainW = cols.inv - cols.main - 8;

  const perFirst = Math.floor((TOP - 110 - 40) / ROW_H);
  const perNext = Math.floor((TOP - 60 - 40) / ROW_H);
  const pageCount = items.length <= perFirst ? 1 : 1 + Math.ceil((items.length - perFirst) / perNext);

  let index = 0;
  for (let p = 0; p < pageCount; p++) {
    const page = ctx.doc.addPage([A4.w, A4.h]);
    let y = TOP;
    drawLogo(ctx, page, MARGIN, y - 30, 56);
    if (p === 0) {
      drawText(ctx, page, 'CENNIK', { x: MARGIN, y: y - 12, size: 9, color: MUTED, align: 'right', width: innerW });
      drawText(ctx, page, formatDate(generatedAt.toISOString()), {
        x: MARGIN,
        y: y - 26,
        size: 11,
        bold: true,
        align: 'right',
        width: innerW,
      });
      y -= 52;
      drawText(ctx, page, 'Cennik dzieł', { x: MARGIN, y: y - 16, size: 20, bold: true });
      drawText(ctx, page, ellipsize(ctx, `${filterLabel} · ${items.length} poz.`, ctx.regular, 9.5, innerW), {
        x: MARGIN,
        y: y - 32,
        size: 9.5,
        color: MUTED,
      });
      y -= 48;
    } else {
      drawText(ctx, page, 'Cennik dzieł (ciąg dalszy)', { x: MARGIN, y: y - 12, size: 9, color: MUTED, align: 'right', width: innerW });
      y -= 40;
    }
    drawHairline(page, MARGIN, A4.w - MARGIN, y);

    const capacity = p === 0 ? perFirst : perNext;
    for (let r = 0; r < capacity && index < items.length; r++, index++) {
      const { artwork, thumb } = items[index];
      const top = y - r * ROW_H;
      const image = await embedPhoto(ctx.doc, thumb);
      drawPhoto(ctx, page, image, { x: cols.thumb, y: top - ROW_H + 6, w: THUMB.w, h: THUMB.h });

      drawText(ctx, page, ellipsize(ctx, artwork.title, ctx.bold, 11.5, mainW), {
        x: cols.main,
        y: top - 20,
        size: 11.5,
        bold: true,
      });
      drawText(ctx, page, ellipsize(ctx, `${artwork.artist}${artwork.year ? `, ${artwork.year}` : ''}`, ctx.regular, 10, mainW), {
        x: cols.main,
        y: top - 34,
        size: 10,
      });
      const details = [artwork.technique, formatDimensions(artwork.dimensionsCm)].filter(Boolean).join(' · ');
      drawText(ctx, page, ellipsize(ctx, details, ctx.regular, 8.5, mainW), {
        x: cols.main,
        y: top - 46,
        size: 8.5,
        color: MUTED,
      });
      drawText(ctx, page, artwork.invNo, { x: cols.inv, y: top - 20, size: 8.5, color: MUTED });
      drawText(ctx, page, formatPrice(artwork.salePrice, artwork.currency), {
        x: cols.price,
        y: top - 24,
        size: 12,
        bold: true,
        align: 'right',
        width: innerW,
      });
      if (artwork.status === 'zarezerwowane') {
        drawText(ctx, page, 'zarezerwowane', { x: cols.price, y: top - 38, size: 8, color: MUTED, align: 'right', width: innerW });
      }
      drawHairline(page, MARGIN, A4.w - MARGIN, top - ROW_H);
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
  if (items.length === 0) {
    const page = ctx.doc.getPage(0);
    drawText(ctx, page, 'Brak dzieł spełniających wybrane filtry.', { x: MARGIN, y: TOP - 160, size: 11, color: MUTED });
  }
  return ctx.doc.save();
}
