/**
 * 路径工具:统一管理 ~/.kanban/ 下的路径拼接
 */
import { homedir } from "os";
import { join } from "path";

export const KANBAN_ROOT = join(homedir(), ".kanban");
export const KANBAN_FILE = join(KANBAN_ROOT, "kanban.json");
export const LOCKS_DIR = join(KANBAN_ROOT, ".locks");
export const LOCK_FILE = join(LOCKS_DIR, "kanban.json.lock");
export const ARCHIVE_ROOT = join(KANBAN_ROOT, "archive");

export function waveDir(repo: string, uuid: string): string {
  return join(KANBAN_ROOT, repo, uuid);
}

export function planPath(repo: string, uuid: string): string {
  return join(waveDir(repo, uuid), "plan.md");
}

export function reportPath(
  repo: string,
  uuid: string,
  worktree: string,
  attempt: number,
): string {
  const nn = String(attempt).padStart(2, "0");
  return join(waveDir(repo, uuid), `report-${worktree}-${nn}.md`);
}

export function reviewPath(
  repo: string,
  uuid: string,
  worktree: string,
  attempt: number,
): string {
  const nn = String(attempt).padStart(2, "0");
  return join(waveDir(repo, uuid), `review-${worktree}-${nn}.md`);
}

export function testPath(
  repo: string,
  uuid: string,
  attempt: number,
): string {
  const nn = String(attempt).padStart(2, "0");
  return join(waveDir(repo, uuid), `test-${nn}.md`);
}

/**
 * 把绝对路径转成 ~/.kanban/... 前缀风格(便于存到 jsonc 里可读)。
 * 若路径不在 ~/.kanban/ 下则保持原样。
 */
export function toKanbanRel(abs: string): string {
  if (abs.startsWith(KANBAN_ROOT)) {
    return "~/.kanban" + abs.slice(KANBAN_ROOT.length);
  }
  return abs;
}

/**
 * 反过来:把 ~/.kanban/... 展开成绝对路径。
 */
export function fromKanbanRel(p: string): string {
  if (p.startsWith("~/.kanban")) {
    return KANBAN_ROOT + p.slice("~/.kanban".length);
  }
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}
