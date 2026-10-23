import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Segment } from '../../components/Segment';
import { Sheet } from '../../components/Sheet';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { useLockState } from '../lock/LockGate';
import { LOCK_AFTER_OPTIONS, PIN_PATTERN, lockService } from '../lock/lockService';
import ui from '../../styles/ui.module.css';
import styles from './SettingsPage.module.css';

const AFTER_LABEL = (m: number) => (m === 0 ? 'Od razu' : `${m} min`);

function PinSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string>();

  return (
    <Sheet title="Kod PIN zapasowy" onClose={onClose}>
      <form
        className={styles.stack}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!PIN_PATTERN.test(pin)) return setError('Kod PIN to 4–8 cyfr.');
          if (pin !== again) return setError('Kody nie są takie same.');
          await lockService.setPin(pin);
          toast('Kod PIN zapisany');
          onClose();
        }}
      >
        <p className={ui.hint}>Przyda się, gdy Face ID nie zadziała. 4–8 cyfr.</p>
        <div className={ui.field}>
          <label htmlFor="pin1" className={ui.label}>
            Nowy kod PIN
          </label>
          <input
            id="pin1"
            className={ui.input}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className={ui.field}>
          <label htmlFor="pin2" className={ui.label}>
            Powtórz kod PIN
          </label>
          <input
            id="pin2"
            className={ui.input}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={again}
            onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={`${ui.btn} ${ui.primary} ${ui.block}`}>
          Zapisz kod PIN
        </button>
      </form>
    </Sheet>
  );
}

export function SecurityPage() {
  const lock = useLockState();
  const toast = useToast();
  const [passkeyOk, setPasskeyOk] = useState<boolean>();
  const [pinSheet, setPinSheet] = useState(false);

  useEffect(() => {
    void lockService.passkeyAvailable().then(setPasskeyOk);
  }, []);

  async function toggle(on: boolean) {
    try {
      if (!on) return await lockService.disable();
      if (!lock.hasPasskey && !lock.hasPin) {
        if (passkeyOk) await lockService.registerPasskey();
        else return toast('Na tym urządzeniu ustaw najpierw kod PIN');
      }
      await lockService.enable();
      toast('Blokada włączona');
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'Nie udało się włączyć blokady');
    }
  }

  return (
    <div className={styles.stack}>
      <PageHeader title="Bezpieczeństwo" backTo="/ustawienia" backLabel="Ustawienia" />

      <div className={ui.listCard}>
        <div className={ui.listRow}>
          <span>
            Blokada Face ID
            {passkeyOk === false && <span className={ui.hint} style={{ display: 'block' }}>Face ID niedostępne — użyj PIN-u</span>}
          </span>
          <Switch label="Blokada aplikacji" checked={lock.enabled} onChange={(v) => void toggle(v)} />
        </div>
        <div className={ui.listRow}>
          <span>Kod PIN zapasowy</span>
          <span className={ui.listValue}>
            {lock.hasPin ? 'Ustawiony' : 'Brak'}
          </span>
        </div>
      </div>

      <div className={styles.stack} style={{ gap: 8 }}>
        <button type="button" className={`${ui.btn} ${ui.block}`} onClick={() => setPinSheet(true)}>
          {lock.hasPin ? 'Zmień kod PIN' : 'Ustaw kod PIN'}
        </button>
        {lock.hasPin && (
          <button
            type="button"
            className={`${ui.btn} ${ui.block} ${ui.danger}`}
            onClick={async () => {
              await lockService.removePin();
              toast('Kod PIN usunięty');
            }}
          >
            Usuń kod PIN
          </button>
        )}
        {passkeyOk && !lock.hasPasskey && (
          <button
            type="button"
            className={`${ui.btn} ${ui.block}`}
            onClick={async () => {
              try {
                await lockService.registerPasskey();
                toast('Face ID skonfigurowane');
              } catch {
                toast('Nie udało się skonfigurować Face ID');
              }
            }}
          >
            Skonfiguruj Face ID
          </button>
        )}
      </div>

      <div className={ui.field}>
        <span className={ui.label}>Blokuj po wyjściu z aplikacji</span>
        <Segment
          label="Czas do zablokowania"
          value={String(lock.lockAfterMin)}
          options={LOCK_AFTER_OPTIONS.map((m) => ({ value: String(m), label: AFTER_LABEL(m) }))}
          onChange={(v) => void lockService.setLockAfter(Number(v))}
        />
      </div>

      <p className={ui.hint}>
        To blokada dostępu do aplikacji, a nie szyfrowanie danych. Chroni przed przypadkowym zajrzeniem do katalogu na
        odblokowanym telefonie, ale nie przed kimś, kto ma pełny dostęp do urządzenia.
      </p>

      {pinSheet && <PinSheet onClose={() => setPinSheet(false)} />}
    </div>
  );
}
