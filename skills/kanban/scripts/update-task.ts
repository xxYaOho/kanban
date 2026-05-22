#!/usr/bin/env bun
/**
 * /kanban --update 实现(非交互核心)
 *
 * 用法:
 *   bun run update-task.ts <uuid> <op>...
 *
 * op 语法:
 *   set:<path>=<value>            设置标量字段(或 developer.<name>.brief 等)
 *   add:<role>:<name>:<json>      新增条目(json 为对象 {brief})
 *   del:<role>:<name>             删除条目
 *
 * stdout: JSON { ok, diff, newStatus }
 */
import { withKanbanLock } from "./kanban-lock";
import {
  resolveUuid,
  type Kanban,
  type Task,
  type TaskStatus,
  VALID_TASK_STATUSES,
} from "./kanban-io";
import { validatePromotableTask } from "./multi-plan";
import { normalizeRole, roleKeys, type Role } from "./protocol";

type RoleKey = Role;

// 允许的顶层路径
const EDITABLE_TOP = new Set(["status", "description", "plan", "draft", "repo"]);
// 允许的 role 条目子路径
const EDITABLE_ROLE_FIELD = new Set(["brief"]);
// Agent 领域:明确拒绝
const AGENT_ROLE_FIELD = new Set([
  "status",
  "attempt",
  "error",
  "blocked_on",
  "reports",
  "review",
  "pass",
  "fail",
  "report",
  "merged",
  "conflicts",
  "cwd",
  "worktree",
]);

const _validStatusSet = new Set<string>(VALID_TASK_STATUSES);

type Op =
  | { kind: "set"; path: string; value: string }
  | { kind: "add"; role: RoleKey; name: string; brief: string; blocked_on?: string | null }
  | { kind: "del"; role: RoleKey; name: string };

function parseOps(argv: string[]): Op[] {
  const ops: Op[] = [];
  for (const raw of argv) {
    if (raw.startsWith("set:")) {
      const body = raw.slice("set:".length);
      const eqIdx = body.indexOf("=");
      if (eqIdx < 0) throw new Error(`op 语法错: ${raw}`);
      ops.push({ kind: "set", path: body.slice(0, eqIdx), value: body.slice(eqIdx + 1) });
    } else if (raw.startsWith("add:")) {
      // add:<role>:<name>:<json>
      const body = raw.slice("add:".length);
      const parts = body.split(":");
      if (parts.length < 3) throw new Error(`op 语法错: ${raw}，格式 add:<role>:<name>:<json>`);
      const role = parts[0];
      const name = parts[1];
      const json = parts.slice(2).join(":");
      const normalizedRole = normalizeRole(role);
      if (!normalizedRole) throw new Error(`非法 role: ${role}`);
      const obj = JSON.parse(json);
      if (typeof obj.brief !== "string") {
        throw new Error(`add 需要 {brief}: ${raw}`);
      }
      ops.push({
        kind: "add",
        role: normalizedRole,
        name,
        brief: obj.brief,
        blocked_on: obj.blocked_on ?? undefined,
      });
    } else if (raw.startsWith("del:")) {
      // del:<role>:<name>
      const body = raw.slice("del:".length);
      const parts = body.split(":");
      if (parts.length < 2) throw new Error(`op 语法错: ${raw}，格式 del:<role>:<name>`);
      const role = parts[0];
      const name = parts.slice(1).join(":");
      const normalizedRole = normalizeRole(role);
      if (!normalizedRole) throw new Error(`非法 role: ${role}`);
      if (!name) throw new Error(`op 语法错: ${raw}`);
      ops.push({ kind: "del", role: normalizedRole, name });
    } else {
      throw new Error(`未知 op: ${raw}`);
    }
  }
  return ops;
}

function validatePath(path: string): { top?: string; roleEntry?: { role: RoleKey; name: string; field: string } } {
  if (EDITABLE_TOP.has(path)) return { top: path };
  // 匹配 developer.<name>.<field> 等
  const m = path.match(/^([^.]+)\.([^.]+)\.([^.]+)$/);
  if (m) {
    const [, roleInput, name, field] = m;
    const role = normalizeRole(roleInput);
    if (!role) throw new Error(`未知或禁止修改的字段: ${path}`);
    if (AGENT_ROLE_FIELD.has(field)) {
      throw new Error(
        `字段 \`${role}.${name}.${field}\` 属于 Agent 自主字段,/kanban --update 不允许修改。`,
      );
    }
    if (!EDITABLE_ROLE_FIELD.has(field)) throw new Error(`未知字段: ${path}`);
    return { roleEntry: { role, name, field } };
  }
  throw new Error(`未知或禁止修改的字段: ${path}`);
}

function getRoleEntries(task: Task, role: RoleKey): Record<string, any> {
  return (task as any)[role] ?? {};
}

function isClaimedEntry(entry: any): boolean {
  return (entry?.attempt ?? 0) > 0 || entry?.status !== "idle";
}

function assertCanEditBrief(task: Task, role: RoleKey, name: string, entry: any): void {
  if (isClaimedEntry(entry)) {
    throw new Error(
      `${role}.${name} 已被认领(status=${entry.status}, attempt=${entry.attempt ?? 0}),不允许修改 brief。`,
    );
  }
  if (["done", "archived", "aborted"].includes(task.status)) {
    throw new Error(`当前 status=${task.status},不允许修改 role brief。`);
  }
}

