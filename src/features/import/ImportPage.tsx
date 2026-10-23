import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db/db';
import { PageHeader } from '../../components/PageHeader';
import { Segment } from '../../components/Segment';
import { Switch } from '../../components/Switch';
import { useToast } from '../../components/Toast';
import { formatDimensions, formatPrice } from '../../lib/format';
import { pluralPl } from '../../lib/plural';
import { useSyncState } from '../../sync/useSync';
import { DEFAULT_FILTERS, storeFilters } from '../artworks/listFilters';
import { FIELDS, autoMap, type FieldDef, type FieldKey, type Mapping } from './fields';
import { importPlan, type ImportResult } from './commit';
import { DEFAULT_OPTIONS, MISSING_LABELS, buildPlan, mappingProblems, unmappedRequired, type ImportOptions } from './plan';
import { ImportFileError, readTable, type Table } from './readTable';
import ui from '../../styles/ui.module.css';
import styles from './ImportPage.module.css';

type Step = 'file' | 'map' | 'preview' | 'done';

/** Kolejność pól w kreatorze: najpierw wymagane i najczęstsze. */
const ORDER: FieldKey[] = [
  'title', 'artist', 'dimensions', 'width', 'height', 'depth', 'salePrice', 'currency', 'year', 'category',
  'technique', 'material', 'weightKg', 'edition', 'description', 'basis', 'status', 'location',
  'reservationUntil', 'purchasePrice', 'minPrice', 'oldInvNo',
];
const FIELD_BY_KEY = new Map<FieldKey, FieldDef>(FIELDS.map((f) => [f.key, f]));

