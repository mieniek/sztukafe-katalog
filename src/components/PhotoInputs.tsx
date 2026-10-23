import { forwardRef, useImperativeHandle, useRef } from 'react';
import { ImageError, processPhoto, type ProcessedPhoto } from '../lib/images';

export interface PhotoInputsHandle {
  /** Otwiera aparat (iPhone: natywny aparat, tył). */
  openCamera(): void;
  /** Otwiera wybór z galerii. */
  openGallery(): void;
}

interface Props {
  onPhoto: (photo: ProcessedPhoto) => void;
  onBusyChange?: (busy: boolean) => void;
  onError?: (message: string) => void;
}

/** Dwa ukryte pola plików (aparat i galeria) obsługiwane z zewnątrz przez `ref`. */
export const PhotoInputs = forwardRef<PhotoInputsHandle, Props>(function PhotoInputs(
  { onPhoto, onBusyChange, onError },
  ref,
) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    openCamera: () => camera.current?.click(),
    openGallery: () => gallery.current?.click(),
  }));

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // pozwala wybrać to samo zdjęcie ponownie
    if (!file) return;
    onBusyChange?.(true);
    try {
      onPhoto(await processPhoto(file));
    } catch (err) {
      onError?.(err instanceof ImageError ? err.message : 'Nie udało się dodać zdjęcia.');
    } finally {
      onBusyChange?.(false);
    }
  }

  return (
    <>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handle}
        data-testid="photo-camera"
      />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={handle} data-testid="photo-gallery" />
    </>
  );
});
