#!/usr/bin/env bun
/**
 * /kanban --thread <id>
 *
 * 纯读,不加锁。展示任务全貌与下一步建议。
 */
import { basename } from "path";
import { readdirSync, statSync, existsSync } from "fs";
import { readKanban, resolveUuid, type Task } from "./kanban-io";
import { fromKanbanRel, waveDir } from "./paths";

const ROLE_KEYS = ["developer", "reviewer", "test", "integrator"] as const;

const BANNER_ICON: Record<string, string> = {
  draft: "📋",
  planned: "📋",
  in_progress: "📋",
  done: "✅",
  archived: "📦",
  aborted: "❌",
};

function fmtTime(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = d.getTimezoneOffset();
  const sign = off <= 0 ? "+" : "-";
  const absOff = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${sign}${pad(Math.floor(absOff / 60))}:${pad(absOff % 60)}`;
}

function humanAgo(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const m = Math.floor(delta / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
}

function padRight(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}

function renderEntryTable(task: Task, hlKey?: string | null): string {
  const headers = ["Entry", "Role", "Status", "Attempt", "CWD", "Reports"];
  const rows: string[][] = [headers];

  for (const rk of ROLE_KEYS) {
    const entries = task[rk] ?? {};
    for (const [name, e] of Object.entries(entries)) {
      const entry = e as any;
      const cwdDisplay = entry.cwd == null ? "-" : entry.cwd === name ? "(same)" : entry.cwd;

      let reportsSummary = "-";
      if (rk === "developer" && Array.isArray(entry.reports)) {
        reportsSummary = entry.reports.length > 0 ? String(entry.reports.length) : "-";
      } else if (entry.report) {
        reportsSummary = "1";
      }

      rows.push([
        name + (name === hlKey ? " ←" : ""),
        rk,
        entry.status ?? "-",
        entry.attempt != null ? String(entry.attempt) : "-",
        cwdDisplay,
        reportsSummary,
      ]);
    }
  }

  if (rows.length === 1) return "(无条目)\n";

  const widths = headers.map((_, col) =>
    rows.reduce((m, r) => Math.max(m, (r[col] ?? "").length), 0),
  );
  return rows
    .map((r, idx) => {
      const line = r.map((c, i) => padRight(c ?? "", widths[i])).join("  ");
      if (idx === 0) return line + "\n" + widths.map((w) => "-".repeat(w)).join("  ");
      return line;
    })
    .join("\n");
}

function nextHint(task: Task, hlKey?: string | null, hlRole?: string | null): string {
  if (!hlKey || !hlRole) return "";
  const entries = (task as any)[hlRole] ?? {};
  const e = entries[hlKey];
  if (!e) return "";
  const status = e.status ?? "";

  const devHints: Record<string, string> = {
    idle: "读 plan,依 brief 开工,完成后写 report 并转 waiting_review",
    working: "继续未完成的工作",
    waiting_review: "等 reviewer。可以切到其他 worktree",
    under_review: "审查中，等待 reviewer 结论",
    review_approved: "等 test 接力",
    review_rejected: "读最新 review,依据修改,attempt+1",
    blocked: "读 blocked_on,先解阻塞",
    done: "无事可做",
  };
  const reviewerHints: Record<string, string> = {
    idle: "检查 developer waiting_review,开始审查",
    working: "继续审查",
    done: "审查完成",
  };
  const testHints: Record<string, string> = {
    idle: "若所有 dev 都 review_approved,合并测试",
    working: "继续测试",
    waiting: "等待 dev 修复后回测",
    done: "测试通过",
  };
  const integratorHints: Record<string, string> = {
    idle: "若测试通过,合并分支集成",
    working: "继续集成",
    done: "集成完成",
  };

  let tip = "(无默认建议,人工决定)";
  if (hlRole === "developer") tip = devHints[status] ?? tip;
  else if (hlRole === "reviewer") tip = reviewerHints[status] ?? tip;
  else if (hlRole === "test") tip = testHints[status] ?? tip;
  else if (hlRole === "integrator") tip = integratorHints[status] ?? tip;

  return `📍 当前身份: ${hlKey} (${hlRole})\n   当前 status: ${status}\n   建议:${tip}`;
}

function listReports(repo: string, uuid: string): string[] {
  const dir = waveDir(repo, uuid);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^(report|review|test|integration)-.*\.md$/.test(f))
    .map((f) => ({ name: f, mtime: statSync(`${dir}/${f}`).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((x) => `  ${humanAgo(new Date(x.mtime).toISOString()).padEnd(8)}  ${x.name}`);
}

function buildIdleStations(task: Task): Record<string, Array<{ stationName: string; brief: string }>> {
  const idleStations: Record<string, Array<{ stationName: string; brief: string }>> = {};
  for (const rk of ROLE_KEYS) {
    const entries = task[rk] ?? {};
    for (const [name, e] of Object.entries(entries)) {
      const entry = e as any;
      if (entry.status === "idle" && (entry.attempt ?? 0) === 0) {
        if (!idleStations[rk]) idleStations[rk] = [];
        idleStations[rk].push({ stationName: name, brief: entry.brief ?? "" });
      }
    }
  }
  return idleStations;
}

function findCurrentEntry(task: Task, cwd: string): { key: string; role: string } | null {
  for (const rk of ROLE_KEYS) {
    const entries = task[rk] ?? {};
    for (const [name, e] of Object.entries(entries)) {
      const entry = e as any;
      if (entry.cwd === cwd) return { key: name, role: rk };
    }
  }
  // Fallback: match by key name
  for (const rk of ROLE_KEYS) {
    if (task[rk]?.[cwd]) return { key: cwd, role: rk };
  }
  return null;
}

async function main() {
  const [uuidPrefix] = process.argv.slice(2);
  if (!uuidPrefix) { console.error("用法:query.ts <uuid>"); process.exit(1); }

  const kanban = await readKanban();
  let uuid: string | undefined;

  if (kanban[uuidPrefix]) {
    uuid = uuidPrefix;
  } else {
    const matches = resolveUuid(kanban, uuidPrefix);
    if (matches.length === 0) {
      const recent = Object.entries(kanban)
        .sort((a, b) => new Date(b[1].updated ?? b[1].created).getTime() - new Date(a[1].updated ?? a[1].created).getTime())
        .slice(0, 5);
      console.error(`❌ 找不到任务: ${uuidPrefix}`);
      if (recent.length > 0) {
        console.error("最近任务:");
        for (const [u, t] of recent) console.error(`  ${u.slice(0, 8)}  [${t.status}]  ${t.description}`);
      }
      process.exit(3);
    }
    if (matches.length > 1) {
      console.error(`⚠️  UUID 前缀 ${uuidPrefix} 多候选:`);
      for (const u of matches) console.error(`  ${u.slice(0, 8)}  [${kanban[u].status}]  ${kanban[u].description}`);
      process.exit(2);
    }
    uuid = matches[0];
  }

  const task = kanban[uuid!];
  const short = uuid!.slice(0, 8);
  const cwd = basename(process.cwd());
  const current = findCurrentEntry(task, cwd);
  const hlKey = current?.key ?? null;
  const hlRole = current?.role ?? null;

  const icon = BANNER_ICON[task.status] ?? "📋";
  const tag = task.status === "draft" ? "DRAFT" : task.status;
  let out = `${icon} Task ${short}  [${tag}]  (${task.description})\n`;

  if (task.status === "draft") {
    out += `⚠️  此任务仍在草案阶段,条目可能未分配。\n`;
    out += `    完善后运行:/kanban --update ${short} status=planned\n`;
  }

  out += "\n";
  out += `Repo:    ${task.repo}\n`;
  out += `Plan:    ${task.plan}\n`;

  if (task.draft) {
    const draftExists = existsSync(fromKanbanRel(task.draft));
    out += `Draft:   ${task.draft}${draftExists ? "" : "  (文件不存在,仅作记录)"}\n`;
  }

  out += `Created: ${fmtTime(task.created)}\n`;
  out += `Updated: ${fmtTime(task.updated)}\n`;

  out += "\nEntries:\n";
  out += renderEntryTable(task, hlKey) + "\n";

  const hint = nextHint(task, hlKey, hlRole);
  if (hint) out += "\n" + hint + "\n";

  const reports = listReports(task.repo, uuid!);
  if (reports.length > 0) {
    out += "\n最近报告:\n" + reports.slice(0, 10).join("\n") + "\n";
  }

  if (!existsSync(waveDir(task.repo, uuid!))) {
    out += `\n⚠️  警告:任务目录不存在(${waveDir(task.repo, uuid!)}),kanban.json 与文件系统不一致\n`;
  }

  // 结构化数据输出
  const idleStations = buildIdleStations(task);
  const jsonBlock = JSON.stringify({ idleStations });
  out += `\n\0JSON\n${jsonBlock}\n`;

  console.log(out);
}

main().catch((err) => {
  console.error("❌ query 失败:", err?.message ?? err);
  process.exit(1);
});
