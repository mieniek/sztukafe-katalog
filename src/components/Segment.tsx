import ui from '../styles/ui.module.css';

interface Option<T extends string> {
  value: T;
  label: string;
  /** Kolor kropki przed etykietą (np. kolor statusu). */
  dot?: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** Przełącznik segmentowy (jak w designie): jedna opcja aktywna. */
export function Segment<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <div className={ui.segment} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`${ui.segmentBtn} ${o.value === value ? ui.segmentOn : ''}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.dot && <span className={ui.dot} style={{ background: o.dot }} aria-hidden="true" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}
