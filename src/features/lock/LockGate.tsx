import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { LockScreen } from './LockScreen';
import { lockService } from './lockService';

export function useLockState() {
  return useSyncExternalStore(lockService.subscribe, lockService.getState);
}

/** Pokazuje zawartość aplikacji dopiero po odblokowaniu (jeśli blokada jest włączona). */
export function LockGate({ children }: { children: ReactNode }) {
  const state = useLockState();
  useEffect(() => {
    void lockService.start();
  }, []);

  if (!state.ready) return null; // krótka chwila wczytywania ustawień — tło aplikacji jest już ciemne
  if (state.enabled && state.locked) return <LockScreen />;
  return <>{children}</>;
}
