import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useBlobUrl } from '../lib/useBlobUrl';
import styles from './ArtworkThumb.module.css';

/** Odcień 0–359 zależny od id — każdy placeholder wygląda trochę inaczej. */
export function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

interface Props {
  artworkId: string;
  photoId?: string;
  className?: string;
}

/** Miniatura dzieła; bez zdjęcia pokazuje wzór w paski (jak w designie). */
export function ArtworkThumb({ artworkId, photoId, className }: Props) {
  const photo = useLiveQuery(() => (photoId ? db.photos.get(photoId) : undefined), [photoId]);
  const url = useBlobUrl(photo?.thumb);
  if (url) return <img src={url} alt="" className={`${styles.img} ${className ?? ''}`} />;
  const hue = hueFor(artworkId);
  return (
    <div
      className={`${styles.placeholder} ${className ?? ''}`}
      style={{
        background: `repeating-linear-gradient(135deg, oklch(.33 .03 ${hue}) 0 7px, oklch(.3 .035 ${hue}) 7px 14px)`,
      }}
      aria-hidden="true"
    />
  );
}
