#!/usr/bin/env bun
/**
 * /kanban --role 实现
 *
 * 参数:
 *   --worktree <name>   当前 worktree 名(由 Agent 层传入 basename(pwd))
 *   --role <role>       developer | reviewer | test
 *   --action <action>   worktree 职责描述(非空)
 *   --uuid <uuid>       目标任务 UUID(完整或短前缀,Agent 层已解析)
 *
 * stdout: JSON { ok, worktree, role, action, taskUuid, taskShort }
 * 冲突/错误: exit 1 + stderr
 */
import { withKanbanLock } from "./kanban-lock";
import { resolveUuid, type Kanban, type WorktreeRole, type WorktreeStatus, VALID_ROLES, TERMINAL_STATUSES } from "./kanban-io";

const _validRoleSet = new Set<WorktreeRole>(VALID_ROLES);
const _terminalSet = new Set<string>(TERMINAL_STATUSES);

interface Args {
  worktree: string;
  role: WorktreeRole;
  action: string;
  uuid: string;
}

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--worktree": a.worktree = v; i++; break;
      case "--role": a.role = v as WorktreeRole; i++; break;
      case "--action": a.action = v; i++; break;
      case "--uuid": a.uuid = v; i++; break;
    }
  }
  if (!a.worktree) throw new Error("缺参: --worktree");
  if (!a.role || !_validRoleSet.has(a.role)) throw new Error(`非法 role: ${a.role}`);
  if (!a.action || !a.action.trim()) throw new Error("--action 不能为空");
  if (!a.uuid) throw new Error("缺参: --uuid");
  return a as Args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let resultUuid = args.uuid;

  await withKanbanLock(async (kanban: Kanban) => {
    // 解析 uuid
    let uuid = kanban[args.uuid] ? args.uuid : undefined;
    if (!uuid) {
      const matches = resolveUuid(kanban, args.uuid);
      if (matches.length === 0) throw new Error(`找不到任务: ${args.uuid}`);
      if (matches.length > 1) {
        throw new Error(
          `UUID 前缀 ${args.uuid} 多候选: ${matches.join(", ")}`,
        );
      }
      uuid = matches[0];
    }
    resultUuid = uuid;

    const task = kanban[uuid];
    if (!task) throw new Error(`找不到任务: ${uuid}`);

    if (_terminalSet.has(task.status)) {
      throw new Error(`任务 ${uuid.slice(0, 8)} 已处于终态 [${task.status}],无法注册 worktree`);
    }

    const existing = task.worktree[args.worktree];

    if (existing) {
      // 冲突处理
      if (existing.role !== args.role) {
        throw new Error(
          `ROLE_CONFLICT:worktree ${args.worktree} 已注册为 ${existing.role},` +
            `跨角色切换请走: /kanban --update ${uuid.slice(0, 8)} worktree.${args.worktree}.role=${args.role}`,
        );
      }
      // 同角色:幂等刷新 action
      existing.action = args.action;
    } else {
      // 新建
      task.worktree[args.worktree] = {
        role: args.role,
        action: args.action,
        status: "idle" as WorktreeStatus,
        attempt: 0,
        report: null,
        review: null,
        test: null,
        error: null,
        blocked_on: null,
      };
    }
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        worktree: args.worktree,
        role: args.role,
        action: args.action,
        taskUuid: resultUuid,
        taskShort: resultUuid.slice(0, 8),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("❌ role 失败:", err?.message ?? err);
  process.exit(1);
});
