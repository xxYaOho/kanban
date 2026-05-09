#!/usr/bin/env bun
/**
 * /kanban --clear 实现
 *
 * 扫描模式:
 *   bun run clear.ts [<uuid>]
 *   输出 JSON { candidates: [...], dryRun: true }
 *
 * 执行模式:
 *   bun run clear.ts --commit [<uuid>]
 *   输出 JSON { ok: true, archived: [...] }
 */
import { existsSync } from "fs";
import { readdir, rm, cp, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { withKanbanLock } from "./kanban-lock";
import {
  readKanban,
  type Kanban,
  type Task,
  type TaskStatus,
  TERMINAL_STATUSES,
  resolveUuid,
  nowIso,
} from "./kanban-io";
import {
  KANBAN_ROOT,
  ARCHIVE_ROOT,
  archiveIndexPath,
  archiveDir,
  archiveTaskPath,
  waveDir,
} from "./paths";

const _terminalSet = new Set<string>(TERMINAL_STATUSES);

interface ArchiveCandidate {
  id: string;
  short: string;
  repo: string;
  description: string;
  status: TaskStatus;
  sourceDir: string;
}

interface IndexEntry {
  id: string;
  repo: string;
  description: string;
  archived: string;
  status: TaskStatus;
}

function parseArgs(argv: string[]): { commit: boolean; uuid?: string } {
  let commit = false;
  let uuid: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--commit") {
      commit = true;
    } else if (!argv[i].startsWith("--")) {
      uuid = argv[i];
    }
  }
  return { commit, uuid };
}

function findCandidates(kanban: Kanban, uuid?: string): ArchiveCandidate[] {
  const candidates: ArchiveCandidate[] = [];

  if (uuid) {
    const matches = kanban[uuid] ? [uuid] : resolveUuid(kanban, uuid);
    if (matches.length === 0) {
      throw new Error(`找不到任务: ${uuid}`);
    }
    if (matches.length > 1) {
      throw new Error(
        `UUID 前缀 ${uuid} 多候选: ${matches.join(", ")}`,
      );
    }
    const id = matches[0];
    const task = kanban[id];
    if (!task) throw new Error(`找不到任务: ${uuid}`);
    if (!_terminalSet.has(task.status)) {
      throw new Error("任务还在进行中，无法归档");
    }
    const sourceDir = waveDir(task.repo, id);
    if (existsSync(sourceDir)) {
      candidates.push({
        id,
        short: id.slice(0, 8),
        repo: task.repo,
        description: task.description,
        status: task.status,
        sourceDir,
      });
    }
  } else {
    for (const [id, task] of Object.entries(kanban)) {
      if (!_terminalSet.has(task.status)) continue;
      const sourceDir = waveDir(task.repo, id);
      if (!existsSync(sourceDir)) continue;
      candidates.push({
        id,
        short: id.slice(0, 8),
        repo: task.repo,
        description: task.description,
        status: task.status,
        sourceDir,
      });
    }
  }

  return candidates;
}

async function readIndex(): Promise<IndexEntry[]> {
  const p = archiveIndexPath();
  if (!existsSync(p)) return [];
  try {
    const raw = await readFile(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeIndex(entries: IndexEntry[]): Promise<void> {
  const p = archiveIndexPath();
  entries.sort((a, b) => (a.archived < b.archived ? 1 : -1));
  await writeFile(p, JSON.stringify(entries, null, 2) + "\n", "utf-8");
}

async function verifyCopy(src: string, dst: string): Promise<boolean> {
  try {
    const srcFiles = await readdir(src);
    const dstFiles = new Set(await readdir(dst));
    for (const f of srcFiles) {
      if (!dstFiles.has(f)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function removeEmptyRepoDir(repo: string): Promise<void> {
  const repoDir = join(KANBAN_ROOT, repo);
  if (!existsSync(repoDir)) return;
  const entries = await readdir(repoDir);
  if (entries.length === 0) {
    await rm(repoDir, { recursive: true });
  }
}

async function doArchive(
  kanban: Kanban,
  candidates: ArchiveCandidate[],
): Promise<string[]> {
  const archived: string[] = [];
  const now = nowIso();
  let index = await readIndex();

  for (const c of candidates) {
    const dst = archiveDir(c.id);

    if (existsSync(dst)) {
      console.warn(`⚠️  已归档,跳过: ${c.short}`);
      continue;
    }

    // 1. cp source → archive
    await cp(c.sourceDir, dst, { recursive: true });

    // 2. write task.json
    const task = kanban[c.id];
    if (!task) {
      console.warn(`⚠️  kanban.json 中无 ${c.short},跳过`);
      continue;
    }
    await writeFile(
      archiveTaskPath(c.id),
      JSON.stringify({ [c.id]: task }, null, 2) + "\n",
      "utf-8",
    );

    // 3. update index
    const existing = index.findIndex((e) => e.id === c.id);
    const entry: IndexEntry = {
      id: c.id,
      repo: c.repo,
      description: c.description,
      archived: now,
      status: task.status,
    };
    if (existing >= 0) {
      index[existing] = entry;
    } else {
      index.push(entry);
    }

    // 4. verify
    if (!(await verifyCopy(c.sourceDir, dst))) {
      throw new Error(
        `复制验证失败: ${c.short}。源目录未删除,请手动检查`,
      );
    }

    // 5. rm source
    await rm(c.sourceDir, { recursive: true });

    // 6. remove from kanban
    delete kanban[c.id];

    // 7. clean empty repo dir
    await removeEmptyRepoDir(c.repo);

    archived.push(c.short);
  }

  await writeIndex(index);
  return archived;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.commit) {
    // 执行模式
    const result = await withKanbanLock(async (kanban: Kanban) => {
      const candidates = findCandidates(kanban, args.uuid);
      if (candidates.length === 0) {
        return { ok: true, archived: [], message: "无待归档任务" };
      }
      const archived = await doArchive(kanban, candidates);
      return { ok: true, archived };
    });

    console.log(JSON.stringify(result, null, 2));
  } else {
    // 扫描模式
    const kanban = await readKanban();
    const candidates = findCandidates(kanban, args.uuid);

    if (candidates.length === 0) {
      console.log(
        JSON.stringify(
          { candidates: [], dryRun: true, message: "无待归档任务" },
          null,
          2,
        ),
      );
    } else {
      console.log(
        JSON.stringify(
          {
            candidates: candidates.map((c) => ({
              id: c.id,
              short: c.short,
              repo: c.repo,
              description: c.description,
              status: c.status,
            })),
            dryRun: true,
          },
          null,
          2,
        ),
      );
    }
  }
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
