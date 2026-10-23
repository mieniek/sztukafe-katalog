import { useNavigate } from 'react-router-dom';
import styles from './PageHeader.module.css';

interface Props {
  title: string;
  /** Dokąd wraca przycisk „‹ …”; domyślnie do poprzedniego ekranu. */
  backTo?: string;
  backLabel?: string;
}

/** Nagłówek ekranów szczegółowych: przycisk powrotu i tytuł. */
export function PageHeader({ title, backTo, backLabel = 'Wróć' }: Props) {
  const navigate = useNavigate();
  return (
    <header className={styles.header}>
      <button type="button" className={styles.back} onClick={() => (backTo ? navigate(backTo) : navigate(-1))}>
        ‹ {backLabel}
      </button>
      <h1 className={styles.title}>{title}</h1>
    </header>
  );
}
