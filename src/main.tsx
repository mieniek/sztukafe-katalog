import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { requestPersistentStorage } from './db/db';
import { refreshEurRate } from './db/rates';
import { syncService } from './sync/syncService';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/global.css';

registerSW({ immediate: true });
void requestPersistentStorage();
void syncService.start();

// Kurs EUR z NBP: przy starcie, po odzyskaniu sieci i po powrocie do aplikacji (rzadziej niż co 6 h i tak nie pobiera).
void refreshEurRate();
window.addEventListener('online', () => void refreshEurRate());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshEurRate();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
