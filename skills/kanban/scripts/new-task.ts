#!/usr/bin/env bun
/**
 * /kanban --new 实现
 *
 * 参数:
 *   --mode <extract|fromFile|draft>
 *   --repo <repo>
 *   --description <desc>
 *   --plan-file <path>          (fromFile 模式必填;extract/draft 模式可选)
 *   --plan-content-file <path>  (extract 模式:Agent 整理好的 plan 写到临时文件,脚本读取)
 *   --worktrees-json <json>     可选,整体 worktree 字典的 JSON
 *   --draft                     (与 fromFile 同用 → 文件导入 + 草案)
 *
 * stdout:JSON { uuid, short, dir, planTarget, status }
 */
import { mkdir, writeFile, copyFile, readFile, stat } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { resolve, dirname } from "path";
import { withKanbanLock } from "./kanban-lock";
import { waveDir, toKanbanRel } from "./paths";
import type { Task, Worktree, WorktreeRole, WorktreeStatus } from "./kanban-io";

type Mode = "extract" | "fromFile" | "draft";

interface Args {
  mode: Mode;
  repo: string;
  description: string;
  planFile?: string;
  planContentFile?: string;
  worktreesJson?: string;
  draft: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> & { draft: boolean } = { draft: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--mode":
        a.mode = v as Mode;
        i++;
        break;
      case "--repo":
        a.repo = v;
        i++;
        break;
      case "--description":
        a.description = v;
        i++;
        break;
      case "--plan-file":
        a.planFile = v;
        i++;
        break;
      case "--plan-content-file":
        a.planContentFile = v;
        i++;
        break;
      case "--worktrees-json":
        a.worktreesJson = v;
        i++;
        break;
      case "--draft":
        a.draft = true;
        break;
    }
  }
  if (!a.mode || !a.repo || !a.description) {
    throw new Error("缺参: --mode --repo --description 都是必填");
  }
  return a as Args;
}

function normalizeWorktrees(
  raw: unknown,
): Record<string, Partial<Worktree>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Partial<Worktree>> = {};
  for (const [name, v] of Object.entries(raw as Record<string, any>)) {
    if (!v || typeof v !== "object") continue;
    const role = v.role as WorktreeRole | undefined;
    const action = typeof v.action === "string" ? v.action : "";
    if (!role || !["developer", "reviewer", "test"].includes(role)) continue;
    out[name] = {
      role,
      action,
      status: "idle" as WorktreeStatus,
      attempt: 0,
      report: null,
      review: null,
      test: null,
      error: null,
      blocked_on: null,
    };
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // 1. 生成 UUID(Bun 支持 crypto.randomUUID;若有 uuidv7 库可替换)
  const uuid = randomUUID().toLowerCase();
  const short = uuid.slice(0, 8);

  // 2. 建工作目录
  const dir = waveDir(args.repo, uuid);
  await mkdir(dir, { recursive: true });
  const planTarget = resolve(dir, "plan.md");

  // 3. 写 plan.md(按模式)
  if (args.mode === "fromFile") {
    if (!args.planFile) throw new Error("fromFile 模式必须传 --plan-file");
    const src = resolve(args.planFile);
    if (!existsSync(src)) throw new Error(`--plan-file 不存在: ${src}`);
    await copyFile(src, planTarget);
  } else if (args.mode === "extract") {
    if (!args.planContentFile) throw new Error("extract 模式必须传 --plan-content-file");
    const content = await readFile(resolve(args.planContentFile), "utf-8");
    await writeFile(planTarget, content, "utf-8");
  } else {
    // draft 模式:占位
    await writeFile(
      planTarget,
      `# ${args.description}\n\n(草案,待完善)\n`,
      "utf-8",
    );
  }

  // 4. 决定 status
  const isDraft = args.draft || args.mode === "draft";
  const status = isDraft ? "draft" : "planned";

  // 5. 解析 worktrees
  let worktrees: Record<string, Partial<Worktree>> = {};
  if (args.worktreesJson) {
    try {
      worktrees = normalizeWorktrees(JSON.parse(args.worktreesJson));
    } catch (e) {
      throw new Error(`--worktrees-json 解析失败: ${(e as Error).message}`);
    }
  }

  // 6. planned 的基本校验(如果不是 draft)
  if (status === "planned") {
    const planStat = await stat(planTarget);
    if (planStat.size === 0) {
      throw new Error("planned 状态要求 plan.md 非空");
    }
    if (Object.keys(worktrees).length === 0) {
      throw new Error(
        "planned 状态要求 worktree 至少一个条目(传 --worktrees-json)。" +
          "若暂时没想好 worktree 划分,改走 --draft",
      );
    }
  }

  // 7. 原子写入
  await withKanbanLock(async (kanban) => {
    if (kanban[uuid]) throw new Error(`UUID 冲突: ${uuid}`);
    const task: Task = {
      status,
      repo: args.repo,
      description: args.description,
      plan: toKanbanRel(planTarget),
      created: new Date().toISOString(),
      worktree: worktrees,
    };
    kanban[uuid] = task;
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        uuid,
        short,
        dir,
        planTarget: toKanbanRel(planTarget),
        status,
        worktrees: Object.keys(worktrees),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("❌ new-task 失败:", err?.message ?? err);
  process.exit(1);
});
