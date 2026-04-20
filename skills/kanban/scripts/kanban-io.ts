/**
 * kanban.json I/O:读、解析、格式化。不负责加锁。
 */
import { readFile, writeFile, rename } from "fs/promises";
import { existsSync } from "fs";
import { KANBAN_FILE } from "./paths";

// ---- 类型 ----
export type TaskStatus =
  | "draft"
  | "planned"
  | "in_progress"
  | "done"
  | "archived"
  | "aborted";

export type WorktreeRole = "developer" | "reviewer" | "test" | "integrator";

export type WorktreeStatus =
  | "idle"
  | "working"
  | "waiting_review"
  | "review_approved"
  | "review_rejected"
  | "done"
  | "blocked";

export interface Worktree {
  role: WorktreeRole;
  action: string;
  status: WorktreeStatus;
  attempt: number;
  report: string | null;
  review: string | null;
  test: string | null;
  integration: null | "pending" | "merged" | "conflict";
  error: string | null;
  blocked_on: string | null;
}

export interface Task {
  status: TaskStatus;
  repo: string;
  description: string;
  /**
   * 可选。原始需求草稿文件路径。
   * - 与 status=draft 是两个独立概念
   * - 文件不一定存在于磁盘(仅作追溯记录)
   * - 用于 plan 偏离时找回最初意图,或最终验收时对照原始需求
   */
  draft?: string | null;
  plan: string;
  created: string;
  updated?: string;
  worktree: Record<string, Partial<Worktree>>;
}

export type Kanban = Record<string, Task>;

// ---- 集中常量 ----

export const VALID_ROLES: readonly WorktreeRole[] = ["developer", "reviewer", "test", "integrator"] as const;

export const VALID_TASK_STATUSES: readonly TaskStatus[] = [
  "draft", "planned", "in_progress", "done", "archived", "aborted",
] as const;

export const VALID_WORKTREE_STATUSES: readonly WorktreeStatus[] = [
  "idle", "working", "waiting_review", "review_approved", "review_rejected", "done", "blocked",
] as const;

export const TERMINAL_STATUSES: readonly TaskStatus[] = ["done", "archived", "aborted"] as const;

export const STATUS_DISPLAY_ORDER: readonly TaskStatus[] = [
  "in_progress", "planned", "draft", "done", "archived", "aborted",
] as const;

const _validStatusSet = new Set<string>(VALID_TASK_STATUSES);

// ---- 时间 ----

export function nowIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const off = d.getTimezoneOffset();
  const sign = off <= 0 ? "+" : "-";
  const absOff = Math.abs(off);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(absOff / 60))}:${pad(absOff % 60)}`
  );
}

// ---- 校验 ----

export function validateKanban(data: unknown): Kanban {
  if (data == null || typeof data !== "object") {
    throw new Error("kanban.json 根结构必须是对象");
  }
  const kanban = data as Record<string, unknown>;
  for (const [uuid, val] of Object.entries(kanban)) {
    if (val == null || typeof val !== "object") {
      throw new Error(`任务 ${uuid.slice(0, 8)} 的值必须是对象`);
    }
    const task = val as Record<string, unknown>;
    if (typeof task.status !== "string" || !_validStatusSet.has(task.status)) {
      throw new Error(`任务 ${uuid.slice(0, 8)} 缺少合法 status 字段`);
    }
    if (typeof task.repo !== "string") {
      throw new Error(`任务 ${uuid.slice(0, 8)} 缺少 repo 字段(字符串)`);
    }
    if (typeof task.description !== "string") {
      throw new Error(`任务 ${uuid.slice(0, 8)} 缺少 description 字段(字符串)`);
    }
    if (typeof task.plan !== "string") {
      throw new Error(`任务 ${uuid.slice(0, 8)} 缺少 plan 字段(字符串)`);
    }
    if (typeof task.created !== "string") {
      throw new Error(`任务 ${uuid.slice(0, 8)} 缺少 created 字段(ISO 时间戳)`);
    }
    if (task.worktree != null && typeof task.worktree !== "object") {
      throw new Error(`任务 ${uuid.slice(0, 8)} 的 worktree 必须是对象`);
    }
  }
  return kanban as Kanban;
}

// ---- I/O ----

export async function readKanban(): Promise<Kanban> {
  if (!existsSync(KANBAN_FILE)) {
    throw new Error(
      `kanban.json 不存在: ${KANBAN_FILE}。先运行 /kanban --init`,
    );
  }
  const raw = await readFile(KANBAN_FILE, "utf-8");
  try {
    return validateKanban(JSON.parse(raw) ?? {});
  } catch (e) {
    throw new Error(`kanban.json 解析失败: ${(e as Error).message}`);
  }
}

export async function writeKanban(data: Kanban): Promise<void> {
  const serialized = JSON.stringify(data, null, 2) + "\n";
  const tmp = KANBAN_FILE + ".tmp";
  await writeFile(tmp, serialized, "utf-8");
  await rename(tmp, KANBAN_FILE);
}

// ---- UUID 短前缀解析 ----

export function resolveUuid(kanban: Kanban, prefix: string): string[] {
  if (prefix.length < 6) return [];
  return Object.keys(kanban).filter((uuid) =>
    uuid.startsWith(prefix.toLowerCase()),
  );
}
