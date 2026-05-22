/**
 * /kanban 空指令实现
 *
 * stdout: 格式化的 help + active threads 文本
 */
import { readKanban, type Task } from "./kanban-io";
import { roleKeys } from "./protocol";

const SEP = "─".repeat(64);
const INDENT = "      ";

const STATUS_SYMBOL: Record<string, string> = {
  idle: "○",
  working: "✦",
  follow_issue: "!",
  waiting_review: "◐",
  under_review: "◑",
  review_approved: "✓",
  review_rejected: "✗",
  waiting: "⏳",
  done: "■",
  blocked: "⊘",
};

function padRight(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
}

function renderThread(description: string, uuid: string, task: Task): string {
  const short = uuid.slice(0, 8);
  const allEntries: Array<{ role: string; key: string; status: string; cwd: string | null }> = [];
  for (const rk of roleKeys()) {
    const entries = task[rk] ?? {};
    for (const [key, e] of Object.entries(entries)) {
      allEntries.push({
        role: rk,
        key,
        status: (e as any).status ?? "-",
        cwd: (e as any).cwd ?? null,
      });
    }
  }

  let out = "";
  out += `    ✤ ${description} [${task.status}]\n`;
  out += `${INDENT}id: ${short}\n`;
  out += `${INDENT}${SEP}\n`;
  out += `${INDENT}${padRight("Entry", 32)}  ${padRight("Role", 12)}  Status\n`;
  out += `${INDENT}${SEP}\n`;

  for (const e of allEntries) {
    const label = e.cwd && e.cwd !== e.key ? `${e.key}@${e.cwd}` : e.key;
    const symbol = STATUS_SYMBOL[e.status] ?? "?";
    out += `${INDENT}${padRight(label, 32)}  ${padRight(e.role, 12)}  ${symbol} ${e.status}\n`;
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
      for (const rk of roleKeys()) {
        const entries = task[rk] ?? {};
        for (const e of Object.values(entries) as any[]) {
          if (e.status === "idle" && (e.attempt ?? 0) === 0) idleStationCount++;
        }
      }
      threadBlocks += renderThread(task.description, uuid, task) + "\n";
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("kanban.json 不存在")) {
      console.error("⚠️  kanban 读取异常:", msg);
    }
  }

  let out = "";
  if (kanbanReady && activeCount > 0) {
    out += `📋 Kanban  ·  Active Threads: ${activeCount}  ·  Idle Stations: ${idleStationCount}\n\n`;
  } else {
    out += `📋 Kanban\n\n`;
  }

  out += `Commands\n`;
  out += `${SEP}\n`;
  out += `  ${padRight("--new", 28)}${padRight("Create Thread", 22)} 创建任务\n`;
  out += `  ${padRight("--thread <id>", 28)}${padRight("Thread Details", 22)} 查看任务详情\n`;
  out += `  ${padRight("--update <id> [ops]", 28)}${padRight("Agent Update Kanban", 22)} 由 Agent 更新看板\n`;
  out += `  ${padRight("--issue <open|done|closed>", 28)}${padRight("Issue Lifecycle", 22)} 测试问题流转\n`;
  out += `  ${padRight("--clear [<id>]", 28)}${padRight("Archive Thread", 22)} 归档终态任务\n`;
  out += `  ${padRight("--role <role>", 28)}${padRight("Get Role & Station", 22)} 获取角色与工作站\n`;
  out += `${SEP}\n`;

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
