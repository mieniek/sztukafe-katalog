import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { ToastProvider } from '../components/Toast';
import { LockGate } from '../features/lock/LockGate';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ArtworkListPage } from '../features/artworks/ArtworkListPage';

// Ekrany ładują się dopiero przy wejściu (mały start aplikacji); po pierwszym uruchomieniu wszystkie są w pamięci offline.
const NewArtworkPage = lazy(() => import('../features/artworks/NewArtworkPage').then((m) => ({ default: m.NewArtworkPage })));
const ArtworkPage = lazy(() => import('../features/artworks/ArtworkPage').then((m) => ({ default: m.ArtworkPage })));
const EditArtworkPage = lazy(() => import('../features/artworks/EditArtworkPage').then((m) => ({ default: m.EditArtworkPage })));
const DocumentsPage = lazy(() => import('../features/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SyncSettingsPage = lazy(() => import('../features/settings/SyncSettingsPage').then((m) => ({ default: m.SyncSettingsPage })));
const ConflictsPage = lazy(() => import('../features/settings/ConflictsPage').then((m) => ({ default: m.ConflictsPage })));
const UsersPage = lazy(() => import('../features/settings/UsersPage').then((m) => ({ default: m.UsersPage })));
const BackupsPage = lazy(() => import('../features/settings/BackupsPage').then((m) => ({ default: m.BackupsPage })));
const SecurityPage = lazy(() => import('../features/settings/SecurityPage').then((m) => ({ default: m.SecurityPage })));
const RatePage = lazy(() => import('../features/settings/RatePage').then((m) => ({ default: m.RatePage })));
const ImportPage = lazy(() => import('../features/import/ImportPage').then((m) => ({ default: m.ImportPage })));

export function App() {
  return (
    <ToastProvider>
      <LockGate>
        <HashRouter>
          <Suspense fallback={null}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="katalog" element={<ArtworkListPage />} />
              <Route path="nowe" element={<NewArtworkPage />} />
              <Route path="dzielo/:id" element={<ArtworkPage />} />
              <Route path="dzielo/:id/edycja" element={<EditArtworkPage />} />
              <Route path="dokumenty" element={<DocumentsPage />} />
              <Route path="ustawienia" element={<SettingsPage />} />
              <Route path="ustawienia/synchronizacja" element={<SyncSettingsPage />} />
              <Route path="ustawienia/konflikty" element={<ConflictsPage />} />
              <Route path="ustawienia/uzytkownicy" element={<UsersPage />} />
              <Route path="ustawienia/kopie" element={<BackupsPage />} />
              <Route path="ustawienia/import" element={<ImportPage />} />
              <Route path="ustawienia/kurs" element={<RatePage />} />
              <Route path="ustawienia/bezpieczenstwo" element={<SecurityPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </Suspense>
        </HashRouter>
      </LockGate>
    </ToastProvider>
  );
}
