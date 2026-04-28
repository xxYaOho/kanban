#!/usr/bin/env bun
/**
 * /kanban --new 实现
 *
 * 参数:
 *   --mode <extract|fromFile|blank>
 *   --repo <repo>
 *   --description <desc>
 *   --plan-content-file <path>   extract 模式:Agent 整理好的 plan 写到临时文件
 *   --plan-file <path>           fromFile 模式:原始文件路径(脚本负责拷贝)
 *   --plan-ref <path>            引用已有 plan 文件(不拷贝,plan 字段存原始路径)
 *   --draft-ref <path>           可选:原始需求草稿路径(记录用,不拷贝)
 *   --worktrees-json <json>      可选:worktree 字典 JSON
 *
 * stdout: JSON { uuid, short, dir, planTarget, status }
 */
import { mkdir, writeFile, copyFile, stat, readFile } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { resolve } from "path";
import { withKanbanLock } from "./kanban-lock";
import { waveDir, toKanbanRel } from "./paths";
import type { Task, Worktree, WorktreeRole, WorktreeStatus } from "./kanban-io";
import { VALID_ROLES, nowIso } from "./kanban-io";

type Mode = "extract" | "fromFile" | "blank";

interface Args {
  mode: Mode;
  repo: string;
  description: string;
  planContentFile?: string;
  planFile?: string;
  planRef?: string;
  draftRef?: string;
  worktreesJson?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--mode": a.mode = v as Mode; i++; break;
      case "--repo": a.repo = v; i++; break;
      case "--description": a.description = v; i++; break;
      case "--plan-content-file": a.planContentFile = v; i++; break;
      case "--plan-file": a.planFile = v; i++; break;
      case "--plan-ref": a.planRef = v; i++; break;
      case "--draft-ref": a.draftRef = v; i++; break;
      case "--worktrees-json": a.worktreesJson = v; i++; break;
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
    if (!role || !(VALID_ROLES as readonly string[]).includes(role)) continue;
    out[name] = {
      role,
      action,
      status: "idle" as WorktreeStatus,
      attempt: 0,
      report: null,
      review: null,
      test: null,
      integration: null,
      error: null,
      blocked_on: null,
    };
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const uuid = randomUUID().toLowerCase();
  const short = uuid.slice(0, 8);
  const dir = waveDir(args.repo, uuid);
  const planTarget = resolve(dir, "plan.md");
  await mkdir(dir, { recursive: true });
  let planPath: string;

  // 写 plan.md（或引用已有文件）
  if (args.planRef) {
    const ref = resolve(args.planRef).replace(/^\/Users\/[^/]+/, "~");
    if (!existsSync(resolve(args.planRef))) throw new Error(`--plan-ref 不存在: ${args.planRef}`);
    planPath = ref;
  } else {
    if (args.mode === "fromFile") {
      if (!args.planFile) throw new Error("fromFile 模式必须传 --plan-file");
      const src = resolve(args.planFile);
      if (!existsSync(src)) throw new Error(`--plan-file 不存在: ${src}`);
      await copyFile(src, planTarget);
      planPath = toKanbanRel(planTarget);
    } else if (args.mode === "extract") {
      if (!args.planContentFile) throw new Error("extract 模式必须传 --plan-content-file");
      const content = await readFile(resolve(args.planContentFile), "utf-8");
      await writeFile(planTarget, content, "utf-8");
      planPath = toKanbanRel(planTarget);
    } else {
      // blank
      await writeFile(planTarget, `# ${args.description}\n\n(待完善)\n`, "utf-8");
      planPath = toKanbanRel(planTarget);
    }
  }

  // 决定 status
  const isBlank = args.mode === "blank";
  const status = isBlank ? "draft" : "planned";

  // 解析 worktrees
  let worktrees: Record<string, Partial<Worktree>> = {};
  if (args.worktreesJson) {
    try {
      worktrees = normalizeWorktrees(JSON.parse(args.worktreesJson));
    } catch (e) {
      throw new Error(`--worktrees-json 解析失败: ${(e as Error).message}`);
    }
  }

  // planned 校验
  if (status === "planned" && !args.planRef) {
    const planStat = await stat(planTarget);
    if (planStat.size === 0) throw new Error("planned 状态要求 plan.md 非空");
    const planContent = await readFile(planTarget, "utf-8");
    if (planContent.trim().length === 0) throw new Error("planned 状态要求 plan.md 内容非空白");
  }
  if (status === "planned" && Object.keys(worktrees).length === 0) {
    throw new Error(
      "planned 状态要求 worktree 至少一个条目。若暂时没想好,改走 blank 模式",
    );
  }

  // 原子写入
  await withKanbanLock(async (kanban) => {
    if (kanban[uuid]) throw new Error(`UUID 冲突: ${uuid}`);
    const task: Task = {
      status,
      repo: args.repo,
      description: args.description,
      draft: args.draftRef ?? null,
      plan: planPath,
      created: nowIso(),
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
        planTarget: args.planRef ? planPath : toKanbanRel(planTarget),
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
