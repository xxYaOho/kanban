import { resolve } from "path";
import { fileURLToPath } from "url";

export function isCliEntry(metaUrl: string): boolean {
  const entry = Bun.argv[1];
  if (!entry) return false;
  return resolve(entry) === fileURLToPath(metaUrl);
}
