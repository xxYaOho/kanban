#!/usr/bin/env bun
/**
 * /kanban --update 实现(非交互核心)
 *
 * 用法:
 *   bun run update-task.ts <uuid> <op>...
 *
 * op 语法:
 *   set:<path>=<value>            设置标量字段(或 worktree.<name>.role/action)
 *   add-worktree:<name>:<json>    新增 worktree 条目(json 为对象 {role,action})
 *   del-worktree:<name>           删除 worktree 条目
 *
 * 示例:
 *   bun run update-task.ts 019d9b9f set:status=planned set:description="CLI v0.14"
 *   bun run update-task.ts 019d9b9f add-worktree:review:'{"role":"reviewer","action":"统一 review"}'
 *   bun run update-task.ts 019d9b9f del-worktree:obsolete
 *
 * stdout: JSON { ok, diff, newStatus }
 */
import { existsSync, statSync } from "fs";
import { withKanbanLock } from "./kanban-lock";
import { resolveUuid, type Kanban, type Task, type WorktreeRole } from "./kanban-io";
import { fromKanbanRel } from "./paths";

// 允许的顶层路径
const EDITABLE_TOP = new Set(["status", "description", "plan", "repo"]);
// 允许的 worktree 子路径
const EDITABLE_WORKTREE_FIELD = new Set(["role", "action"]);
// Agent 领域:明确拒绝
const AGENT_WORKTREE_FIELD = new Set([
  "status",
  "report",
  "review",
  "test",
  "attempt",
  "error",
  "blocked_on",
]);

const VALID_TASK_STATUS = new Set([
  "draft",
  "planned",
  "in_progress",
  "done",
  "archived",
  "aborted",
]);
const VALID_ROLE = new Set<WorktreeRole>(["developer", "reviewer", "test"]);

type Op =
  | { kind: "set"; path: string; value: string }
  | { kind: "add-worktree"; name: string; value: { role: WorktreeRole; action: string } }
  | { kind: "del-worktree"; name: string };

function parseOps(argv: string[]): Op[] {
  const ops: Op[] = [];
  for (const raw of argv) {
    if (raw.startsWith("set:")) {
      const body = raw.slice("set:".length);
      const eqIdx = body.indexOf("=");
      if (eqIdx < 0) throw new Error(`op 语法错: ${raw}`);
      ops.push({
        kind: "set",
        path: body.slice(0, eqIdx),
        value: body.slice(eqIdx + 1),
      });
    } else if (raw.startsWith("add-worktree:")) {
      const body = raw.slice("add-worktree:".length);
      const colonIdx = body.indexOf(":");
      if (colonIdx < 0) throw new Error(`op 语法错: ${raw}`);
      const name = body.slice(0, colonIdx);
      const json = body.slice(colonIdx + 1);
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== "object" || !obj.role || typeof obj.action !== "string") {
        throw new Error(`add-worktree 需要 {role, action}: ${raw}`);
      }
      if (!VALID_ROLE.has(obj.role)) {
        throw new Error(`非法 role: ${obj.role}`);
      }
      ops.push({ kind: "add-worktree", name, value: obj });
    } else if (raw.startsWith("del-worktree:")) {
      const name = raw.slice("del-worktree:".length);
      if (!name) throw new Error(`op 语法错: ${raw}`);
      ops.push({ kind: "del-worktree", name });
    } else {
      throw new Error(`未知 op: ${raw}`);
    }
  }
  return ops;
}

function validatePath(path: string): { top?: string; worktree?: { name: string; field: string } } {
  if (EDITABLE_TOP.has(path)) return { top: path };
  const m = path.match(/^worktree\.([^.]+)\.([^.]+)$/);
  if (m) {
    const [, name, field] = m;
    if (AGENT_WORKTREE_FIELD.has(field)) {
      throw new Error(
        `字段 \`worktree.${name}.${field}\` 属于 Agent 自主字段,/kanban --update 不允许修改。`,
      );
    }
    if (!EDITABLE_WORKTREE_FIELD.has(field)) {
      throw new Error(`未知字段: ${path}`);
    }
    return { worktree: { name, field } };
  }
  throw new Error(`未知或禁止修改的字段: ${path}`);
}

function validatePromotable(task: Task): string[] {
  const errs: string[] = [];
  const planAbs = fromKanbanRel(task.plan);
  if (!existsSync(planAbs)) {
    errs.push(`plan 文件不存在: ${task.plan}`);
  } else if (statSync(planAbs).size === 0) {
    errs.push(`plan 文件为空: ${task.plan}`);
  }
  const names = Object.keys(task.worktree ?? {});
  if (names.length === 0) {
    errs.push("worktree 为空,需至少一个条目");
  }
  for (const n of names) {
    const w = task.worktree[n] ?? {};
    if (!w.role || !VALID_ROLE.has(w.role as WorktreeRole)) {
      errs.push(`worktree.${n}.role 非法或缺失`);
    }
    if (!w.action || !String(w.action).trim()) {
      errs.push(`worktree.${n}.action 未填写`);
    }
  }
  return errs;
}

