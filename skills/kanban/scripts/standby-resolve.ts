#!/usr/bin/env bun
/**
 * Resolve the current cwd to a standby-capable role entry.
 *
 * Pure read. Used by Agent-side `/kanban --standby` flow before entering the
 * foreground standby loop.
 */
import { basename } from "path";
import { resolveSingleActiveEntryForCwd } from "./standby-state";

async function main() {
  const entry = await resolveSingleActiveEntryForCwd(basename(process.cwd()));
  if (entry.role === "integrator") {
    throw new Error("v1 不支持 integrator --standby");
  }
  console.log(JSON.stringify({
    ok: true,
    thread: entry.uuid,
    threadShort: entry.uuid.slice(0, 8),
    role: entry.role,
    key: entry.key,
    status: entry.status,
    attempt: entry.attempt,
    description: entry.task.description,
  }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
