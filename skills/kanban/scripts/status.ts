#!/usr/bin/env bun
/**
 * /kanban (空参) 或 /kanban --status:全局概览
 *
 * 纯读。按 status 分组输出所有任务摘要。
 */
import { readKanban } from "./kanban-io";

function humanAgo(iso?: string): string {
  if (!iso) return "?";
  const delta = Date.now() - new Date(iso).getTime();
  const m = Math.floor(delta / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

async function main() {
  const kanban = await readKanban();
  const byStatus: Record<string, Array<[string, any]>> = {};
  for (const [uuid, task] of Object.entries(kanban)) {
    (byStatus[task.status] ??= []).push([uuid, task]);
  }

  const order = ["in_progress", "planned", "draft", "done", "archived", "aborted"];
  let out = "";
  for (const s of order) {
    const items = byStatus[s] ?? [];
    if (items.length === 0) continue;
    out += `\n== ${s.toUpperCase()} (${items.length}) ==\n`;
    items.sort(
      (a, b) =>
        new Date(b[1].updated ?? b[1].created).getTime() -
        new Date(a[1].updated ?? a[1].created).getTime(),
    );
    for (const [uuid, task] of items) {
      const wc = Object.keys(task.worktree ?? {}).length;
      const active = Object.values(task.worktree ?? {}).filter(
        (w: any) => w.status === "working" || w.status === "waiting_review",
      ).length;
      out +=
        `  ${uuid.slice(0, 8)}  ${task.repo.padEnd(12)}  ` +
        `wt=${wc}` +
        (active > 0 ? `(active=${active})` : "") +
        `  updated ${humanAgo(task.updated ?? task.created)}  ` +
        `${task.description}\n`;
    }
  }
  if (!out) out = "(kanban 为空)\n";
  console.log(out);
}

main().catch((err) => {
  console.error("❌ status 失败:", err?.message ?? err);
  process.exit(1);
});
