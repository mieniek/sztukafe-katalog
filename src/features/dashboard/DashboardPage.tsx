import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import logo from '../../assets/sztukafe-logo-white.png';
import { db } from '../../db/db';
import { isStale } from '../../db/rates';
import { useEurRate } from '../../db/useEurRate';
import { SyncPill } from '../../app/SyncIndicator';
import { ArtworkThumb } from '../../components/ArtworkThumb';
import { useToast } from '../../components/Toast';
import { formatDate, formatPrice, todayIso } from '../../lib/format';
import { formatRate } from '../../lib/nbp';
import { pluralPl } from '../../lib/plural';
import { useSyncState } from '../../sync/useSync';
import { useLockState } from '../lock/LockGate';
import { lockService } from '../lock/lockService';
import { collectionValue, expiringReservations, soldInYear } from './stats';
import ui from '../../styles/ui.module.css';
import styles from './DashboardPage.module.css';

function firstName(displayName?: string, email?: string): string | undefined {
  const name = displayName?.trim().split(/\s+/)[0];
  if (name) return name;
  const local = email?.split('@')[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : undefined;
}

/** Jednorazowa propozycja włączenia Face ID (plan: „pierwsze uruchomienie: rejestracja passkey”). */
function LockPrompt() {
  const lock = useLockState();
  const toast = useToast();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    void lockService.passkeyAvailable().then(setAvailable);
  }, []);

  if (lock.enabled || lock.promptDismissed || !available) return null;
  return (
    <div className={ui.card}>
      <p style={{ fontWeight: 500 }}>Zabezpiecz aplikację</p>
      <p className={ui.hint} style={{ margin: '4px 0 12px' }}>
        Face ID lub kod urządzenia będzie potrzebny przy każdym otwarciu katalogu.
      </p>
      <div className={ui.row}>
        <button type="button" className={ui.btn} onClick={() => void lockService.dismissPrompt()}>
          Nie teraz
        </button>
        <button
          type="button"
          className={`${ui.btn} ${ui.primary}`}
          onClick={async () => {
            try {
              await lockService.registerPasskey();
              await lockService.enable();
              toast('Blokada Face ID włączona');
            } catch {
              toast('Nie udało się włączyć Face ID');
            }
          }}
        >
          Włącz
        </button>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const sync = useSyncState();
  const artworks = useLiveQuery(async () => (await db.artworks.toArray()).filter((a) => !a.deleted), []);
  const list = artworks ?? [];
  const today = todayIso();
  const year = new Date().getFullYear();

  const name = firstName(sync.displayName, sync.email);
  const eur = useEurRate();
  const value = collectionValue(list, eur?.rate);
  const hasEur = list.some((a) => a.currency === 'EUR' && a.status !== 'sprzedane');
  const sold = soldInYear(list, year);
  const available = list.filter((a) => a.status === 'dostepne').length;
  const expiring = expiringReservations(list, today);
  const recent = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <img src={logo} alt="SztuKaFe" width={64} />
        <SyncPill />
      </div>

      <h1 className={styles.greeting}>
        Dzień dobry,
        {name && (
          <>
            <br />
            <span className={styles.name}>{name}</span>
          </>
        )}
      </h1>

      <Link to="/nowe" className={styles.cta}>
        <span>
          <span className={styles.ctaTitle}>Nowe dzieło</span>
          <span className={styles.ctaSub}>Zdjęcie, potem dane. Poniżej minuty.</span>
        </span>
        <span className={styles.ctaPlus} aria-hidden="true">
          +
        </span>
      </Link>

      <LockPrompt />

      {expiring.length > 0 && (
        <section className={ui.warnCard} aria-label="Wygasające rezerwacje">
          <p className={styles.warnTitle}>
            {expiring.length}{' '}
            {pluralPl(expiring.length, 'rezerwacja wygasa', 'rezerwacje wygasają', 'rezerwacji wygasa')}
            {' '}w ciągu 7 dni
          </p>
          <ul className={styles.resList}>
            {expiring.map((a) => (
              <li key={a.id}>
                <button type="button" className={styles.resRow} onClick={() => navigate(`/dzielo/${a.id}`)}>
                  <span>
                    <span className={styles.resTitle}>{a.title}</span>
                    {a.reservation?.note && <span className={styles.resNote}>{a.reservation.note}</span>}
                  </span>
                  <span className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    do {formatDate(a.reservation!.until).slice(0, 5)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={styles.stats}>
        <div className={`${ui.card} ${styles.wide}`}>
          <p className={styles.statLabel}>Wartość zbioru</p>
          <p className={styles.statValue}>{formatPrice(value.totalPln, 'PLN')}</p>
          <p className={styles.statNote}>
            ceny sprzedaży, bez sprzedanych
            {hasEur && eur && ` · EUR po kursie NBP ${formatRate(eur.rate)}`}
            {hasEur && eur && (eur.manual || isStale(eur)) && ` z ${formatDate(eur.date)}${eur.manual ? ' (ręcznie)' : ''}`}
            {value.skippedEur > 0 &&
              ` · bez ${value.skippedEur} ${pluralPl(value.skippedEur, 'dzieła', 'dzieł', 'dzieł')} w EUR (brak kursu)`}
          </p>
        </div>
        <div className={ui.card}>
          <p className={styles.statLabel}>Dzieła w zbiorze</p>
          <p className={styles.statValue}>{list.length}</p>
          <p className={styles.statNote}>{available} dostępnych</p>
        </div>
        <div className={ui.card}>
          <p className={styles.statLabel}>Sprzedane w {year}</p>
          <p className={styles.statValue}>{sold.count}</p>
          <p className={styles.statNote}>{sold.lastDate ? `ostatnie ${formatDate(sold.lastDate)}` : 'jeszcze nic'}</p>
        </div>
      </div>

      {recent.length > 0 && (
        <section>
          <div className={styles.recentHead}>
            <h2 className={styles.sectionTitle}>Ostatnio dodane</h2>
            <Link to="/katalog" className={styles.allLink}>
              Cały katalog
            </Link>
          </div>
          <ul className={styles.recent}>
            {recent.map((a) => (
              <li key={a.id}>
                <Link to={`/dzielo/${a.id}`} className={styles.tile}>
                  <ArtworkThumb artworkId={a.id} photoId={a.photoIds[0]} className={styles.tileImg} />
                  <span className={styles.tileTitle}>{a.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
