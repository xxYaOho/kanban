/**
 * kanban.json I/O:读、解析、格式化。不负责加锁。
 */
import { readFile, writeFile, rename } from "fs/promises";
import { existsSync } from "fs";
import { KANBAN_FILE } from "./paths";
import {
  developerStatuses,
  integratorStatuses,
  roleKeys,
  statusDisplayOrder,
  taskStatuses,
  terminalTaskStatuses,
  testerStatuses,
  reviewerStatuses,
  normalizeRole,
  type DeveloperStatus,
  type IntegratorStatus as ProtocolIntegratorStatus,
  type ReviewerStatus as ProtocolReviewerStatus,
  type Role,
  type TaskStatus as ProtocolTaskStatus,
  type TesterStatus as ProtocolTesterStatus,
} from "./protocol";

// ---- 新角色类型 ----

export type DevStatus = DeveloperStatus;
export type ReviewerStatus = ProtocolReviewerStatus;
export type TesterStatus = ProtocolTesterStatus;
export type IntegratorStatus = ProtocolIntegratorStatus;

export interface DevEntry {
  status: DevStatus;
  brief: string;
  attempt: number;
  blocked_on: string | null;
  worktree: string | null;
  cwd: string | null;
  reports: string[];
  review: string | null;
  error: string | null;
}

export interface ReviewerEntry {
  status: ReviewerStatus;
  brief: string;
  attempt: number;
  pass: string[];
  report: string;
  error: string | null;
}

export interface TesterEntry {
  status: TesterStatus;
  brief: string;
  attempt: number;
  worktree: string | null;
  cwd: string | null;
  pass: string[];
  fail: string[];
  report: string;
  error: string | null;
}

export interface IntegratorEntry {
  status: IntegratorStatus;
  brief: string;
  attempt: number;
  worktree: string | null;
  cwd: string | null;
  merged: string[];
  conflicts: string[];
  report: string;
  error: string | null;
}

export type TaskStatus = ProtocolTaskStatus;

export interface Task {
  status: TaskStatus;
  repo: string;
  description: string;
  draft?: string | null;
  plan: string;
  created: string;
  updated?: string;
  developer: Record<string, DevEntry>;
  reviewer: Record<string, ReviewerEntry>;
  tester: Record<string, TesterEntry>;
  integrator: Record<string, IntegratorEntry>;
  /** @deprecated 旧格式 test role，读取时迁移到 tester，写入时删除 */
  test?: Record<string, TesterEntry>;
  /** @deprecated 旧格式 worktree，迁移后删除 */
  worktree?: Record<string, any>;
}

export type Kanban = Record<string, Task>;

// ---- 旧类型（仅迁移用） ----

export type WorktreeRole = Role;
export type LegacyWorktreeRole = WorktreeRole | "test";

// ---- 集中常量 ----

export const VALID_ROLES = roleKeys();

export const VALID_TASK_STATUSES = taskStatuses;

export const VALID_DEV_STATUSES = developerStatuses;

export const VALID_REVIEWER_STATUSES = reviewerStatuses;

export const VALID_TESTER_STATUSES = testerStatuses;
/** @deprecated use VALID_TESTER_STATUSES */
export const VALID_TEST_STATUSES = VALID_TESTER_STATUSES;

export const VALID_INTEGRATOR_STATUSES = integratorStatuses;

export const TERMINAL_STATUSES = terminalTaskStatuses;

export const STATUS_DISPLAY_ORDER = statusDisplayOrder;

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

// ---- 迁移 ----

function extractFilename(path: string): string {
  // "~/.kanban/wave/<uuid>/report-dev-01.md" → "report-dev-01.md"
  // "report-dev-01.md" → "report-dev-01.md"
  const parts = path.replace(/\\/g, "/").split("/");
  const last = parts[parts.length - 1];
  return last || path;
}

function extractReportFilename(val: unknown): string {
  if (typeof val === "string") {
    return extractFilename(val);
  }
  if (val && typeof val === "object" && !Array.isArray(val)) {
    // Hybrid: {"main": {"description":"...","document":"~/.kanban/..."}}
    const entries = Object.values(val as Record<string, any>);
    for (const entry of entries) {
      if (entry && typeof entry.document === "string") {
        return extractFilename(entry.document);
      }
    }
  }
  return "";
}

