import { useBlobUrl } from '../lib/useBlobUrl';

interface Props {
  blob: Blob | undefined;
  alt: string;
  className?: string;
}

export function BlobImage({ blob, alt, className }: Props) {
  const url = useBlobUrl(blob);
  if (!url) return <div className={className} aria-hidden="true" />;
  return <img src={url} alt={alt} className={className} />;
}
