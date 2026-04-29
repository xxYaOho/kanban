/**
 * /kanban 空指令实现
 *
 * stdout: 格式化的 help + active threads 文本
 * 无活跃任务 / kanban 未初始化时优雅降级
 */
import { readKanban, type Worktree, type Task } from "./kanban-io";

const SEP = "─".repeat(64);
const INDENT = "      ";

const STATUS_SYMBOL: Record<string, string> = {
  idle: "○",
  working: "✦",
  waiting_review: "◐",
  review_approved: "✓",
  review_rejected: "✗",
  done: "■",
  blocked: "⊘",
};

function stationLabel(key: string, wt: Partial<Worktree>): string {
  return wt.cwd && wt.cwd !== key ? `${key}@${wt.cwd}` : key;
}

function padRight(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
}

function renderThread(description: string, uuid: string, task: Task): string {
  const short = uuid.slice(0, 8);
  const entries = Object.entries(task.worktree ?? {});

  let out = "";
  out += `    ✤ ${description} [${task.status}]\n`;
  out += `${INDENT}id: ${short}\n`;
  out += `${INDENT}${SEP}\n`;
  out += `${INDENT}${padRight("Station", 32)}  ${padRight("Role", 12)}  Status\n`;
  out += `${INDENT}${SEP}\n`;

  for (const [key, w] of entries) {
    const wt = w as Partial<Worktree>;
    const label = stationLabel(key, wt);
    const symbol = STATUS_SYMBOL[wt.status ?? ""] ?? "?";
    out += `${INDENT}${padRight(label, 32)}  ${padRight(wt.role ?? "-", 12)}  ${symbol} ${wt.status ?? "-"}\n`;
  }

  return out;
}

async function main() {
  let activeCount = 0;
  let idleStationCount = 0;
  let threadBlocks = "";
  let kanbanReady = false;

  try {
    const kanban = await readKanban();
    kanbanReady = true;

    const active = Object.entries(kanban).filter(
      ([, t]) => t.status === "planned" || t.status === "in_progress",
    );

    activeCount = active.length;

    for (const [uuid, task] of active) {
      for (const w of Object.values(task.worktree ?? {})) {
        const wt = w as Partial<Worktree>;
        if (wt.status === "idle" && (wt.attempt ?? 0) === 0) idleStationCount++;
      }
      threadBlocks += renderThread(task.description, uuid, task) + "\n";
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("kanban.json 不存在")) {
      // 预期：未初始化，静默降级
    } else {
      console.error("⚠️  kanban 读取异常:", msg);
    }
  }

  // header
  let out = "";
  if (kanbanReady && activeCount > 0) {
    out += `📋 Kanban  ·  Active Threads: ${activeCount}  ·  Idle Stations: ${idleStationCount}\n\n`;
  } else {
    out += `📋 Kanban\n\n`;
  }

  // commands
  out += `Commands\n`;
  out += `${SEP}\n`;
  out += `  ${padRight("--new", 28)}${padRight("Create Thread", 22)} 创建任务\n`;
  out += `  ${padRight("--uuid <id>", 28)}${padRight("Thread Details", 22)} 查看任务详情\n`;
  out += `  ${padRight("--update <id> [ops]", 28)}${padRight("Agent Update Kanban", 22)} 由 Agent 更新看板\n`;
  out += `  ${padRight("--role <role>", 28)}${padRight("Get Role & Station", 22)} 获取角色与工作站\n`;
  out += `${SEP}\n`;

  // active threads
  out += `\nActive Threads\n`;
  out += `${SEP}\n`;

  if (!kanbanReady) {
    out += `  ⚠️  kanban 未初始化，运行 /kanban --init\n`;
  } else if (activeCount === 0) {
    out += `  (no active threads)\n`;
  } else {
    out += `\n${threadBlocks}`;
  }

  out += `${SEP}\n`;

  console.log(out);
}

main().catch((err: unknown) => {
  console.error("❌ help 失败:", err instanceof Error ? err.message : err);
  process.exit(1);
});