function extractReportsArray(val: unknown): string[] {
  if (typeof val === "string") {
    return [extractFilename(val)];
  }
  if (val && typeof val === "object" && !Array.isArray(val)) {
    // Hybrid: extract all scope entries
    const filenames: string[] = [];
    for (const entry of Object.values(val as Record<string, any>)) {
      if (entry && typeof entry.document === "string") {
        filenames.push(extractFilename(entry.document));
      }
    }
    return [...new Set(filenames)];
  }
  return [];
}

export function migrateTask(task: Task): void {
  const developer: Record<string, DevEntry> = { ...(task.developer ?? {}) };
  const reviewer: Record<string, ReviewerEntry> = { ...(task.reviewer ?? {}) };
  const tester: Record<string, TesterEntry> = {
    ...(task.test ?? {}),
    ...(task.tester ?? {}),
  };
  const integrator: Record<string, IntegratorEntry> = { ...(task.integrator ?? {}) };

  if (task.worktree) {
    const oldWt = task.worktree;
    for (const [name, wt] of Object.entries(oldWt)) {
      const role = normalizeRole(String(wt?.role ?? ""));
      switch (role) {
        case "developer": {
          developer[name] = {
            status: mapDevStatus(wt.status),
            brief: wt.action ?? wt.brief ?? "",
            attempt: wt.attempt ?? 0,
            blocked_on: wt.blocked_on ?? null,
            worktree: wt.cwd ?? null,
            cwd: wt.cwd ?? null,
            reports: extractReportsArray(wt.report),
            review: wt.review ? extractFilename(String(wt.review)) : null,
            error: wt.error ?? null,
          };
          break;
        }
        case "reviewer": {
          reviewer[name] = {
            status: mapReviewerStatus(wt.status),
            brief: wt.action ?? wt.brief ?? "",
            attempt: wt.attempt ?? 0,
            pass: [],
            report: extractReportFilename(wt.report),
            error: wt.error ?? null,
          };
          break;
        }
        case "tester": {
          tester[name] = {
            status: mapTesterStatus(wt.status),
            brief: wt.action ?? wt.brief ?? "",
            attempt: wt.attempt ?? 0,
            worktree: wt.cwd ?? null,
            cwd: wt.cwd ?? null,
            pass: [],
            fail: [],
            report: extractReportFilename(wt.report),
            error: wt.error ?? null,
          };
          break;
        }
        case "integrator": {
          integrator[name] = {
            status: mapIntegratorStatus(wt.status),
            brief: wt.action ?? wt.brief ?? "",
            attempt: wt.attempt ?? 0,
            worktree: wt.cwd ?? null,
            cwd: wt.cwd ?? null,
            merged: [],
            conflicts: [],
            report: extractReportFilename(wt.report),
            error: wt.error ?? null,
          };
          break;
        }
      }
    }
  }

  task.developer = developer;
  task.reviewer = reviewer;
  task.tester = tester;
  task.integrator = integrator;
  delete task.test;
  delete task.worktree;
}

function mapDevStatus(old: unknown): DevStatus {
  const s = String(old ?? "idle");
  if ((VALID_DEV_STATUSES as readonly string[]).includes(s)) return s as DevStatus;
  return "idle";
}

function mapReviewerStatus(old: unknown): ReviewerStatus {
  const s = String(old ?? "idle");
  if (s === "working") return "working";
  if (s === "done") return "done";
  return "idle";
}

function mapTesterStatus(old: unknown): TesterStatus {
  const s = String(old ?? "idle");
  if (s === "working") return "working";
  if (s === "waiting") return "waiting";
  if (s === "done") return "done";
  return "idle";
}

function mapIntegratorStatus(old: unknown): IntegratorStatus {
  const s = String(old ?? "idle");
  if (s === "working") return "working";
  if (s === "done") return "done";
  return "idle";
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
    // 兼容旧 worktree 和新 role key
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
  let data: Kanban;
  try {
    data = validateKanban(JSON.parse(raw) ?? {});
  } catch (e) {
    throw new Error(`kanban.json 解析失败: ${(e as Error).message}`);
  }

  // Auto-migrate
  for (const task of Object.values(data)) {
    migrateTask(task);
  }

  return data;
}

export async function writeKanban(data: Kanban): Promise<void> {
  const canonical = structuredClone(data);
  for (const task of Object.values(canonical)) {
    migrateTask(task);
  }
  const serialized = JSON.stringify(canonical, null, 2) + "\n";
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
