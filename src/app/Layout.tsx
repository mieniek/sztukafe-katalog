import { Outlet, useLocation } from 'react-router-dom';
import { TabBar } from './TabBar';
import { ReloginBanner } from './SyncIndicator';
import styles from './Layout.module.css';

/** Ścieżki, na których widać pływający pasek zakładek (karta dzieła, kreator itd. go chowają). */
const TAB_ROUTES = ['/', '/katalog', '/dokumenty', '/ustawienia'];

export function Layout() {
  const { pathname } = useLocation();
  const showTabs = TAB_ROUTES.includes(pathname.replace(/\/+$/, '') || '/');

  return (
    <div className={styles.shell}>
      <ReloginBanner />
      <main className={`${styles.main} ${showTabs ? styles.withTabs : ''}`}>
        <Outlet />
      </main>
      {showTabs && <TabBar />}
    </div>
  );
}
