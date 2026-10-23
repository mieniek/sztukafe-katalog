import type { DriveApi, DriveFile } from './driveApi';
import { SETTINGS_FILE, type DriveFolders, type RemoteSettings } from './remoteFormat';

export function formatInvNo(year: number, n: number): string {
  return `SZK-${year}-${String(n).padStart(4, '0')}`;
}

export async function readSettings(
  drive: DriveApi,
  folders: DriveFolders,
): Promise<{ file?: DriveFile; data: RemoteSettings }> {
  const file = await drive.findFile(SETTINGS_FILE, folders.configId);
  if (!file) return { data: { version: 0, counter: {} } };
  const data = await drive.readJson<RemoteSettings>(file.id);
  return { file, data: { ...data, version: data.version ?? 0, counter: data.counter ?? {} } };
}

/**
 * Nadaje kolejny numer inwentarzowy z licznika w config/settings.json.
 * Dysk nie ma zapisu warunkowego, więc: odczyt → zapis z wyższą `version` → odczyt kontrolny.
 * Jeśli ktoś zdążył wpisać swoje w międzyczasie, kontrola zwykle to wykryje i bierzemy następny numer.
 * To zmniejsza ryzyko wyścigu, ale go nie eliminuje (Dysk nie ma zapisu warunkowego), dlatego
 * powtórzone numery wykrywa `findDuplicateInvNos` i można je naprawić w Ustawieniach.
 */
export async function reserveInvNo(
  drive: DriveApi,
  folders: DriveFolders,
  year: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await readSettings(drive, folders);
    const n = (current.data.counter[year] ?? 0) + 1;
    const next: RemoteSettings = {
      ...current.data,
      version: current.data.version + 1,
      counter: { ...current.data.counter, [year]: n },
    };
    await drive.writeJson({
      name: SETTINGS_FILE,
      parentId: folders.configId,
      data: next,
      fileId: current.file?.id,
    });
    const check = await readSettings(drive, folders);
    if (check.data.version === next.version && check.data.counter[year] === n) {
      return formatInvNo(year, n);
    }
    await sleep(100 + Math.random() * 400 * (attempt + 1));
  }
  throw new Error('Nie udało się nadać numeru inwentarzowego. Spróbuj ponownie za chwilę.');
}
