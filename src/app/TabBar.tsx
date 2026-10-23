import { NavLink, useNavigate } from 'react-router-dom';
import styles from './TabBar.module.css';

const tab = ({ isActive }: { isActive: boolean }) => `${styles.tab} ${isActive ? styles.active : ''}`;

/** Pływający pasek zakładek: Pulpit · Katalog · [+] · Dokumenty · Ustawienia. */
export function TabBar() {
  const navigate = useNavigate();
  return (
    <nav className={styles.bar} aria-label="Menu główne">
      <NavLink to="/" end className={tab}>
        <span className={styles.mark} aria-hidden="true" />
        Pulpit
      </NavLink>
      <NavLink to="/katalog" className={tab}>
        <span className={styles.mark} aria-hidden="true" />
        Katalog
      </NavLink>
      <button type="button" className={styles.plus} aria-label="Nowe dzieło" onClick={() => navigate('/nowe')}>
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <path d="M11 3v16M3 11h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      <NavLink to="/dokumenty" className={tab}>
        <span className={styles.mark} aria-hidden="true" />
        Dokumenty
      </NavLink>
      <NavLink to="/ustawienia" className={tab}>
        <span className={styles.mark} aria-hidden="true" />
        Ustawienia
      </NavLink>
    </nav>
  );
}
