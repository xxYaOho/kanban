/**
 * kanban.jsonc 并发安全写入。
 *
 * 用法:
 *   await withKanbanLock(async (kanban) => {
 *     kanban[uuid].worktree[name].status = "working";
 *   });
 *
 * 实现:proper-lockfile 建议性文件锁 + 读 → mutate → 写回。
 * 自动刷新顶层任务的 updated 字段。
 */
import lockfile from "proper-lockfile";
import { mkdirSync, existsSync } from "fs";
import { writeFileSync } from "fs";
import { KANBAN_FILE, LOCKS_DIR, LOCK_FILE } from "./paths";
import { readKanban, writeKanban, Kanban } from "./kanban-io";

export interface LockOpts {
  retries?: number;
  retryMinMs?: number;
  retryMaxMs?: number;
}

const DEFAULT_OPTS: Required<LockOpts> = {
  retries: 10,
  retryMinMs: 80,
  retryMaxMs: 400,
};

/**
 * 在文件锁内执行 mutator。mutator 可直接修改传入的 kanban 对象,
 * 返回的 value 会被 withKanbanLock 原样回传给调用方。
 *
 * 同时会把所有被 mutator 触及到的顶层任务的 updated 字段刷新为 now。
 * (实现上:先深拷贝一份,mutator 跑完后 diff 顶层任务对象的引用或内容决定是否刷新。)
 */
export async function withKanbanLock<T>(
  mutator: (kanban: Kanban) => T | Promise<T>,
  opts: LockOpts = {},
): Promise<T> {
  const { retries, retryMinMs, retryMaxMs } = { ...DEFAULT_OPTS, ...opts };

  // 确保锁目录存在
  if (!existsSync(LOCKS_DIR)) {
    mkdirSync(LOCKS_DIR, { recursive: true });
  }
  // proper-lockfile 需要锁标的文件存在
  if (!existsSync(LOCK_FILE)) {
    writeFileSync(LOCK_FILE, "");
  }

  const release = await lockfile.lock(LOCK_FILE, {
    retries: {
      retries,
      minTimeout: retryMinMs,
      maxTimeout: retryMaxMs,
      randomize: true,
    },
    realpath: false,
    stale: 15_000,
  });

  try {
    const kanban = await readKanban();
    const beforeSnapshot = JSON.stringify(kanban);
    const result = await mutator(kanban);

    // 刷新 updated:对比前后哪些顶层任务的字符串表示变了
    const before = JSON.parse(beforeSnapshot) as Kanban;
    const now = new Date().toISOString();
    for (const uuid of Object.keys(kanban)) {
      const b = before[uuid];
      const a = kanban[uuid];
      if (!b || JSON.stringify(b) !== JSON.stringify(a)) {
        a.updated = now;
      }
    }

    await writeKanban(kanban);
    return result;
  } finally {
    await release();
  }
}
