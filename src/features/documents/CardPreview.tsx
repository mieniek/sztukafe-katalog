import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { BlobImage } from '../../components/BlobImage';
import { formatDimensions, formatPrice } from '../../lib/format';
import { CATEGORY_LABELS } from '../../lib/labels';
import logoBlack from '../../assets/sztukafe-logo-black.png';
import styles from './CardPreview.module.css';

/**
 * Uproszczony podgląd karty dzieła (A4) w HTML. Własny podgląd zamiast osadzonego PDF-a,
 * bo przeglądarki mobilne (np. Chrome na Androidzie) nie pokazują PDF-ów w ramce.
 */
export function CardPreview({ artworkId, internal }: { artworkId: string; internal: boolean }) {
  const data = useLiveQuery(async () => {
    const artwork = await db.artworks.get(artworkId);
    const photo = artwork ? await db.photos.get(artwork.photoIds[0]) : undefined;
    const prices = await db.prices.get(artworkId);
    return { artwork, photo, prices };
  }, [artworkId]);
  const artwork = data?.artwork;
  if (!artwork) return null;
  const prices = data?.prices;

  return (
    <div className={styles.page} aria-label="Podgląd karty dzieła">
      <div className={styles.head}>
        <img src={logoBlack} alt="" width={26} />
        <span className={styles.inv}>{artwork.invNo}</span>
      </div>
      {internal && <div className={styles.internal}>WERSJA WEWNĘTRZNA</div>}
      <BlobImage blob={data?.photo?.original ?? data?.photo?.thumb} alt="" className={styles.photo} />
      <p className={styles.title}>{artwork.title}</p>
      <div className={styles.line}>
        <span>
          {artwork.artist}
          {artwork.year ? `, ${artwork.year}` : ''}
        </span>
        <strong>{formatPrice(artwork.salePrice, artwork.currency)}</strong>
      </div>
      <dl className={styles.rows}>
        <div>
          <dt>Kategoria</dt>
          <dd>{CATEGORY_LABELS[artwork.category]}</dd>
        </div>
        {artwork.technique && (
          <div>
            <dt>Technika</dt>
            <dd>{artwork.technique}</dd>
          </div>
        )}
        <div>
          <dt>Wymiary</dt>
          <dd>{formatDimensions(artwork.dimensionsCm)}</dd>
        </div>
        {internal && prices?.purchasePrice !== undefined && (
          <div>
            <dt>Cena zakupu</dt>
            <dd>{formatPrice(prices.purchasePrice, artwork.currency)}</dd>
          </div>
        )}
        {internal && prices?.minPrice !== undefined && (
          <div>
            <dt>Cena minimalna</dt>
            <dd>{formatPrice(prices.minPrice, artwork.currency)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
