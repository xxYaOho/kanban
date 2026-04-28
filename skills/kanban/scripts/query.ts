#!/usr/bin/env bun
/**
 * /kanban --uuid <uuid>
 *
 * 站在当前 worktree(若在)的视角,展示任务全貌与下一步建议。纯读,不加锁。
 *
 * stdout 末尾输出 JSON 块（以 \0JSON\n 为分隔,包含 idleSlots 等结构化数据）,
 * 供 Agent 层解析使用。
 */
import { basename } from "path";
import { readdirSync, statSync, existsSync } from "fs";
import { readKanban, resolveUuid, type Task, type Worktree } from "./kanban-io";
import { fromKanbanRel, waveDir } from "./paths";

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

function renderWorktreeTable(task: Task, hlName?: string): string {
  const rows: string[][] = [["Worktree", "Role", "Status", "Attempt", "CWD", "Latest Report"]];
  for (const [name, w] of Object.entries(task.worktree ?? {})) {
    const wt = w as Partial<Worktree>;
    const cwdDisplay = wt.cwd == null ? "-" : wt.cwd === name ? "(same)" : wt.cwd;
    rows.push([
      name + (name === hlName ? " ←" : ""),
      wt.role ?? "-",
      wt.status ?? "-",
      wt.attempt != null ? String(wt.attempt) : "-",
      cwdDisplay,
      wt.report ?? "-",
    ]);
  }
  const widths = rows[0].map((_, col) =>
    rows.reduce((m, r) => Math.max(m, r[col].length), 0),
  );
  return rows
    .map((r, idx) => {
      const line = r.map((c, i) => padRight(c, widths[i])).join("  ");
      if (idx === 0) return line + "\n" + widths.map((w) => "-".repeat(w)).join("  ");
      return line;
    })
    .join("\n");
}

function nextHint(task: Task, hlName?: string): string {
  if (!hlName || !task.worktree[hlName]) return "";
  const w = task.worktree[hlName] as Partial<Worktree>;
  const map: Record<string, Record<string, string>> = {
    developer: {
      idle: "读 plan,依 action 开工,完成后写 report 并转 waiting_review",
      working: "继续未完成的工作",
      waiting_review: "等 reviewer。可以切到其他 worktree",
      review_rejected: "读最新 review,依据修改,attempt+1",
      review_approved: "等 test 接力",
      blocked: "读 blocked_on,先解阻塞",
      done: "无事可做",
    },
    reviewer: {
      idle: "检查所有 developer waiting_review,拉 diff 做 review",
      working: "继续 review",
      done: "本任务评审已结束",
    },
    test: {
      idle: "若所有 dev 都 review_approved,拉分支跑测",
      working: "继续测试",
      done: "测试通过,任务收尾",
    },
  };
  const tip = (w.role && w.status && map[w.role]?.[w.status]) ?? "(无默认建议,人工决定)";
  return `📍 当前身份: ${hlName} (${w.role})\n   当前 status: ${w.status}\n   建议:${tip}`;
}

function listReports(repo: string, uuid: string): string[] {
  const dir = waveDir(repo, uuid);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^(report|review|test)-.*\.md$/.test(f))
    .map((f) => ({ name: f, mtime: statSync(`${dir}/${f}`).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((x) => `  ${humanAgo(new Date(x.mtime).toISOString()).padEnd(8)}  ${x.name}`);
}

function buildIdleSlots(task: Task): Record<string, Array<{ slotName: string; action: string }>> {
  const idleSlots: Record<string, Array<{ slotName: string; action: string }>> = {};
  for (const [wtName, wt] of Object.entries(task.worktree ?? {})) {
    const w = wt as Partial<Worktree>;
    if (w.status === "idle" && (w.attempt ?? 0) === 0 && w.role) {
      if (!idleSlots[w.role]) idleSlots[w.role] = [];
      idleSlots[w.role].push({ slotName: wtName, action: w.action ?? "" });
    }
  }
  return idleSlots;
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
  const hlKey = Object.keys(task.worktree).find(
    (k) => (task.worktree[k] as Partial<Worktree>).cwd === cwd,
  ) ?? (task.worktree[cwd] ? cwd : undefined);
  const hlName = hlKey;

  const icon = BANNER_ICON[task.status] ?? "📋";
  const tag = task.status === "draft" ? "DRAFT" : task.status;
  let out = `${icon} Task ${short}  [${tag}]  (${task.description})\n`;

  if (task.status === "draft") {
    out += `⚠️  此任务仍在草案阶段,worktree 可能未分配。\n`;
    out += `    完善后运行:/kanban --update ${short} status=planned\n`;
  }

  out += "\n";
  out += `Repo:    ${task.repo}\n`;
  out += `Plan:    ${task.plan}\n`;

  // draft 字段:低调展示,仅在非 null 时出现
  if (task.draft) {
    const draftExists = existsSync(fromKanbanRel(task.draft));
    out += `Draft:   ${task.draft}${draftExists ? "" : "  (文件不存在,仅作记录)"}\n`;
  }

  out += `Created: ${fmtTime(task.created)}\n`;
  out += `Updated: ${fmtTime(task.updated)}\n`;

  out += "\nWorktrees:\n";
  out += renderWorktreeTable(task, hlName) + "\n";

  const hint = nextHint(task, hlName);
  if (hint) out += "\n" + hint + "\n";

  const reports = listReports(task.repo, uuid!);
  if (reports.length > 0) {
    out += "\n最近报告:\n" + reports.slice(0, 10).join("\n") + "\n";
  }

  if (!existsSync(waveDir(task.repo, uuid!))) {
    out += `\n⚠️  警告:任务目录不存在(${waveDir(task.repo, uuid!)}),kanban.json 与文件系统不一致\n`;
  }

  // ── 结构化数据输出（供 Agent 层解析）──
  const idleSlots = buildIdleSlots(task);
  const jsonBlock = JSON.stringify({ idleSlots });
  out += `\n\0JSON\n${jsonBlock}\n`;

  console.log(out);
}

main().catch((err) => {
  console.error("❌ query 失败:", err?.message ?? err);
  process.exit(1);
});
