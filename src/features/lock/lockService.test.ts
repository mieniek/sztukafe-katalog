import { db } from '../../db/db';
import { LockService, MAX_PIN_FAILURES } from './lockService';

async function fresh() {
  await db.meta.clear();
  const lock = new LockService();
  await lock.start();
  return lock;
}

describe('LockService', () => {
  it('startuje odblokowana, dopóki blokada nie jest włączona', async () => {
    const lock = await fresh();
    expect(lock.getState()).toMatchObject({ ready: true, enabled: false, locked: false });
  });

  it('nie pozwala włączyć blokady bez Face ID ani PIN-u', async () => {
    const lock = await fresh();
    await expect(lock.enable()).rejects.toThrow(/Face ID albo kod PIN/);
  });

  it('PIN: zapisuje hash (nie sam kod), poprawny odblokowuje, błędny nie', async () => {
    const lock = await fresh();
    await expect(lock.setPin('12')).rejects.toThrow();
    await lock.setPin('4821');
    const stored = JSON.stringify((await db.meta.get('lock.pin'))?.value);
    expect(stored).not.toContain('4821');

    expect(await lock.verifyPin('4821')).toBe(true);
    expect(await lock.verifyPin('0000')).toBe(false);
  });

  it('po 5 błędnych próbach PIN-u blokuje kolejne próby na chwilę', async () => {
    const lock = await fresh();
    await lock.setPin('4821');
    for (let i = 0; i < MAX_PIN_FAILURES; i++) await lock.verifyPin('0000');
    expect(lock.penaltySeconds()).toBeGreaterThan(0);
    expect(await lock.verifyPin('4821')).toBe(false); // nawet poprawny PIN czeka
  });

  it('po włączeniu i restarcie aplikacja startuje zablokowana', async () => {
    const lock = await fresh();
    await lock.setPin('4821');
    await lock.enable();
    expect(lock.getState().locked).toBe(false);

    const afterRestart = new LockService();
    await afterRestart.start();
    expect(afterRestart.getState()).toMatchObject({ enabled: true, locked: true, hasPin: true });
    afterRestart.unlock();
    expect(afterRestart.getState().locked).toBe(false);
  });

  it('usunięcie ostatniej metody odblokowania wyłącza blokadę', async () => {
    const lock = await fresh();
    await lock.setPin('4821');
    await lock.enable();
    await lock.removePin();
    expect(lock.getState().enabled).toBe(false);
  });
});
