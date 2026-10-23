import { useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { Segment } from '../../components/Segment';
import { useToast } from '../../components/Toast';
import type { Role } from '../../db/types';
import { syncService } from '../../sync/syncService';
import { useSyncState } from '../../sync/useSync';
import ui from '../../styles/ui.module.css';
import styles from './SettingsPage.module.css';

const ROLE_OPTIONS = [
  { value: 'pracownik' as const, label: 'Pracownik' },
  { value: 'admin' as const, label: 'Admin' },
];

export function UsersPage() {
  const state = useSyncState();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('pracownik');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string>();

  if (state.role !== 'admin') {
    return (
      <div className={styles.stack}>
        <PageHeader title="Użytkownicy" backTo="/ustawienia" backLabel="Ustawienia" />
        <p className={ui.hint}>Tylko admin może zarządzać użytkownikami.</p>
      </div>
    );
  }

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    try {
      await action();
      toast(done);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Nie udało się zapisać zmiany.');
    } finally {
      setBusy(false);
    }
  }

  const users = [...state.users].sort((a, b) => a.email.localeCompare(b.email));

  return (
    <div className={styles.stack}>
      <PageHeader title="Użytkownicy i role" backTo="/ustawienia" backLabel="Ustawienia" />
      <p className={ui.hint}>
        Admin widzi wszystko, także ceny zakupu i minimalne. Pracownik ich nie widzi, a ich pliki nie są dla niego
        udostępnione na Dysku Google.
      </p>

      <ul className={styles.list}>
        {users.map((u) => {
          const me = u.email.toLowerCase() === state.email?.toLowerCase();
          return (
            <li key={u.email} className={`${ui.card} ${styles.userRow}`}>
              <div className={styles.userHead}>
                <span className={styles.email}>
                  {u.email}
                  {me && <span className={ui.hint}> · to Ty</span>}
                </span>
                {!me && (
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.danger}`}
                    style={{ minHeight: 44 }}
                    disabled={busy}
                    onClick={() => setRemoving(u.email)}
                  >
                    Usuń
                  </button>
                )}
              </div>
              <Segment
                label={`Rola: ${u.email}`}
                value={u.role}
                options={ROLE_OPTIONS}
                onChange={(r) =>
                  r !== u.role && void run(() => syncService.setUserRole(u.email, r), `Zmieniono rolę: ${u.email}`)
                }
              />
            </li>
          );
        })}
      </ul>

      <form
        className={`${ui.card} ${styles.stack}`}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email.trim()) return;
          await run(() => syncService.setUserRole(email, role), 'Dodano osobę — dostała zaproszenie od Google');
          setEmail('');
        }}
      >
        <h2 className={ui.sectionLabel}>Dodaj osobę</h2>
        <div className={ui.field}>
          <label htmlFor="new-user" className={ui.label}>
            Adres Google
          </label>
          <input
            id="new-user"
            type="email"
            className={ui.input}
            autoComplete="off"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Segment label="Rola nowej osoby" value={role} options={ROLE_OPTIONS} onChange={setRole} />
        <p className={ui.hint}>
          Osoba dostanie od Google zaproszenie do folderu SztuKaFe-Katalog. Dopóki projekt Google Cloud jest w trybie
          Testowanie, jej adres trzeba też dodać jako użytkownika testowego (docs/GOOGLE_SETUP.md).
        </p>
        <button type="submit" className={`${ui.btn} ${ui.primary} ${ui.block}`} disabled={busy || !email.trim()}>
          {busy ? 'Zapisuję…' : 'Dodaj osobę'}
        </button>
      </form>

      {removing && (
        <ConfirmDialog
          title="Usunąć osobę?"
          message={`${removing} straci dostęp do katalogu na Dysku Google. Dane na jej urządzeniach przestaną się synchronizować.`}
          confirmLabel="Usuń osobę"
          cancelLabel="Zostaw"
          danger
          onCancel={() => setRemoving(undefined)}
          onConfirm={async () => {
            const who = removing;
            setRemoving(undefined);
            await run(() => syncService.removeUser(who), 'Usunięto osobę');
          }}
        />
      )}
    </div>
  );
}
