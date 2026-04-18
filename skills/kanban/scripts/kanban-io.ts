/**
 * kanban.jsonc I/O:读、解析、格式化。不负责加锁。
 *
 * 用 jsonc-parser 以宽容模式解析,允许行注释/尾逗号。
 * 写回用 JSON.stringify(obj, null, 2) — 注释不保留(本文件主要由脚本维护)。
 */
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { parse as parseJsonc, ParseError } from "jsonc-parser";
import { KANBAN_FILE } from "./paths";

// ---- 类型 ----
export type TaskStatus =
  | "draft"
  | "planned"
  | "in_progress"
  | "done"
  | "archived"
  | "aborted";

export type WorktreeRole = "developer" | "reviewer" | "test";

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
  error: string | null;
  blocked_on: string | null;
}

export interface Task {
  status: TaskStatus;
  repo: string;
  description: string;
  plan: string;
  created: string;
  updated?: string;
  worktree: Record<string, Partial<Worktree>>;
}

export type Kanban = Record<string, Task>;

// ---- I/O ----

export async function readKanban(): Promise<Kanban> {
  if (!existsSync(KANBAN_FILE)) {
    throw new Error(
      `kanban.jsonc 不存在: ${KANBAN_FILE}。先运行 /kanban --init`,
    );
  }
  const raw = await readFile(KANBAN_FILE, "utf-8");
  const errors: ParseError[] = [];
  const parsed = parseJsonc(raw, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (errors.length > 0) {
    throw new Error(
      `kanban.jsonc 解析失败: ${errors
        .map((e) => `offset=${e.offset} error=${e.error}`)
        .join("; ")}`,
    );
  }
  return (parsed ?? {}) as Kanban;
}

export async function writeKanban(data: Kanban): Promise<void> {
  const serialized = JSON.stringify(data, null, 2) + "\n";
  await writeFile(KANBAN_FILE, serialized, "utf-8");
}

// ---- UUID 短前缀解析 ----

export function resolveUuid(kanban: Kanban, prefix: string): string[] {
  if (prefix.length < 6) return [];
  const candidates = Object.keys(kanban).filter((uuid) =>
    uuid.startsWith(prefix.toLowerCase()),
  );
  return candidates;
}