function assertCanAddEntry(task: Task, entryStatus: string): void {
  if (task.status === "draft" || task.status === "planned") return;
  if (task.status === "in_progress" && entryStatus === "idle") return;
  throw new Error(`当前 status=${task.status},不允许新增条目。仅 draft/planned 或 in_progress 追加 idle 条目允许。`);
}

function assertCanChangeStatus(before: Task, nextStatus: TaskStatus): void {
  if (before.status === "in_progress" && nextStatus === "planned") {
    throw new Error("当前 status=in_progress,不允许回退到 planned。");
  }
}

function assertCanDeleteEntry(task: Task, role: RoleKey, name: string, entry: any): void {
  if (task.status === "draft" || task.status === "planned") {
    if (isClaimedEntry(entry)) {
      throw new Error(
        `${role}.${name} 已被认领(status=${entry.status}, attempt=${entry.attempt ?? 0}),不允许删除。`,
      );
    }
    return;
  }
  if (task.status === "in_progress") {
    throw new Error(`当前 status=in_progress,不允许删除已有条目。`);
  }
  throw new Error(`当前 status=${task.status},不允许删除条目。`);
}

async function main() {
  const [uuidPrefix, ...rest] = process.argv.slice(2);
  if (!uuidPrefix) throw new Error("缺参:<uuid>");
  const ops = parseOps(rest);
  if (ops.length === 0) throw new Error("没有操作。传至少一个 op。");

  const diff: string[] = [];
  let newStatus: string | undefined;

  await withKanbanLock(async (kanban: Kanban) => {
    const matches = kanban[uuidPrefix] ? [uuidPrefix] : resolveUuid(kanban, uuidPrefix);
    if (matches.length === 0) throw new Error(`找不到任务: ${uuidPrefix}`);
    if (matches.length > 1) {
      throw new Error(`UUID 前缀 ${uuidPrefix} 多候选: ${matches.join(", ")}`);
    }
    const uuid = matches[0];
    const task = kanban[uuid];
    if (!task) throw new Error(`找不到任务: ${uuid}`);

    const before = JSON.parse(JSON.stringify(task)) as Task;

    for (const op of ops) {
      if (op.kind === "set") {
        const pv = validatePath(op.path);
        if (pv.top) {
          if (pv.top === "status") {
            if (!_validStatusSet.has(op.value)) throw new Error(`非法 status: ${op.value}`);
            assertCanChangeStatus(task, op.value as TaskStatus);
            task.status = op.value as TaskStatus;
          } else if (pv.top === "draft") {
            task.draft = op.value.trim() === "" ? null : op.value;
          } else {
            if (pv.top === "description") task.description = op.value;
            else if (pv.top === "plan") task.plan = op.value;
            else task.repo = op.value;
          }
        } else if (pv.roleEntry) {
          const { role, name, field } = pv.roleEntry;
          const entries = getRoleEntries(task, role);
          if (!entries[name]) throw new Error(`${role}.${name} 不存在`);
          assertCanEditBrief(task, role, name, entries[name]);
          entries[name][field] = op.value;
        }
      } else if (op.kind === "add") {
        const entries = getRoleEntries(task, op.role);
        if (entries[op.name]) throw new Error(`${op.role}.${op.name} 已存在`);
        const newEntry: Record<string, unknown> = { status: "idle", brief: op.brief, attempt: 0 };
        assertCanAddEntry(task, String(newEntry.status));
        if (op.blocked_on) newEntry.blocked_on = op.blocked_on;
        entries[op.name] = newEntry;
      } else if (op.kind === "del") {
        const entries = getRoleEntries(task, op.role);
        if (!entries[op.name]) throw new Error(`${op.role}.${op.name} 不存在`);
        assertCanDeleteEntry(task, op.role, op.name, entries[op.name]);
        delete entries[op.name];
      }
    }

    // status → planned 校验
    if (before.status !== task.status && task.status === "planned") {
      const errs = validatePromotableTask(task);
      if (errs.length > 0) {
        throw new Error(
          "无法提升 status → planned,缺失以下项:\n  - " + errs.join("\n  - "),
        );
      }
    }

    // 生成 diff
    if (before.status !== task.status) { diff.push(`status: ${before.status} → ${task.status}`); newStatus = task.status; }
    if (before.description !== task.description) diff.push(`description: "${before.description}" → "${task.description}"`);
    if (before.plan !== task.plan) diff.push(`plan: ${before.plan} → ${task.plan}`);
    if ((before.draft ?? null) !== (task.draft ?? null)) diff.push(`draft: ${before.draft ?? "null"} → ${task.draft ?? "null"}`);
    if (before.repo !== task.repo) diff.push(`repo: ${before.repo} → ${task.repo}`);

    for (const rk of roleKeys()) {
      const bEntries = getRoleEntries(before, rk);
      const aEntries = getRoleEntries(task, rk);
      const bNames = new Set(Object.keys(bEntries));
      const aNames = new Set(Object.keys(aEntries));
      for (const n of aNames) {
        if (!bNames.has(n)) {
          diff.push(`+ ${rk}.${n} = { brief: "${aEntries[n].brief}" }`);
        } else {
          if (bEntries[n].brief !== aEntries[n].brief) {
            diff.push(`${rk}.${n}.brief: "${bEntries[n].brief}" → "${aEntries[n].brief}"`);
          }
        }
      }
      for (const n of bNames) {
        if (!aNames.has(n)) diff.push(`- ${rk}.${n}`);
      }
    }
  });

  console.log(JSON.stringify({ ok: true, diff, newStatus }, null, 2));
}

main().catch((err) => {
  console.error("❌ update-task 失败:");
  console.error(err?.message ?? err);
  process.exit(1);
});
