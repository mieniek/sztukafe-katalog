import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

/** Bajty zasobów potrzebnych do złożenia PDF. W aplikacji ładuje je `loadPdfAssets`, w testach podajemy z dysku. */
export interface PdfAssets {
  regular: ArrayBuffer | Uint8Array;
  bold: ArrayBuffer | Uint8Array;
  /** Czarne logo na przezroczystym tle (PNG). */
  logo: ArrayBuffer | Uint8Array;
}

export const MM = 72 / 25.4;
export const A4 = { w: 595.28, h: 841.89 };

/** Kolory dokumentów drukowanych zostają jasne (nie zależą od ciemnego motywu aplikacji). */
export const INK = rgb(0x1a / 255, 0x19 / 255, 0x17 / 255);
export const MUTED = rgb(0.45, 0.44, 0.42);
export const HAIRLINE = rgb(0.85, 0.84, 0.82);
export const PAPER_GREY = rgb(0.94, 0.93, 0.91);

export interface PdfContext {
  doc: PDFDocument;
  regular: PDFFont;
  bold: PDFFont;
  logo: PDFImage;
  /** Tekst bez znaków, których nie ma w czcionce (żeby PDF nigdy się nie wysypał na dziwnym znaku). */
  safe: (text: string, font?: PDFFont) => string;
}

export async function createPdf(assets: PdfAssets, title: string): Promise<PdfContext> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setProducer('SztuKaFe Katalog');
  doc.setCreator('SztuKaFe Katalog');
  const regular = await doc.embedFont(assets.regular, { subset: false });
  const bold = await doc.embedFont(assets.bold, { subset: false });
  const logo = await doc.embedPng(assets.logo);
  const known = new Map<PDFFont, Set<number>>([
    [regular, new Set(regular.getCharacterSet())],
    [bold, new Set(bold.getCharacterSet())],
  ]);
  const safe = (text: string, font: PDFFont = regular) => {
    const set = known.get(font) ?? known.get(regular)!;
    return Array.from(text.replace(/[   ]/g, ' ').replace(/[\r\t]/g, ' '))
      .map((ch) => (ch === '\n' || set.has(ch.codePointAt(0)!) ? ch : '?'))
      .join('');
  };
  return { doc, regular, bold, logo, safe };
}

/** Łamie tekst na linie o szerokości do `maxWidth`; zachowuje własne nowe linie. Zbyt długie słowa tnie. */
export function wrapText(ctx: PdfContext, text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of ctx.safe(text, font).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
        if (line) lines.push(line), (line = '');
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const trial = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) line = trial;
      else {
        if (line) lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Skraca tekst do jednej linii wielokropkiem. */
export function ellipsize(ctx: PdfContext, text: string, font: PDFFont, size: number, maxWidth: number): string {
  let t = ctx.safe(text, font).replace(/\s+/g, ' ');
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export function drawText(
  ctx: PdfContext,
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' | 'center'; width?: number },
): void {
  const font = opts.bold ? ctx.bold : ctx.regular;
  const t = ctx.safe(text, font);
  const w = font.widthOfTextAtSize(t, opts.size);
  let x = opts.x;
  if (opts.align === 'right') x = opts.x + (opts.width ?? 0) - w;
  if (opts.align === 'center') x = opts.x + ((opts.width ?? 0) - w) / 2;
  page.drawText(t, { x, y: opts.y, size: opts.size, font, color: opts.color ?? INK });
}

/** Osadza zdjęcie (JPEG albo PNG). Zwraca undefined, jeśli bajty nie są obrazem. */
export async function embedPhoto(doc: PDFDocument, bytes?: Uint8Array | ArrayBuffer): Promise<PDFImage | undefined> {
  if (!bytes) return undefined;
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    if (u8[0] === 0xff && u8[1] === 0xd8) return await doc.embedJpg(u8);
    if (u8[0] === 0x89 && u8[1] === 0x50) return await doc.embedPng(u8);
  } catch {
    // uszkodzony plik — pokażemy szary prostokąt
  }
  return undefined;
}

/** Rozmiar obrazu wpasowany w ramkę z zachowaniem proporcji. */
export function fit(imgW: number, imgH: number, boxW: number, boxH: number): { w: number; h: number } {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  return { w: imgW * scale, h: imgH * scale };
}

/** Rysuje zdjęcie wyśrodkowane w ramce albo szary prostokąt z napisem „brak zdjęcia”. */
export function drawPhoto(
  ctx: PdfContext,
  page: PDFPage,
  image: PDFImage | undefined,
  box: { x: number; y: number; w: number; h: number },
  cover = false,
): void {
  if (!image) {
    page.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, color: PAPER_GREY });
    const label = 'brak zdjęcia';
    const size = Math.min(9, box.h / 4);
    page.drawText(label, {
      x: box.x + (box.w - ctx.regular.widthOfTextAtSize(label, size)) / 2,
      y: box.y + box.h / 2 - size / 2,
      size,
      font: ctx.regular,
      color: MUTED,
    });
    return;
  }
  const scale = cover ? Math.max(box.w / image.width, box.h / image.height) : Math.min(box.w / image.width, box.h / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, width: w, height: h });
}

export function drawHairline(page: PDFPage, x1: number, x2: number, y: number): void {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color: HAIRLINE });
}

/** Logo (czarne) o zadanej szerokości; proporcje 2:1 z pliku. */
export function drawLogo(ctx: PdfContext, page: PDFPage, x: number, y: number, width: number, opacity = 1): void {
  page.drawImage(ctx.logo, { x, y, width, height: width * (ctx.logo.height / ctx.logo.width), opacity });
}
