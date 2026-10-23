import { useState, type ReactNode } from 'react';
import type { PhotoDraft } from '../../db/artworks';
import { Segment } from '../../components/Segment';
import { useToast } from '../../components/Toast';
import { CATEGORY_LABELS, entries } from '../../lib/labels';
import { PhotoStrip } from './PhotoStrip';
import { missingFields, validate, type FormValues } from './formValues';
import ui from '../../styles/ui.module.css';
import styles from './ArtworkForm.module.css';

interface Props {
  mode: 'new' | 'edit';
  title: string;
  /** Mała plakietka w prawym górnym rogu: czas i liczba zdjęć albo numer inwentarzowy. */
  badge: string;
  initial: FormValues;
  photos: PhotoDraft[];
  onPhotosChange: (photos: PhotoDraft[]) => void;
  /** Tylko admin widzi i wpisuje ceny wewnętrzne. */
  isAdmin: boolean;
  submitLabel: string;
  saving?: boolean;
  onSubmit: (values: FormValues) => void | Promise<void>;
  onCancel: () => void;
}

interface FieldProps {
  id: string;
  label: string;
  /** `undefined` = pole opcjonalne; w przeciwnym razie czy jest już wypełnione. */
  filled?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

function Field({ id, label, filled, error, hint, children }: FieldProps) {
  return (
    <div className={ui.field}>
      <div className={ui.labelRow}>
        <label htmlFor={id} className={ui.label}>
          {label}
        </label>
        {filled === false && <span className={ui.required}>wymagane</span>}
        {filled === true && <span className={ui.requiredOk}>wymagane ✓</span>}
      </div>
      {children}
      {hint && !error && <p className={ui.hint}>{hint}</p>}
      {error && (
        <p className={ui.error} id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function ArtworkForm({
  mode,
  title,
  badge,
  initial,
  photos,
  onPhotosChange,
  isAdmin,
  submitLabel,
  saving,
  onSubmit,
  onCancel,
}: Props) {
  const toast = useToast();
  const [values, setValues] = useState<FormValues>(initial);
  const [attempted, setAttempted] = useState(false);

  const errors = validate(values, photos.length);
  const missing = missingFields(errors);
  const valid = Object.keys(errors).length === 0;
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  const filled = (key: keyof FormValues) => values[key].toString().trim() !== '';
  // Puste pole wymagane ma od początku ramkę „brakuje”; pozostałe błędy pokazujemy po próbie zapisu.
  const bad = (key: keyof FormValues, required = false) =>
    (required && !filled(key)) || (attempted && !!errors[key]);

  const input = (key: keyof FormValues, required = false) => ({
    id: `f-${key}`,
    className: `${ui.input} ${bad(key, required) ? ui.invalid : ''}`,
    value: values[key] as string,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
    'aria-invalid': bad(key, required) || undefined,
    'aria-describedby': attempted && errors[key] ? `f-${key}-error` : undefined,
  });
  const err = (key: keyof FormValues) => (attempted ? errors[key] : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    if (!valid) {
      toast(`Uzupełnij: ${missing.length ? missing.join(', ') : 'zaznaczone pola'}`);
      return;
    }
    await onSubmit(values);
  }

  const statusOptions = [
    { value: 'dostepne' as const, label: 'Dostępne', dot: 'var(--status-dostepne)' },
    { value: 'w_magazynie' as const, label: 'Magazyn', dot: 'var(--status-w_magazynie)' },
    { value: 'zarezerwowane' as const, label: 'Rezerw.', dot: 'var(--status-zarezerwowane)' },
    ...(mode === 'edit'
      ? [{ value: 'sprzedane' as const, label: 'Sprzedane', dot: 'var(--status-sprzedane)' }]
      : []),
  ];

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      <div className={styles.top}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Anuluj
        </button>
        <span className={styles.badge}>{badge}</span>
      </div>

      <h1 className={styles.title}>{title}</h1>

      <PhotoStrip photos={photos} onChange={onPhotosChange} />
      {attempted && errors.photos && (
        <p className={ui.error} role="alert">
          {errors.photos}
        </p>
      )}

      <Field id="f-title" label="Tytuł" filled={filled('title')} error={err('title')}>
        <input {...input('title', true)} autoComplete="off" />
      </Field>
      <Field id="f-artist" label="Artysta" filled={filled('artist')} error={err('artist')}>
        <input {...input('artist', true)} autoComplete="off" />
      </Field>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legendRow}>
          <span className={ui.label}>Wymiary (cm)</span>
          {filled('w') && filled('h') ? (
            <span className={ui.requiredOk}>wymagane ✓</span>
          ) : (
            <span className={ui.required}>wymagane</span>
          )}
        </legend>
        <div className={styles.dims}>
          <input {...input('w', true)} inputMode="decimal" placeholder="szer." aria-label="Szerokość w cm" />
          <span aria-hidden="true">×</span>
          <input {...input('h', true)} inputMode="decimal" placeholder="wys." aria-label="Wysokość w cm" />
          <span aria-hidden="true">×</span>
          <input {...input('d')} inputMode="decimal" placeholder="gł." aria-label="Głębokość w cm (opcjonalnie)" />
        </div>
        {(err('w') || err('h') || err('d')) && (
          <p className={ui.error} role="alert">
            {err('w') ?? err('h') ?? err('d')}
          </p>
        )}
      </fieldset>

      <div className={ui.field}>
        <span className={ui.label}>Kategoria</span>
        <div className={styles.categories} role="group" aria-label="Kategoria">
          {entries(CATEGORY_LABELS).map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={values.category === v}
              className={`${ui.chip} ${values.category === v ? ui.chipOn : ''}`}
              onClick={() => set('category', v)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.priceRow}>
        <Field id="f-salePrice" label="Cena sprzedaży" filled={filled('salePrice')} error={err('salePrice')}>
          <input {...input('salePrice', true)} inputMode="decimal" />
        </Field>
        <div className={styles.currency}>
          <Segment
            label="Waluta"
            value={values.currency}
            onChange={(v) => set('currency', v)}
            options={[
              { value: 'PLN', label: 'zł' },
              { value: 'EUR', label: '€' },
            ]}
          />
        </div>
      </div>

      {isAdmin && (
        <section className={styles.private} aria-labelledby="priv-title">
          <div className={styles.privHead}>
            <h2 id="priv-title" className={styles.privTitle}>
              Ceny wewnętrzne
            </h2>
            <span className={styles.privNote}>widzi tylko admin</span>
          </div>
          <div className={ui.row}>
            <Field id="f-purchasePrice" label="Cena zakupu" error={err('purchasePrice')}>
              <input {...input('purchasePrice')} inputMode="decimal" />
            </Field>
            <Field id="f-minPrice" label="Cena minimalna" error={err('minPrice')}>
              <input {...input('minPrice')} inputMode="decimal" />
            </Field>
          </div>
        </section>
      )}

      <div className={ui.field}>
        <span className={ui.label}>Status</span>
        <Segment label="Status" value={values.status} onChange={(v) => set('status', v)} options={statusOptions} />
      </div>
      {values.status === 'zarezerwowane' && (
        <div className={ui.row}>
          <Field id="f-reservationUntil" label="Rezerwacja do" filled={filled('reservationUntil')} error={err('reservationUntil')}>
            <input {...input('reservationUntil', true)} type="date" />
          </Field>
          <Field id="f-reservationNote" label="Dla kogo / uwagi">
            <input {...input('reservationNote')} />
          </Field>
        </div>
      )}

      <div className={ui.field}>
        <span className={ui.label}>Lokalizacja</span>
        <Segment
          label="Lokalizacja"
          value={values.location}
          onChange={(v) => set('location', v)}
          options={[
            { value: 'sala_wystawowa', label: 'Sala wystawowa' },
            { value: 'magazyn', label: 'Magazyn' },
          ]}
        />
      </div>
      <div className={ui.field}>
        <span className={ui.label}>Podstawa</span>
        <Segment
          label="Podstawa"
          value={values.basis}
          onChange={(v) => set('basis', v)}
          options={[
            { value: 'komis', label: 'Komis' },
            { value: 'wlasnosc', label: 'Własność' },
          ]}
        />
      </div>

      {mode === 'edit' ? (
        <>
          <div className={ui.row}>
            <Field id="f-year" label="Rok" error={err('year')}>
              <input {...input('year')} inputMode="numeric" />
            </Field>
            <Field id="f-edition" label="Edycja" hint="np. 3/25">
              <input {...input('edition')} />
            </Field>
          </div>
          <Field id="f-technique" label="Technika" hint="np. olej na płótnie">
            <input {...input('technique')} />
          </Field>
          <Field id="f-material" label="Materiał / podłoże">
            <input {...input('material')} />
          </Field>
          <Field id="f-weightKg" label="Waga (kg)" error={err('weightKg')}>
            <input {...input('weightKg')} inputMode="decimal" />
          </Field>
          <Field id="f-description" label="Opis">
            <textarea {...input('description')} rows={4} />
          </Field>
        </>
      ) : (
        <p className={ui.hint}>
          Technika, rok, materiał, edycja, opis i certyfikat można uzupełnić później w edycji.
        </p>
      )}

      <div className={styles.sticky}>
        {missing.length > 0 && <p className={styles.missing}>Brakuje: {missing.join(', ')}</p>}
        <button
          type="submit"
          className={`${ui.btn} ${ui.primary} ${ui.block} ${!valid ? styles.notReady : ''}`}
          aria-disabled={!valid || undefined}
          disabled={saving}
        >
          {saving ? 'Zapisuję…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