function ensureWorktreeDefaults(w: any) {
  // 填补 Agent 领域字段的初始值(仅当新建时)
  if (w.status === undefined) w.status = "idle";
  if (w.attempt === undefined) w.attempt = 0;
  if (w.report === undefined) w.report = null;
  if (w.review === undefined) w.review = null;
  if (w.test === undefined) w.test = null;
  if (w.error === undefined) w.error = null;
  if (w.blocked_on === undefined) w.blocked_on = null;
}

async function main() {
  const [uuidPrefix, ...rest] = process.argv.slice(2);
  if (!uuidPrefix) throw new Error("缺参:<uuid>");
  const ops = parseOps(rest);
  if (ops.length === 0) throw new Error("没有操作。传至少一个 op。");

  const diff: string[] = [];
  let newStatus: string | undefined;

  await withKanbanLock(async (kanban: Kanban) => {
    // 解析 uuid
    const uuid =
      kanban[uuidPrefix] ? uuidPrefix : resolveUuid(kanban, uuidPrefix)[0];
    const matches = kanban[uuidPrefix] ? [uuidPrefix] : resolveUuid(kanban, uuidPrefix);
    if (matches.length === 0) throw new Error(`找不到任务: ${uuidPrefix}`);
    if (matches.length > 1) {
      throw new Error(
        `UUID 前缀 ${uuidPrefix} 多候选: ${matches.join(", ")}(请用更长前缀)`,
      );
    }
    const task = kanban[uuid!];
    if (!task) throw new Error(`找不到任务: ${uuid}`);

    // 快照原状态,用于生成 diff
    const before = JSON.parse(JSON.stringify(task)) as Task;

    // 结构性改动的状态约束
    const structuralAllowed = task.status === "draft" || task.status === "planned";

    // 应用 ops
    for (const op of ops) {
      if (op.kind === "set") {
        const pv = validatePath(op.path);
        if (pv.top) {
          if (pv.top === "status") {
            if (!VALID_TASK_STATUS.has(op.value)) {
              throw new Error(`非法 status: ${op.value}`);
            }
            (task as any).status = op.value;
          } else {
            (task as any)[pv.top] = op.value;
          }
        } else if (pv.worktree) {
          const { name, field } = pv.worktree;
          const wt = task.worktree[name];
          if (!wt) throw new Error(`worktree.${name} 不存在`);
          if (field === "role" && !VALID_ROLE.has(op.value as WorktreeRole)) {
            throw new Error(`非法 role: ${op.value}`);
          }
          (wt as any)[field] = op.value;
        }
      } else if (op.kind === "add-worktree") {
        if (!structuralAllowed) {
          throw new Error(
            `当前 status=${task.status},不允许新增 worktree。仅在 draft/planned 允许。`,
          );
        }
        if (task.worktree[op.name]) {
          throw new Error(`worktree.${op.name} 已存在`);
        }
        const w: any = { ...op.value };
        ensureWorktreeDefaults(w);
        task.worktree[op.name] = w;
      } else if (op.kind === "del-worktree") {
        if (!structuralAllowed) {
          throw new Error(
            `当前 status=${task.status},不允许删除 worktree。`,
          );
        }
        if (!task.worktree[op.name]) {
          throw new Error(`worktree.${op.name} 不存在`);
        }
        delete task.worktree[op.name];
      }
    }

    // 若 status 提升到 planned,触发校验
    if (before.status !== task.status && task.status === "planned") {
      const errs = validatePromotable(task);
      if (errs.length > 0) {
        throw new Error(
          "无法提升 status → planned,缺失以下项:\n  - " + errs.join("\n  - "),
        );
      }
    }

    // 生成 diff 文本
    if (before.status !== task.status) {
      diff.push(`status: ${before.status} → ${task.status}`);
      newStatus = task.status;
    }
    if (before.description !== task.description) {
      diff.push(`description: "${before.description}" → "${task.description}"`);
    }
    if (before.plan !== task.plan) {
      diff.push(`plan: ${before.plan} → ${task.plan}`);
    }
    if (before.repo !== task.repo) {
      diff.push(`repo: ${before.repo} → ${task.repo}`);
    }
    const bNames = new Set(Object.keys(before.worktree ?? {}));
    const aNames = new Set(Object.keys(task.worktree ?? {}));
    for (const n of aNames) {
      if (!bNames.has(n)) {
        diff.push(
          `+ worktree.${n} = ${JSON.stringify({
            role: task.worktree[n].role,
            action: task.worktree[n].action,
          })}`,
        );
      } else {
        const bw = before.worktree[n]!;
        const aw = task.worktree[n];
        if (bw.role !== aw.role) diff.push(`worktree.${n}.role: ${bw.role} → ${aw.role}`);
        if (bw.action !== aw.action)
          diff.push(`worktree.${n}.action: "${bw.action}" → "${aw.action}"`);
      }
    }
    for (const n of bNames) {
      if (!aNames.has(n)) diff.push(`- worktree.${n}`);
    }
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        diff,
        newStatus,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("❌ update-task 失败:");
  console.error(err?.message ?? err);
  process.exit(1);
});
