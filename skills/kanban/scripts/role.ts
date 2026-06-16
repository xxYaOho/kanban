#!/usr/bin/env bun
/**
 * /kanban --role 实现
 *
 * 参数:
 *   --worktree <name>          worktree 名(developer 必填，其他 role 可选)
 *   --role <role>              developer | reviewer | tester | integrator
 *   --brief <brief>            职责描述(非空)
 *   --thread <uuid>            目标任务 UUID
 *   --claim-from <presetName>  可选:认领预分配席位(仅 developer)
 *
 * stdout: JSON { ok, worktree, role, brief, taskUuid, taskShort, autoStarted, autoStartReason? }
 */
import { withKanbanLock } from "./kanban-lock";
import {
  resolveUuid,
  type Kanban,
  type TaskStatus,
  TERMINAL_STATUSES,
} from "./kanban-io";
import { assertRole, type Role } from "./protocol";

const _terminalSet = new Set<string>(TERMINAL_STATUSES);

interface Args {
  worktree: string;
  role: Role;
  brief: string;
  uuid: string;
  claimFrom?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--worktree": a.worktree = v; i++; break;
      case "--role": a.role = assertRole(v); i++; break;
      case "--brief":
      case "--action": a.brief = v; i++; break; // --action 向后兼容
      case "--thread":
      case "--uuid": a.uuid = v; i++; break;
      case "--claim-from": a.claimFrom = v; i++; break;
    }
  }
  if (a.role === "developer" && !a.worktree) {
    throw new Error("developer 需要在 worktree 中注册，缺参: --worktree");
  }
  if (!a.worktree) a.worktree = "main";
  if (!a.role) throw new Error("缺参: --role");
  if (!a.brief || !a.brief.trim()) throw new Error("--brief 不能为空");
  if (!a.uuid) throw new Error("缺参: --thread");
  return a as Args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.claimFrom && args.claimFrom === args.worktree) {
    throw new Error("--claim-from 不能等于 --worktree（名称相同时无需认领，走 Path B 幂等即可）");
  }

  let resultUuid = args.uuid;
  let autoStarted = false;
  let autoStartReason: string | null = null;
  let claimedFrom: string | null = null;
  let existingKey: string | undefined;

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
      throw new Error(
        `任务 ${uuid.slice(0, 8)} 已处于终态 [${task.status}]，无法注册`,
      );
    }

    // ── 查找已有条目 ──
    if (args.role === "developer") {
      existingKey = Object.keys(task.developer).find(
        (k) => task.developer[k].cwd === args.worktree,
      ) ?? (task.developer[args.worktree] ? args.worktree : undefined);
    } else if (args.role === "reviewer") {
      existingKey = task.reviewer[args.worktree] ? args.worktree : undefined;
    } else if (args.role === "tester") {
      existingKey = task.tester[args.worktree] ? args.worktree : undefined;
    } else if (args.role === "integrator") {
      existingKey = task.integrator[args.worktree] ? args.worktree : undefined;
    }

    // ── Developer claim-from ──
    if (args.claimFrom && args.role === "developer") {
      const preset = task.developer[args.claimFrom];
      if (!preset) {
        throw new Error(`预分配席位 ${args.claimFrom} 不存在`);
      }
      if (preset.status !== "idle" || preset.attempt > 0) {
        throw new Error(
          `席位 ${args.claimFrom} 已被认领 (status=${preset.status}, attempt=${preset.attempt})`,
        );
      }
      if (existingKey) {
        throw new Error(
          `当前 worktree ${args.worktree} 已在任务中注册（key=${existingKey}），无法同时认领席位`,
        );
      }
      preset.cwd = args.worktree;
      preset.worktree = args.worktree;
      preset.attempt = 1;
      preset.brief = args.brief;
      claimedFrom = args.claimFrom;
      // Auto-start
      if (preset.status === "idle") {
        if (task.status === "draft") {
          autoStartReason = "任务尚在 draft，需先提升到 planned";
        } else if (task.status === "planned" || task.status === "in_progress") {
          if (!preset.blocked_on) {
            preset.status = "working";
            autoStarted = true;
            if (task.status === "planned") {
              task.status = "in_progress" as TaskStatus;
            }
          } else {
            autoStartReason = `被 ${preset.blocked_on} 阻塞`;
          }
        }
      }
    } else if (existingKey) {
      // ── 幂等重注册 ──
      if (args.role === "developer") {
        const existing = task.developer[existingKey];
        existing.brief = args.brief;
        if (args.worktree !== "main") {
          existing.cwd = args.worktree;
          existing.worktree = args.worktree;
        }
        // Auto-start
        if (existing.status === "follow_issue") {
          existing.status = "working";
          existing.attempt = Math.max(existing.attempt, 1);
          autoStarted = true;
        } else if (existing.status === "idle") {
          if (task.status === "draft") {
            autoStartReason = "任务尚在 draft，需先提升到 planned";
          } else if (task.status === "planned" || task.status === "in_progress") {
            if (!existing.blocked_on) {
              existing.status = "working";
              existing.attempt = Math.max(existing.attempt, 1);
              autoStarted = true;
              if (task.status === "planned") {
                task.status = "in_progress" as TaskStatus;
              }
            } else {
              autoStartReason = `被 ${existing.blocked_on} 阻塞`;
            }
          }
        }
      } else if (args.role === "reviewer") {
        task.reviewer[existingKey].brief = args.brief;
      } else if (args.role === "tester") {
        task.tester[existingKey].brief = args.brief;
      } else if (args.role === "integrator") {
        task.integrator[existingKey].brief = args.brief;
      }
    } else {
      // ── 全新注册 ──
      if (args.role === "developer") {
        task.developer[args.worktree] = {
          status: "idle",
          brief: args.brief,
          attempt: 0,
          blocked_on: null,
          worktree: args.worktree,
          cwd: args.worktree,
          reports: [],
          review: null,
          self_review: null,
          review_gate_required: false,
          error: null,
        };
        // Auto-start
        const dev = task.developer[args.worktree];
        if (task.status === "draft") {
          autoStartReason = "任务尚在 draft，需先提升到 planned";
        } else if (task.status === "planned" || task.status === "in_progress") {
          if (!dev.blocked_on) {
            dev.status = "working";
            dev.attempt = 1;
            autoStarted = true;
            if (task.status === "planned") {
              task.status = "in_progress" as TaskStatus;
            }
          }
        }
      } else if (args.role === "reviewer") {
        task.reviewer[args.worktree] = {
          status: "idle",
          brief: args.brief,
          attempt: 0,
          pass: [],
          report: "",
          error: null,
        };
      } else if (args.role === "tester") {
        task.tester[args.worktree] = {
          status: "idle",
          brief: args.brief,
          attempt: 0,
          worktree: args.worktree === "main" ? null : args.worktree,
          cwd: args.worktree === "main" ? null : args.worktree,
          case_document: "",
          pass: [],
          fail: [],
          report: "",
          error: null,
        };
      } else if (args.role === "integrator") {
        task.integrator[args.worktree] = {
          status: "idle",
          brief: args.brief,
          attempt: 0,
          worktree: args.worktree === "main" ? null : args.worktree,
          cwd: args.worktree === "main" ? null : args.worktree,
          merged: [],
          conflicts: [],
          report: "",
          error: null,
        };
      }
    }
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        worktree: args.worktree,
        stableKey: args.claimFrom ?? existingKey ?? args.worktree,
        role: args.role,
        brief: args.brief,
        taskUuid: resultUuid,
        taskShort: resultUuid.slice(0, 8),
        autoStarted,
        ...(autoStartReason ? { autoStartReason } : {}),
        ...(claimedFrom ? { claimedFrom } : {}),
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
