import { useState } from 'react';
import logo from '../../assets/sztukafe-logo-white.png';
import { useLockState } from './LockGate';
import { lockService, PIN_PATTERN } from './lockService';
import styles from './LockScreen.module.css';

/** Ekran blokady: Face ID (lub kod urządzenia) albo zapasowy PIN. */
export function LockScreen() {
  const state = useLockState();
  const [message, setMessage] = useState('Aplikacja jest zablokowana');
  const [ok, setOk] = useState(false);
  const [pinMode, setPinMode] = useState(!state.hasPasskey && state.hasPin);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>();

  function success() {
    setOk(true);
    setMessage('Rozpoznano');
    setTimeout(() => lockService.unlock(), 650);
  }

  async function tryPasskey() {
    setError(undefined);
    if (await lockService.unlockWithPasskey()) success();
    else setMessage('Nie rozpoznano. Spróbuj jeszcze raz.');
  }

  async function tryPin(e: React.FormEvent) {
    e.preventDefault();
    const wait = lockService.penaltySeconds();
    if (wait > 0) return setError(`Za dużo prób. Spróbuj za ${wait} s.`);
    if (!PIN_PATTERN.test(pin)) return setError('Kod PIN to 4–8 cyfr.');
    if (await lockService.verifyPin(pin)) return success();
    setPin('');
    const after = lockService.penaltySeconds();
    setError(after > 0 ? `Za dużo prób. Spróbuj za ${after} s.` : 'Nieprawidłowy kod PIN.');
  }

  return (
    <main className={styles.screen}>
      <div className={styles.top}>
        <img src={logo} alt="SztuKaFe" width={160} />
        <p className={styles.tag}>Katalog zbioru</p>
      </div>

      <div className={styles.bottom}>
        <div className={`${styles.faceId} ${ok ? styles.ok : ''}`} aria-hidden="true">
          <span />
        </div>
        <p className={styles.message} role="status">
          {message}
        </p>

        {!pinMode && state.hasPasskey && (
          <button type="button" className={styles.unlock} onClick={tryPasskey}>
            Odblokuj Face ID
          </button>
        )}

        {pinMode && (
          <form onSubmit={tryPin} className={styles.pinForm}>
            <label htmlFor="pin" className="visually-hidden">
              Kod PIN
            </label>
            <input
              id="pin"
              className={styles.pinInput}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              autoFocus
              placeholder="Kod PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <button type="submit" className={styles.unlock}>
              Odblokuj
            </button>
          </form>
        )}

        {state.hasPin && state.hasPasskey && (
          <button type="button" className={styles.link} onClick={() => setPinMode((v) => !v)}>
            {pinMode ? 'Użyj Face ID' : 'Użyj kodu PIN'}
          </button>
        )}
      </div>
    </main>
  );
}
