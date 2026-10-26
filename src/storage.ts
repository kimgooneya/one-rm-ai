import Storage from "expo-sqlite/kv-store";
import { decodeLogbook, type Logbook } from "./domain";
const KEY = "lift-notebook:v1";
export async function loadLogbook(): Promise<Logbook> {
  const raw = await Storage.getItem(KEY);
  return raw === null ? { version: 1, sessions: [] } : decodeLogbook(raw);
}
export async function saveLogbook(logbook: Logbook): Promise<void> {
  // Validate before writing; failed/corrupt loads never silently overwrite data.
  const raw = JSON.stringify(logbook);
  decodeLogbook(raw);
  await Storage.setItem(KEY, raw);
}
