import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { syncService } from '../../sync/syncService';
import { usePendingCount, useSyncState } from '../../sync/useSync';
import { formatDateTime } from './SettingsPage';
import ui from '../../styles/ui.module.css';
import styles from './SettingsPage.module.css';

export function SyncSettingsPage() {
  const state = useSyncState();
  const pending = usePendingCount();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const signedIn = state.auth === 'signed-in' || state.auth === 'needs-login';

  return (
    <div className={styles.stack} data-testid="sync-state" data-status={state.status} data-last-sync={state.lastSyncAt ?? ''}>
      <PageHeader title="Synchronizacja" backTo="/ustawienia" backLabel="Ustawienia" />

      {state.auth === 'not-configured' ? (
        <div className={ui.card}>
          <p>
            Synchronizacja z Dyskiem Google nie jest jeszcze skonfigurowana. Aplikacja działa, ale dane są tylko na tym
            urządzeniu.
          </p>
          <p className={ui.hint} style={{ marginTop: 8 }}>
            Instrukcja krok po kroku: docs/GOOGLE_SETUP.md
          </p>
        </div>
      ) : (
        <>
          <div className={ui.listCard}>
            <div className={ui.listRow}>
              <span>Konto</span>
              <span className={ui.listValue}>{signedIn ? state.email : 'niezalogowano'}</span>
            </div>
            <div className={ui.listRow}>
              <span>Folder na Dysku</span>
              <span className={ui.listValue}>SztuKaFe-Katalog</span>
            </div>
            <div className={ui.listRow}>
              <span>Do wysłania</span>
              <span className={ui.listValue}>{pending}</span>
            </div>
            <div className={ui.listRow}>
              <span>Ostatnia synchronizacja</span>
              <span className={ui.listValue}>{formatDateTime(state.lastSyncAt)}</span>
            </div>
          </div>

          {state.error && (
            <p className={ui.banner} role="alert">
              {state.error}
            </p>
          )}

          {signedIn ? (
            <div className={ui.row}>
              <button
                type="button"
                className={`${ui.btn} ${ui.primary}`}
                disabled={state.status === 'syncing' || state.auth === 'needs-login'}
                onClick={() => void syncService.sync(true)}
              >
                {state.status === 'syncing' ? 'Synchronizuję…' : 'Synchronizuj teraz'}
              </button>
              <button type="button" className={ui.btn} onClick={() => setConfirmLogout(true)}>
                Wyloguj
              </button>
            </div>
          ) : null}
          {signedIn && (
            <>
              <button type="button" className={`${ui.btn} ${ui.danger} ${ui.block}`} onClick={() => setConfirmWipe(true)}>
                Wyloguj i usuń dane z tego urządzenia
              </button>
              <p className={ui.hint}>Dla cudzego lub wspólnego urządzenia. Dane na Dysku Google zostają nietknięte.</p>
            </>
          )}
          {(state.auth === 'signed-out' || state.auth === 'needs-login') && (
            <button
              type="button"
              className={`${ui.btn} ${ui.primary} ${ui.block}`}
              onClick={() => void syncService.signIn()}
            >
              {state.auth === 'needs-login' ? 'Zaloguj ponownie' : 'Zaloguj przez Google'}
            </button>
          )}
        </>
      )}

      {confirmLogout && (
        <ConfirmDialog
          title="Wylogować z Google?"
          message={
            pending > 0
              ? `${pending} zmian czeka na wysłanie. Zostaną na tym urządzeniu i pójdą na Dysk po ponownym zalogowaniu.`
              : 'Dane zostają na tym urządzeniu. Synchronizacja wznowi się po ponownym zalogowaniu.'
          }
          confirmLabel="Wyloguj"
          onCancel={() => setConfirmLogout(false)}
          onConfirm={async () => {
            setConfirmLogout(false);
            await syncService.signOut();
          }}
        />
      )}
      {confirmWipe && (
        <ConfirmDialog
          title="Usunąć dane z tego urządzenia?"
          message={
            pending > 0
              ? `${pending} zmian jeszcze nie trafiło na Dysk i przepadnie razem z danymi z tego urządzenia. Najpierw zsynchronizuj, jeśli chcesz je zachować. Blokada PIN zostaje.`
              : 'Dzieła, zdjęcia i ceny znikną z tego urządzenia. Na Dysku Google zostają, wrócą po ponownym zalogowaniu. Blokada PIN zostaje.'
          }
          confirmLabel="Wyloguj i usuń"
          cancelLabel="Zostaw"
          danger
          onCancel={() => setConfirmWipe(false)}
          onConfirm={async () => {
            setConfirmWipe(false);
            await syncService.signOutAndWipe();
          }}
        />
      )}
    </div>
  );
}