export function ImportPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const isAdmin = useSyncState().role === 'admin';
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<Table>();
  const [mapping, setMapping] = useState<Mapping>({});
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number]>();
  const [result, setResult] = useState<ImportResult>();
  const [existing, setExisting] = useState<{ title: string; artist: string }[]>([]);

  const plan = useMemo(
    () => (table && step === 'preview' ? buildPlan(table, mapping, options, existing) : undefined),
    [table, mapping, options, existing, step],
  );

  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <PageHeader title="Import" backTo="/ustawienia" backLabel="Ustawienia" />
        <p className={ui.hint}>Tylko admin może importować dzieła.</p>
      </div>
    );
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const t = await readTable(file);
      setTable(t);
      setFileName(file.name);
      setMapping(autoMap(t.headers));
      setStep('map');
    } catch (err) {
      setError(err instanceof ImportFileError ? err.message : 'Nie udało się odczytać pliku.');
    } finally {
      setBusy(false);
    }
  }

  async function toPreview() {
    setExisting((await db.artworks.toArray()).filter((a) => !a.deleted).map((a) => ({ title: a.title, artist: a.artist })));
    setStep('preview');
  }

  async function run() {
    if (!plan) return;
    setBusy(true);
    try {
      setResult(await importPlan(plan, { isAdmin, onProgress: (d, t) => setProgress([d, t]) }));
      setStep('done');
    } catch {
      toast('Import przerwany. Dzieła zaimportowane do tej pory zostały w katalogu.');
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }

  const noun = (n: number) => pluralPl(n, 'dzieło', 'dzieła', 'dzieł');
  const problems = mappingProblems(mapping);
  const unmapped = unmappedRequired(mapping);

  return (
    <div className={styles.page}>
      <PageHeader title="Import" backTo="/ustawienia" backLabel="Ustawienia" />

      {step === 'file' && (
        <>
          <p className={ui.hint}>
            Wczytaj plik CSV lub XLSX z dawnego programu. W następnym kroku dopasujesz kolumny, zobaczysz podgląd i raport
            błędów — nic nie trafi do katalogu, dopóki nie potwierdzisz.
          </p>
          <ul className={styles.bullets}>
            <li>Rozpoznaję separatory (średnik, przecinek, tabulator) i polskie kodowanie Windows-1250.</li>
            <li>Zdjęć nie importujemy. Dzieła bez zdjęcia dostaną oznaczenie „do uzupełnienia”, a zdjęcia dodasz telefonem.</li>
            <li>Dzieła z brakami (np. bez tytułu albo ceny) też zostaną zaimportowane — z oznaczeniem „do uzupełnienia”.</li>
          </ul>
          {error && (
            <p className={ui.banner} role="alert">
              {error}
            </p>
          )}
          <input ref={fileInput} type="file" accept=".csv,.txt,.xlsx" hidden onChange={pick} data-testid="import-file" />
          <button
            type="button"
            className={`${ui.btn} ${ui.primary} ${ui.block}`}
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? 'Wczytuję plik…' : 'Wybierz plik CSV lub XLSX'}
          </button>
        </>
      )}

      {step === 'map' && table && (
        <>
          <p className={ui.hint}>
            <strong>{fileName}</strong> · {table.rows.length} {pluralPl(table.rows.length, 'wiersz', 'wiersze', 'wierszy')}. Sprawdź, która
            kolumna pliku odpowiada któremu polu.
          </p>

          <div className={`${ui.card} ${styles.options}`}>
            <div className={ui.field}>
              <span className={ui.label}>Kolejność liczb w kolumnie „Wymiary”</span>
              <Segment
                label="Kolejność wymiarów"
                value={options.dimensionOrder}
                onChange={(v) => setOptions({ ...options, dimensionOrder: v })}
                options={[
                  { value: 'wh', label: 'szer. × wys.' },
                  { value: 'hw', label: 'wys. × szer.' },
                ]}
              />
            </div>
            <div className={ui.field}>
              <span className={ui.label}>Waluta, gdy w pliku jej nie ma</span>
              <Segment
                label="Domyślna waluta"
                value={options.defaultCurrency}
                onChange={(v) => setOptions({ ...options, defaultCurrency: v })}
                options={[
                  { value: 'PLN', label: 'zł' },
                  { value: 'EUR', label: '€' },
                ]}
              />
            </div>
            <div className={styles.switchRow}>
              <span>Pomiń dzieła, które już są w katalogu</span>
              <Switch
                label="Pomiń duplikaty"
                checked={options.skipDuplicates}
                onChange={(v) => setOptions({ ...options, skipDuplicates: v })}
              />
            </div>
          </div>

          <ul className={styles.mapList}>
            {ORDER.map((key) => {
              const f = FIELD_BY_KEY.get(key)!;
              const col = mapping[key];
              const sample = col !== undefined ? table.rows.find((r) => r.cells[col])?.cells[col] : undefined;
              return (
                <li key={key} className={styles.mapRow}>
                  <label htmlFor={`map-${key}`} className={ui.label}>
                    {f.label}
                    {f.required && <span className={ui.required}> wymagane</span>}
                  </label>
                  <select
                    id={`map-${key}`}
                    className={ui.input}
                    value={col === undefined ? '' : String(col)}
                    onChange={(e) => {
                      const next = { ...mapping };
                      if (e.target.value === '') delete next[key];
                      else next[key] = Number(e.target.value);
                      setMapping(next);
                    }}
                  >
                    <option value="">— nie importuj —</option>
                    {table.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                  {sample && <span className={ui.hint}>np. „{sample.length > 40 ? `${sample.slice(0, 40)}…` : sample}”</span>}
                  {f.hint && !sample && <span className={ui.hint}>{f.hint}</span>}
                </li>
              );
            })}
          </ul>

          {problems.map((p) => (
            <p key={p} className={ui.banner} role="alert">
              {p}
            </p>
          ))}
          {unmapped.length > 0 && problems.length === 0 && (
            <p className={ui.hint}>
              Bez kolumn: {unmapped.join(', ').toLowerCase()} — wszystkie dzieła dostaną oznaczenie „do uzupełnienia”.
            </p>
          )}

          <div className={ui.row}>
            <button type="button" className={ui.btn} onClick={() => setStep('file')}>
              Wstecz
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.primary}`}
              disabled={problems.length > 0}
              onClick={() => void toPreview()}
            >
              Dalej: podgląd
            </button>
          </div>
        </>
      )}

      {step === 'preview' && plan && (
        <>
          <div className={styles.summary}>
            <div className={ui.card}>
              <span className={styles.big}>{plan.ready}</span>
              <span className={ui.hint}>gotowe</span>
            </div>
            <div className={ui.card}>
              <span className={`${styles.big} ${plan.incomplete ? styles.warn : ''}`}>{plan.incomplete}</span>
              <span className={ui.hint}>do uzupełnienia</span>
            </div>
            <div className={ui.card}>
              <span className={styles.big}>{plan.duplicates}</span>
              <span className={ui.hint}>pominięte duplikaty</span>
            </div>
          </div>

          <h2 className={ui.sectionLabel}>Podgląd pierwszych 10 wierszy</h2>
          <ul className={styles.preview}>
            {plan.rows.slice(0, 10).map((r) => (
              <li key={r.line} className={`${ui.card} ${styles.previewRow}`}>
                <div className={styles.previewHead}>
                  <strong>{r.input.title}</strong>
                  <span className={`${styles.tag} ${r.status === 'ready' ? '' : r.status === 'duplicate' ? styles.tagMuted : styles.tagWarn}`}>
                    {r.status === 'ready' ? 'gotowe' : r.status === 'duplicate' ? 'duplikat' : 'do uzupełnienia'}
                  </span>
                </div>
                <span className={ui.hint}>
                  {r.input.artist}
                  {r.input.dimensionsCm.w > 0 ? ` · ${formatDimensions(r.input.dimensionsCm)}` : ''}
                  {r.input.salePrice > 0 ? ` · ${formatPrice(r.input.salePrice, r.input.currency)}` : ''}
                </span>
                {r.missing.length > 0 && (
                  <span className={styles.issue}>Brakuje: {r.missing.map((m) => MISSING_LABELS[m]).join(', ')}</span>
                )}
              </li>
            ))}
          </ul>

          {plan.rows.some((r) => r.missing.length || r.warnings.length) && (
            <>
              <h2 className={ui.sectionLabel}>Raport błędów i uwag</h2>
              <ul className={styles.report}>
                {plan.rows
                  .filter((r) => r.missing.length || r.warnings.length)
                  .slice(0, 30)
                  .map((r) => (
                    <li key={r.line}>
                      <strong>Wiersz {r.line}:</strong>{' '}
                      {[r.missing.length ? `brakuje: ${r.missing.map((m) => MISSING_LABELS[m]).join(', ')}` : '', ...r.warnings]
                        .filter(Boolean)
                        .join('; ')}
                    </li>
                  ))}
              </ul>
            </>
          )}

          <div className={ui.row}>
            <button type="button" className={ui.btn} disabled={busy} onClick={() => setStep('map')}>
              Wstecz
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.primary}`}
              disabled={busy || plan.rows.length === plan.duplicates}
              onClick={run}
            >
              {busy && progress
                ? `Importuję… ${progress[0]}/${progress[1]}`
                : `Importuj ${plan.rows.length - plan.duplicates} ${noun(plan.rows.length - plan.duplicates)}`}
            </button>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <>
          <div className={ui.card}>
            <p style={{ fontWeight: 500 }}>
              Zaimportowano {result.imported} {noun(result.imported)}.
            </p>
            <p className={ui.hint} style={{ marginTop: 6 }}>
              {result.incomplete > 0 ? `${result.incomplete} do uzupełnienia. ` : ''}
              {result.skippedDuplicates > 0 ? `Pominięto ${result.skippedDuplicates} ${pluralPl(result.skippedDuplicates, 'duplikat', 'duplikaty', 'duplikatów')}. ` : ''}
              Dzieła są bez zdjęć — dodasz je z telefonu w edycji dzieła.
            </p>
          </div>
          <button
            type="button"
            className={`${ui.btn} ${ui.primary} ${ui.block}`}
            onClick={() => {
              storeFilters({ ...DEFAULT_FILTERS, todo: true });
              navigate('/katalog');
            }}
          >
            Pokaż dzieła do uzupełnienia
          </button>
          <button type="button" className={`${ui.btn} ${ui.block}`} onClick={() => navigate('/ustawienia')}>
            Gotowe
          </button>
        </>
      )}
    </div>
  );
}
