import ui from '../styles/ui.module.css';
import { Sheet } from './Sheet';

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Zamiast window.confirm(): arkusz potwierdzenia wbudowany w aplikację. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Anuluj',
  danger,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Sheet title={title} onClose={onCancel}>
      <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>{message}</p>
      <button
        type="button"
        className={`${ui.btn} ${ui.block} ${danger ? ui.dangerSolid : ui.primary}`}
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
      <button type="button" className={`${ui.btn} ${ui.block}`} onClick={onCancel}>
        {cancelLabel}
      </button>
    </Sheet>
  );
}
