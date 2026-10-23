import { useCallback, useEffect, useState } from 'react';
import { restoreFromBackup } from '../../db/backupRestore';
import { PageHeader } from '../../components/PageHeader';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { formatDate } from '../../lib/format';
import { pluralPl } from '../../lib/plural';
import type { BackupFile, BackupInfo } from '../../sync/backups';
import { syncService } from '../../sync/syncService';
import { useSyncState } from '../../sync/useSync';
import { formatDateTime } from './SettingsPage';
import ui from '../../styles/ui.module.css';
import styles from './SettingsPage.module.css';

interface Preview {
  info: BackupInfo;
  file: BackupFile;
}

export function BackupsPage() {
  const state = useSyncState();
  const toast = useToast();
  const [backups, setBackups] = useState<BackupInfo[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview>();

  const reload = useCallback(async () => {
    try {
      setError(undefined);
      setBackups(await syncService.listBackups());
    } catch {
      setBackups([]);
      setError('Nie udało się pobrać listy kopii. Sprawdź połączenie z internetem.');
    }
  }, []);

  useEffect(() => {
    if (state.role === 'admin' && state.auth === 'signed-in') void reload();
  }, [state.role, state.auth, reload]);

  if (state.role !== 'admin') {
    return (
      <div className={styles.stack}>
        <PageHeader title="Kopie zapasowe" backTo="/ustawienia" backLabel="Ustawienia" />
        <p className={ui.hint}>Tylko admin ma dostęp do kopii zapasowych.</p>
      </div>
    );
  }

  async function backupNow() {
    setBusy(true);
    try {
      await syncService.createBackup();
      toast('Kopia zapasowa wykonana');
      await reload();
    } catch {
      toast('Nie udało się wykonać kopii. Spróbuj ponownie.');
    } finally {
      setBusy(false);
    }
  }

  async function open(info: BackupInfo) {
    try {
      setPreview({ info, file: await syncService.readBackup(info.fileId) });
    } catch {
      toast('Nie udało się otworzyć kopii.');
    }
  }

  const count = preview?.file.artworks.filter((a) => !a.deleted).length ?? 0;

  return (
    <div className={styles.stack}>
      <PageHeader title="Kopie zapasowe" backTo="/ustawienia" backLabel="Ustawienia" />
      <p className={ui.hint}>
        Kopia zawiera dane dzieł bez zdjęć i bez cen wewnętrznych. Aplikacja robi ją sama raz na dobę i trzyma ostatnie
        30. Ostatnia: {formatDateTime(state.lastBackupAt)}.
      </p>
      <button type="button" className={`${ui.btn} ${ui.primary} ${ui.block}`} disabled={busy} onClick={backupNow}>
        {busy ? 'Wykonuję kopię…' : 'Wykonaj kopię teraz'}
      </button>

      {error && (
        <p className={ui.banner} role="alert">
          {error}
        </p>
      )}
      {backups === undefined ? (
        <p className={ui.hint}>Wczytuję…</p>
      ) : backups.length === 0 ? (
        !error && <p className={ui.hint}>Nie ma jeszcze żadnej kopii.</p>
      ) : (
        <div className={ui.listCard}>
          {backups.map((b) => (
            <button key={b.fileId} type="button" className={ui.listRow} onClick={() => void open(b)}>
              <span>{formatDate(b.date)}</span>
              <span className={ui.listValue}>
                Przywróć
                <span className={ui.chev} aria-hidden="true">
                  ›
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {preview && (
        <Sheet title={`Kopia z ${formatDate(preview.info.date)}`} onClose={() => setPreview(undefined)}>
          <p style={{ color: 'var(--ink-2)', fontSize: 14 }}>
            W kopii jest {count} {pluralPl(count, 'dzieło', 'dzieła', 'dzieł')}. Przywrócenie ustawi te dzieła tak, jak
            wyglądały w tym dniu (także te usunięte od tamtej pory). Dzieła dodane później zostaną.
          </p>
          <button
            type="button"
            className={`${ui.btn} ${ui.primary} ${ui.block}`}
            onClick={async () => {
              const changed = await restoreFromBackup(preview.file);
              setPreview(undefined);
              toast(
                changed === 0
                  ? 'Nic do przywrócenia — dane są takie same'
                  : `Przywrócono ${changed} ${pluralPl(changed, 'dzieło', 'dzieła', 'dzieł')}`,
              );
              void syncService.sync();
            }}
          >
            Przywróć z kopii
          </button>
          <button type="button" className={`${ui.btn} ${ui.block}`} onClick={() => setPreview(undefined)}>
            Anuluj
          </button>
        </Sheet>
      )}
    </div>
  );
}
