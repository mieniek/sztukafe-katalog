import { Link } from 'react-router-dom';
import { syncService } from '../sync/syncService';
import { usePendingCount, useSyncState } from '../sync/useSync';
import ui from '../styles/ui.module.css';
import styles from './SyncIndicator.module.css';

/** Pill z informacją o synchronizacji: kropka (zielona = online, bursztynowa = offline) + tekst. */
export function SyncPill() {
  const state = useSyncState();
  const pending = usePendingCount();
  if (state.auth === 'not-configured') return null;

  let text: string;
  let online = true;
  if (state.auth === 'signed-out') {
    text = 'Tylko na tym urządzeniu';
    online = false;
  } else if (state.status === 'syncing') text = 'Synchronizuję…';
  else if (state.status === 'offline') {
    text = pending ? `Offline · ${pending} w kolejce` : 'Offline';
    online = false;
  } else if (state.status === 'error') {
    text = 'Błąd synchronizacji';
    online = false;
  } else if (pending > 0) text = `${pending} do wysłania`;
  else text = 'Zsynchronizowano';

  return (
    <Link to="/ustawienia/synchronizacja" className={ui.pill} aria-live="polite">
      <span
        className={ui.dot}
        style={{ background: online ? 'var(--status-dostepne)' : 'var(--status-zarezerwowane)' }}
        aria-hidden="true"
      />
      {text}
    </Link>
  );
}

/** Baner nad treścią, gdy trzeba zalogować się ponownie. Dane czekają w kolejce i nie giną. */
export function ReloginBanner() {
  const state = useSyncState();
  if (state.auth !== 'needs-login') return null;
  return (
    <div className={styles.banner} role="alert">
      <span>Sesja Google wygasła. Zmiany czekają na wysłanie.</span>
      <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => void syncService.signIn()}>
        Zaloguj ponownie
      </button>
    </div>
  );
}
