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
import { listIssues } from "./issue-io";
import { reportFilePrefixes, roleKeys, type Role } from "./protocol";

interface EntrySummary {
  role: Role;
  key: string;
  status: string;
  brief: string;
  attempt: number;
  blockedOn?: string | null;
}

type CurrentEntry = Pick<EntrySummary, "role" | "key" | "status" | "brief">;

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

  for (const rk of roleKeys()) {
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

function nextHint(currentEntry: CurrentEntry | null, recommendedNextAction: string): string {
  if (!currentEntry) return "";
  return `📍 当前身份: ${currentEntry.key} (${currentEntry.role})\n   当前 status: ${currentEntry.status}\n   建议:${recommendedNextAction}`;
}

function listReports(repo: string, uuid: string): string[] {
  const dir = waveDir(repo, uuid);
  if (!existsSync(dir)) return [];
  const prefixes = roleKeys()
    .map((role) => reportFilePrefixes[role])
    .join("|");
  const reportPattern = new RegExp(`^(${prefixes})-.*\\.md$`);
  return readdirSync(dir)
    .filter((f) => reportPattern.test(f))
    .map((f) => ({ name: f, mtime: statSync(`${dir}/${f}`).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((x) => `  ${humanAgo(new Date(x.mtime).toISOString()).padEnd(8)}  ${x.name}`);
}

function listSubPlans(repo: string, uuid: string): string[] {
  const dir = waveDir(repo, uuid);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^plan-[^/\\]+\.md$/i.test(f))
    .sort();
}

function findMatchingSubPlan(subPlans: string[], key?: string | null): string | null {
  if (!key) return null;
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const plan of subPlans) {
    const normalizedPlan = plan
      .replace(/^plan-/i, "")
      .replace(/\.md$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    if (normalizedPlan && (normalizedKey.includes(normalizedPlan) || normalizedPlan.includes(normalizedKey))) {
      return plan;
    }
  }
  return null;
}

function buildIdleStations(task: Task): Record<string, Array<{ stationName: string; brief: string; blockedOn?: string | null }>> {
  const idleStations: Record<string, Array<{ stationName: string; brief: string; blockedOn?: string | null }>> = {};
  for (const rk of roleKeys()) {
    const entries = task[rk] ?? {};
    for (const [name, e] of Object.entries(entries)) {
      const entry = e as any;
      if (entry.status === "idle" && (entry.attempt ?? 0) === 0) {
        if (!idleStations[rk]) idleStations[rk] = [];
        idleStations[rk].push({
          stationName: name,
          brief: entry.brief ?? "",
          ...(rk === "developer" && entry.blocked_on ? { blockedOn: entry.blocked_on } : {}),
        });
      }
    }
  }
  return idleStations;
}

function summarizeEntry(role: Role, key: string, entry: unknown): EntrySummary {
  const e = entry as Record<string, unknown>;
  return {
    role,
    key,
    status: typeof e.status === "string" ? e.status : "",
    brief: typeof e.brief === "string" ? e.brief : "",
    attempt: typeof e.attempt === "number" ? e.attempt : 0,
    ...(role === "developer" ? { blockedOn: e.blocked_on as string | null | undefined } : {}),
  };
}

function findCurrentEntry(task: Task, cwd: string): CurrentEntry | null {
  for (const rk of roleKeys()) {
    const entries = task[rk] ?? {};
    for (const [name, e] of Object.entries(entries)) {
      const entry = e as any;
      if (entry.cwd === cwd) {
        const summary = summarizeEntry(rk, name, entry);
        return {
          role: summary.role,
          key: summary.key,
          status: summary.status,
          brief: summary.brief,
        };
      }
    }
  }
  // Fallback: match by key name
  for (const rk of roleKeys()) {
    const entry = task[rk]?.[cwd];
    if (entry) {
      const summary = summarizeEntry(rk, cwd, entry);
      return {
        role: summary.role,
        key: summary.key,
        status: summary.status,
        brief: summary.brief,
      };
    }
  }
  return null;
}

function buildEligibleReviewTargets(task: Task): EntrySummary[] {
  return Object.entries(task.developer ?? {})
    .filter(([, entry]) => entry.status === "waiting_review")
    .map(([key, entry]) => summarizeEntry("developer", key, entry));
}

function buildTesterBlockedBy(task: Task): EntrySummary[] {
  return Object.entries(task.developer ?? {})
    .filter(([, entry]) => entry.status !== "review_approved")
    .map(([key, entry]) => summarizeEntry("developer", key, entry));
}

function buildIntegratorBlockedBy(task: Task): EntrySummary[] {
  const blockers: EntrySummary[] = [];
  for (const role of roleKeys().filter((rk) => rk !== "integrator")) {
    for (const [key, entry] of Object.entries(task[role] ?? {})) {
      const summary = summarizeEntry(role, key, entry);
      if (summary.status === "blocked" || summary.status !== "done") {
        blockers.push(summary);
      }
    }
  }
  return blockers;
}

function shortList(entries: EntrySummary[], max = 3): string {
  const shown = entries.slice(0, max).map((entry) => `${entry.key}(${entry.status})`);
  const suffix = entries.length > max ? ` 等 ${entries.length} 项` : "";
  return shown.join(", ") + suffix;
}

function buildRecommendedNextAction(
  currentEntry: CurrentEntry | null,
  eligibleReviewTargets: EntrySummary[],
  testerBlockedBy: EntrySummary[],
  integratorBlockedBy: EntrySummary[],
): string {
  if (!currentEntry) return "当前 cwd 未匹配角色；先注册角色或切换到对应 worktree。";

  if (currentEntry.role === "developer") {
    switch (currentEntry.status) {
      case "idle":
        return "读取 plan.md 与匹配子计划，开始 developer 工作。";
      case "working":
        return "继续实现，完成后先写 dev report 再转 waiting_review。";
      case "follow_issue":
        return "读取 owner 为自己的 open issue，修复后提交带 related_issue 的 dev report。";
      case "waiting_review":
        return "等待 reviewer 审查，可切换其他 worktree。";
      case "under_review":
        return "等待 reviewer 结论。";
      case "review_approved":
        return "等待 tester 接力。";
      case "review_rejected":
        return "读取最新 review，修复后再次提交 dev report。";
      case "blocked":
        return "读取 blocked_on/error，先解除阻塞。";
      case "done":
        return "当前 developer 已完成。";
      default:
        return "读取角色手册后按当前状态处理。";
    }
  }

  if (currentEntry.role === "reviewer") {
    if (eligibleReviewTargets.length > 0) {
      return `审查 waiting_review 交付: ${shortList(eligibleReviewTargets)}。`;
    }
    return "当前无 waiting_review developer，保持等待。";
  }

  if (currentEntry.role === "tester") {
    if (currentEntry.status === "done") return "当前 tester 已完成。";
    if (testerBlockedBy.length > 0) {
      return `等待 developer 通过审查: ${shortList(testerBlockedBy)}。`;
    }
    return "所有 developer 已通过审查，可以开始测试。";
  }

  if (currentEntry.role === "integrator") {
    if (currentEntry.status === "done") return "当前 integrator 已完成。";
    if (integratorBlockedBy.length > 0) {
      const shown = integratorBlockedBy.slice(0, 3).map((entry) => `${entry.role}.${entry.key}(${entry.status})`);
      const suffix = integratorBlockedBy.length > 3 ? ` 等 ${integratorBlockedBy.length} 项` : "";
      return `等待前置条目完成: ${shown.join(", ")}${suffix}。`;
    }
    return "所有前置条目已完成，可以开始集成。";
  }

  return "读取角色手册后按当前状态处理。";
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
  const eligibleReviewTargets = buildEligibleReviewTargets(task);
  const testerBlockedBy = buildTesterBlockedBy(task);
  const integratorBlockedBy = buildIntegratorBlockedBy(task);
  const recommendedNextAction = buildRecommendedNextAction(
    current,
    eligibleReviewTargets,
    testerBlockedBy,
    integratorBlockedBy,
  );

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

  const subPlans = listSubPlans(task.repo, uuid!);
  if (subPlans.length > 0) {
    out += `SubPlans:\n`;
    for (const plan of subPlans) out += `  - ${plan}\n`;
    const matchedSubPlan = findMatchingSubPlan(subPlans, hlKey);
    if (matchedSubPlan) out += `Current SubPlan: ${matchedSubPlan}\n`;
  }

  if (task.draft) {
    const draftExists = existsSync(fromKanbanRel(task.draft));
    out += `Draft:   ${task.draft}${draftExists ? "" : "  (文件不存在,仅作记录)"}\n`;
  }

  out += `Created: ${fmtTime(task.created)}\n`;
  out += `Updated: ${fmtTime(task.updated)}\n`;

  out += "\nEntries:\n";
  out += renderEntryTable(task, hlKey) + "\n";

  const hint = nextHint(current, recommendedNextAction);
  if (hint) out += "\n" + hint + "\n";

  const openIssues = listIssues(task.repo, uuid!, { status: "open" });
  if (openIssues.length > 0) {
    out += "\nOpen Issues:\n";
    for (const issue of openIssues.slice(0, 10)) {
      const owner = issue.owner ? ` owner=${issue.owner}` : "";
      const summary = issue.summary ? ` — ${issue.summary.slice(0, 120)}` : "";
      out += `  - ${issue.file}${owner}: ${issue.title}${summary}\n`;
    }
  }

  const reports = listReports(task.repo, uuid!);
  if (reports.length > 0) {
    out += "\n最近报告:\n" + reports.slice(0, 10).join("\n") + "\n";
  }

  if (!existsSync(waveDir(task.repo, uuid!))) {
    out += `\n⚠️  警告:任务目录不存在(${waveDir(task.repo, uuid!)}),kanban.json 与文件系统不一致\n`;
  }

  // 结构化数据输出
  const idleStations = buildIdleStations(task);
  const jsonBlock = JSON.stringify({
    currentEntry: current,
    idleStations,
    eligibleReviewTargets,
    testerBlockedBy,
    integratorBlockedBy,
    recommendedNextAction,
  });
  out += `\n\0JSON\n${jsonBlock}\n`;

  console.log(out);
}

main().catch((err) => {
  console.error("❌ query 失败:", err?.message ?? err);
  process.exit(1);
});
