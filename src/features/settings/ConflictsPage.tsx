import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { dismissConflict, restoreConflictVersion } from '../../db/conflicts';
import { findDuplicateInvNos, requestNewInvNo } from '../../db/invNoRepair';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { formatDateTime } from './SettingsPage';
import ui from '../../styles/ui.module.css';
import styles from './SettingsPage.module.css';

function Conflicts() {
  const toast = useToast();
  const conflicts = useLiveQuery(() => db.conflicts.orderBy('id').toArray(), [], []);
  const current = useLiveQuery(async () => new Map((await db.artworks.toArray()).map((a) => [a.id, a])), []);

  if (conflicts.length === 0) return <p className={ui.hint}>Brak konfliktów — wszystko w porządku.</p>;
  return (
    <ul className={styles.list}>
      {conflicts.map((c) => {
        const v = c.losingVersion;
        const kept = current?.get(c.entityId);
        return (
          <li key={c.id} className={ui.card}>
            <p style={{ fontWeight: 500 }}>{v.title}</p>
            <p className={ui.hint} style={{ margin: '4px 0 12px' }}>
              Dwie osoby zmieniły to dzieło w tym samym czasie. Zachowano nowszą wersję
              {kept ? ` („${kept.title}”, ${kept.updatedBy})` : ''}. Przegrana wersja: {v.updatedBy},{' '}
              {formatDateTime(v.updatedAt)}.
            </p>
            <div className={styles.stack} style={{ gap: 8 }}>
              <Link to={`/dzielo/${c.entityId}`} className={ui.btn}>
                Otwórz dzieło
              </Link>
              <div className={ui.row}>
                <button
                  type="button"
                  className={ui.btn}
                  onClick={async () => {
                    await restoreConflictVersion(c.id);
                    toast('Przywrócono wybraną wersję');
                  }}
                >
                  Przywróć tę wersję
                </button>
                <button type="button" className={ui.btn} onClick={() => void dismissConflict(c.id)}>
                  Odrzuć
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Duplicates() {
  const toast = useToast();
  const groups = useLiveQuery(() => findDuplicateInvNos(), [], []);
  if (groups.length === 0) return null;
  return (
    <section className={styles.stack}>
      <h2 className={ui.sectionLabel}>Powtórzone numery inwentarzowe</h2>
      <p className={ui.hint}>
        Dwa urządzenia dostały ten sam numer. Nowszemu dziełu można nadać nowy numer — pojawi się po najbliższej
        synchronizacji.
      </p>
      <ul className={styles.list}>
        {groups.map((g) => (
          <li key={g[0].invNo} className={ui.card}>
            <span className="mono" style={{ fontFamily: 'var(--font-mono)' }}>
              {g[0].invNo}
            </span>
            {g.slice(1).map((a) => (
              <div key={a.id} className={styles.dupRow}>
                <span>{a.title}</span>
                <button
                  type="button"
                  className={ui.btn}
                  onClick={async () => {
                    await requestNewInvNo(a.id);
                    toast('Nowy numer pojawi się po synchronizacji');
                  }}
                >
                  Nadaj nowy numer
                </button>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ConflictsPage() {
  return (
    <div className={styles.stack}>
      <PageHeader title="Konflikty" backTo="/ustawienia" backLabel="Ustawienia" />
      <Conflicts />
      <Duplicates />
    </div>
  );
}
