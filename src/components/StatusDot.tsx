import type { Status } from '../db/types';
import { STATUS_LABELS } from '../lib/labels';
import styles from './StatusDot.module.css';

/** Kropka w kolorze statusu; z `label` także nazwa statusu. */
export function StatusDot({ status, label = false }: { status: Status; label?: boolean }) {
  return (
    <span className={styles.wrap}>
      <span className={styles.dot} style={{ background: `var(--status-${status})` }} aria-hidden="true" />
      {label ? STATUS_LABELS[status] : <span className="visually-hidden">{STATUS_LABELS[status]}</span>}
    </span>
  );
}
