#!/usr/bin/env bun
/**
 * Agent 领域字段写入脚本。
 *
 * 用途：Agent 在单次 withKanbanLock 内原子更新 worktree 字段。
 * 所有 --set 操作在同一个锁内完成。
 *
 * 用法:
 *   bun run agent-write.ts --uuid <uuid> --worktree <name> --set key=value [...]
 *
 * --uuid      任务 UUID，支持短前缀（≥6 字符）
 * --worktree  目标 worktree 名（要写入的 worktree，不一定是 Agent 自己的）
 * --set       字段赋值，可多次传入。key 相对于 worktree.<name>.
 *             null 用字符串 "null" 表示。路径支持 ~/ 和 ~/.kanban/ 前缀。
 *
 * stdout: JSON { ok, taskUuid, taskShort, worktree, applied, taskStatus }
 * stderr + exit 1: 错误
 */
import { withKanbanLock } from "./kanban-lock";
import {
  resolveUuid,
  type Kanban,
  VALID_WORKTREE_STATUSES,
} from "./kanban-io";
import { fromKanbanRel } from "./paths";

// ── 白名单 ──────────────────────────────────────────────────────────────────

const AGENT_WRITABLE_FIELDS = new Set([
  "status",
  "attempt",
  "report",
  "review",
  "test",
  "integration",
  "error",
  "blocked_on",
]);

const VALID_INTEGRATION_VALUES = new Set([
  "pending",
  "merged",
  "conflict",
]);

// 只有路径类字段才展开 ~
const PATH_FIELDS = new Set(["report", "review", "test"]);

// ── 参数解析 ─────────────────────────────────────────────────────────────────

interface Op {
  key: string;
  raw: string;
}

interface Args {
  uuid: string;
  worktree: string;
  ops: Op[];
}

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> & { ops: Op[] } = { ops: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--uuid":
        if (!v) throw new Error("--uuid 缺少值");
        a.uuid = v;
        i++;
        break;
      case "--worktree":
        if (!v) throw new Error("--worktree 缺少值");
        a.worktree = v;
        i++;
        break;
      case "--set": {
        if (!v) throw new Error("--set 缺少值，格式: --set key=value");
        const eq = v.indexOf("=");
        if (eq === -1) throw new Error(`--set 格式错误: ${v}，应为 key=value`);
        a.ops.push({ key: v.slice(0, eq), raw: v.slice(eq + 1) });
        i++;
        break;
      }
      default:
        throw new Error(`未知参数: ${k}`);
    }
  }

  if (!a.uuid) throw new Error("缺少 --uuid");
  if (!a.worktree) throw new Error("缺少 --worktree");
  if (a.ops.length === 0) throw new Error("至少需要一个 --set");

  return a as Args;
}

// ── 值校验与转换 ─────────────────────────────────────────────────────────────

function parseValue(key: string, raw: string): unknown {
  // null 值
  if (raw === "null") return null;

  switch (key) {
    case "status": {
      if (!(VALID_WORKTREE_STATUSES as readonly string[]).includes(raw)) {
        throw new Error(
          `无效的 status: "${raw}"，合法值: ${VALID_WORKTREE_STATUSES.join(", ")}`,
        );
      }
      return raw;
    }
    case "attempt": {
      if (!/^\d+$/.test(raw)) {
        throw new Error(`attempt 必须是非负整数，收到: "${raw}"`);
      }
      const n = Number(raw);
      if (!Number.isSafeInteger(n)) {
        throw new Error(`attempt 数值过大: "${raw}"`);
      }
      return n;
    }
    case "integration": {
      // raw === "null" 已在函数开头处理
      if (!VALID_INTEGRATION_VALUES.has(raw)) {
        throw new Error(
          `无效的 integration: "${raw}"，合法值: null, pending, merged, conflict`,
        );
      }
      return raw;
    }
    default:
      // report / review / test 展开 ~；error / blocked_on 原样保留
      return PATH_FIELDS.has(key) ? fromKanbanRel(raw) : raw;
  }
}

// ── 主逻辑 ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(Bun.argv.slice(2));

  const result = await withKanbanLock((kanban: Kanban) => {
    // 1. 解析 UUID：先精确匹配，再前缀匹配（与 role.ts / update-task.ts 一致）
    let uuid = kanban[args.uuid] ? args.uuid : undefined;
    if (!uuid) {
      const matches = resolveUuid(kanban, args.uuid);
      if (matches.length === 0) {
        throw new Error(`未找到匹配的 UUID: "${args.uuid}"`);
      }
      if (matches.length > 1) {
        throw new Error(
          `UUID 前缀 "${args.uuid}" 匹配多个任务: ${matches.join(", ")}`,
        );
      }
      uuid = matches[0];
    }
    const task = kanban[uuid];

    // 2. 找到目标 worktree
    const wt = task.worktree?.[args.worktree];
    if (!wt) {
      const existing = Object.keys(task.worktree ?? {}).join(", ") || "(无)";
      throw new Error(
        `worktree "${args.worktree}" 不存在于任务 ${uuid.slice(0, 8)}。` +
          `现有 worktree: ${existing}`,
      );
    }

    // 3. 校验并应用 --set
    const applied: string[] = [];
    for (const op of args.ops) {
      if (!AGENT_WRITABLE_FIELDS.has(op.key)) {
        throw new Error(
          `字段 "${op.key}" 不在 Agent 可写白名单中。` +
            `可写字段: ${[...AGENT_WRITABLE_FIELDS].join(", ")}`,
        );
      }
      const value = parseValue(op.key, op.raw);
      (wt as Record<string, unknown>)[op.key] = value;
      applied.push(`${op.key}=${op.raw}`);
    }

    // 4. 返回结果（withKanbanLock 自动写回 + 刷新 updated）
    return {
      taskUuid: uuid,
      taskShort: uuid.slice(0, 8),
      worktree: args.worktree,
      applied,
      taskStatus: task.status,
    };
  });

  console.log(JSON.stringify({ ok: true, ...result }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
