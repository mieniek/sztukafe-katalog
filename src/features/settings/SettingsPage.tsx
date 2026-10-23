import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { isStale } from '../../db/rates';
import { useEurRate } from '../../db/useEurRate';
import { formatDate } from '../../lib/format';
import { formatRate } from '../../lib/nbp';
import { syncService } from '../../sync/syncService';
import { usePendingCount, useSyncState } from '../../sync/useSync';
import { useLockState } from '../lock/LockGate';
import ui from '../../styles/ui.module.css';
import styles from './SettingsPage.module.css';

export const formatDateTime = (iso?: string): string => {
  if (!iso) return 'jeszcze nie było';
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? 'Dziś' : formatDate(iso)}, ${time}`;
};

function Item({ to, label, value, accent }: { to: string; label: string; value?: string; accent?: boolean }) {
  return (
    <Link to={to} className={ui.listRow}>
      <span>{label}</span>
      <span className={`${ui.listValue} ${accent ? ui.listValueAccent : ''}`}>
        {value}
        <span className={ui.chev} aria-hidden="true">
          ›
        </span>
      </span>
    </Link>
  );
}

export function SettingsPage() {
  const sync = useSyncState();
  const lock = useLockState();
  const pending = usePendingCount();
  const conflicts = useLiveQuery(() => db.conflicts.count(), [], 0);
  const eur = useEurRate();
  const signedIn = sync.auth === 'signed-in' || sync.auth === 'needs-login';
  const isAdmin = sync.role === 'admin';

  const syncValue =
    sync.auth === 'not-configured'
      ? 'Nie skonfigurowano'
      : !signedIn
        ? 'Wyłączona'
        : sync.status === 'offline' || pending > 0
          ? `${sync.status === 'offline' ? 'Offline · ' : ''}${pending} w kolejce`
          : 'Teraz';
  const syncAccent = signedIn && (sync.status === 'offline' || pending > 0 || sync.status === 'error');
  const name = sync.displayName || sync.email?.split('@')[0];

  return (
    <div className={styles.page}>
      <h1 className={ui.screenTitle}>Ustawienia</h1>

      <section className={styles.account} aria-label="Konto">
        <span className={styles.avatar} aria-hidden="true">
          {(name ?? '?').charAt(0).toUpperCase()}
        </span>
        <div className={styles.accountText}>
          {signedIn ? (
            <>
              <p className={styles.accountName}>{name}</p>
              <p className={ui.hint}>
                {sync.email} · {isAdmin ? 'admin' : 'pracownik'}
              </p>
            </>
          ) : (
            <>
              <p className={styles.accountName}>Tylko na tym urządzeniu</p>
              <p className={ui.hint}>
                {sync.auth === 'not-configured' ? 'Synchronizacja nie jest skonfigurowana' : 'Nie zalogowano do Google'}
              </p>
            </>
          )}
        </div>
        {sync.auth === 'signed-out' && (
          <button type="button" className={`${ui.btn} ${ui.primary}`} onClick={() => void syncService.signIn()}>
            Zaloguj
          </button>
        )}
      </section>

      <section>
        <h2 className={ui.sectionLabel}>Dane i synchronizacja</h2>
        <div className={ui.listCard}>
          <Item to="/ustawienia/synchronizacja" label="Dysk Google" value="SztuKaFe-Katalog" />
          <Item to="/ustawienia/synchronizacja" label="Synchronizacja" value={syncValue} accent={syncAccent} />
          <Item
            to="/ustawienia/konflikty"
            label="Konflikty do przejrzenia"
            value={String(conflicts)}
            accent={conflicts > 0}
          />
          <Item
            to="/ustawienia/kurs"
            label="Kurs EUR (NBP)"
            value={eur ? `${formatRate(eur.rate)} · ${formatDate(eur.date)}${eur.manual ? ' (ręcznie)' : ''}` : 'Brak'}
            accent={!eur || isStale(eur)}
          />
        </div>
      </section>

      {isAdmin && (
        <section>
          <h2 className={ui.sectionLabel}>Administracja</h2>
          <div className={ui.listCard}>
            {signedIn && <Item to="/ustawienia/uzytkownicy" label="Użytkownicy i role" value={`${sync.users.length}`} />}
            {signedIn && (
              <Item
                to="/ustawienia/kopie"
                label="Kopie zapasowe"
                value={sync.lastBackupAt ? formatDateTime(sync.lastBackupAt) : 'Brak'}
              />
            )}
            <Item to="/ustawienia/import" label="Import CSV / XLSX" />
          </div>
        </section>
      )}

      <section>
        <h2 className={ui.sectionLabel}>Bezpieczeństwo</h2>
        <div className={ui.listCard}>
          <Item to="/ustawienia/bezpieczenstwo" label="Blokada Face ID" value={lock.enabled ? 'Włączona' : 'Wyłączona'} />
          <Item
            to="/ustawienia/bezpieczenstwo"
            label="Blokuj po"
            value={lock.lockAfterMin === 0 ? 'od razu' : `${lock.lockAfterMin} min w tle`}
          />
          <Item to="/ustawienia/bezpieczenstwo" label="Kod PIN zapasowy" value={lock.hasPin ? 'Ustawiony' : 'Brak'} />
        </div>
      </section>

      <p className={styles.footer}>SztuKaFe Katalog {__APP_VERSION__} · działa offline</p>
    </div>
  );
}
