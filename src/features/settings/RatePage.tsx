import { useState } from 'react';
import { clearManualRate, isStale, refreshEurRate, setManualRate } from '../../db/rates';
import { useEurRate } from '../../db/useEurRate';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { formatDate } from '../../lib/format';
import { formatRate } from '../../lib/nbp';
import { parseNumber } from '../artworks/formValues';
import { formatDateTime } from './SettingsPage';
import ui from '../../styles/ui.module.css';
import styles from './SettingsPage.module.css';

export function RatePage() {
  const eur = useEurRate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string>();

  async function fetchNow() {
    setBusy(true);
    setError(undefined);
    try {
      await clearManualRate();
      const r = await refreshEurRate({ force: true });
      toast(`Kurs NBP: ${formatRate(r!.rate)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nie udało się pobrać kursu.');
    } finally {
      setBusy(false);
    }
  }

  async function saveManual(e: React.FormEvent) {
    e.preventDefault();
    const n = parseNumber(manual);
    if (n === undefined || Number.isNaN(n)) return setError('Podaj kurs liczbą, np. 4,27.');
    try {
      await setManualRate(n);
      setError(undefined);
      setManual('');
      toast('Zapisano kurs ręczny');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać kursu.');
    }
  }

  return (
    <div className={styles.stack}>
      <PageHeader title="Kurs EUR" backTo="/ustawienia" backLabel="Ustawienia" />
      <p className={ui.hint}>
        Kurs średni NBP służy do przeliczania cen w euro na złote: wartość zbioru na pulpicie, cena w PLN na karcie
        dzieła, filtr i sortowanie po cenie. Aplikacja pobiera go sama, a bez internetu używa ostatniego znanego.
      </p>

      <div className={ui.listCard}>
        <div className={ui.listRow}>
          <span>Obowiązujący kurs</span>
          <span className={ui.listValue}>{eur ? `1 € = ${formatRate(eur.rate)} zł` : 'brak'}</span>
        </div>
        {eur && (
          <>
            <div className={ui.listRow}>
              <span>Z dnia</span>
              <span className={ui.listValue}>{formatDate(eur.date)}</span>
            </div>
            <div className={ui.listRow}>
              <span>Źródło</span>
              <span className={ui.listValue}>{eur.manual ? 'wpisany ręcznie' : 'NBP'}</span>
            </div>
            <div className={ui.listRow}>
              <span>Ostatnie pobranie</span>
              <span className={`${ui.listValue} ${isStale(eur) ? ui.listValueAccent : ''}`}>
                {eur.manual ? '—' : formatDateTime(eur.fetchedAt)}
              </span>
            </div>
          </>
        )}
      </div>

      {error && (
        <p className={ui.banner} role="alert">
          {error}
        </p>
      )}

      <button type="button" className={`${ui.btn} ${ui.primary} ${ui.block}`} disabled={busy} onClick={fetchNow}>
        {busy ? 'Pobieram…' : 'Pobierz z NBP'}
      </button>

      <form className={`${ui.card} ${styles.stack}`} onSubmit={saveManual}>
        <h2 className={ui.sectionLabel}>Wpisz kurs ręcznie</h2>
        <p className={ui.hint}>
          Gdy NBP nie odpowiada (albo przeglądarka blokuje połączenie), możesz wpisać kurs sam. Zostanie, dopóki nie
          stukniesz „Pobierz z NBP”.
        </p>
        <div className={ui.field}>
          <label htmlFor="manual-rate" className={ui.label}>
            Ile złotych za 1 €
          </label>
          <input
            id="manual-rate"
            className={ui.input}
            inputMode="decimal"
            placeholder="np. 4,27"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
        </div>
        <button type="submit" className={`${ui.btn} ${ui.block}`} disabled={!manual.trim()}>
          Zapisz kurs ręczny
        </button>
      </form>
    </div>
  );
}
