#!/usr/bin/env bun
/**
 * /kanban --new 实现
 *
 * 参数:
 *   --mode <extract|fromFile|blank>
 *   --repo <repo>
 *   --description <desc>
 *   --plan-content-file <path>   extract 模式
 *   --plan-file <path>           fromFile 模式
 *   --plan-ref <path>            引用已有 plan 文件
 *   --draft-ref <path>           可选:原始需求草稿路径
 *   --worktrees-json <json>      可选:role 条目字典 JSON
 *
 * stdout: JSON { uuid, short, dir, planTarget, status }
 */
import { mkdir, writeFile, copyFile, stat, readFile } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { resolve } from "path";
import { withKanbanLock } from "./kanban-lock";
import { waveDir, toKanbanRel } from "./paths";
import type { Task, DevEntry, ReviewerEntry, TestEntry, IntegratorEntry } from "./kanban-io";
import { nowIso } from "./kanban-io";

type Mode = "extract" | "fromFile" | "blank";
type RoleKey = "developer" | "reviewer" | "test" | "integrator";

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

function normalizeWorktrees(raw: unknown): {
  developer: Record<string, Partial<DevEntry>>;
  reviewer: Record<string, Partial<ReviewerEntry>>;
  test: Record<string, Partial<TestEntry>>;
  integrator: Record<string, Partial<IntegratorEntry>>;
} {
  const out = {
    developer: {} as Record<string, Partial<DevEntry>>,
    reviewer: {} as Record<string, Partial<ReviewerEntry>>,
    test: {} as Record<string, Partial<TestEntry>>,
    integrator: {} as Record<string, Partial<IntegratorEntry>>,
  };
  if (!raw || typeof raw !== "object") return out;
  for (const [name, v] of Object.entries(raw as Record<string, any>)) {
    if (!v || typeof v !== "object") continue;
    const role = v.role as string | undefined;
    const brief = typeof v.brief === "string" ? v.brief : (typeof v.action === "string" ? v.action : "");
    if (!role || !["developer", "reviewer", "test", "integrator"].includes(role)) continue;
    if (!brief.trim()) continue;

    switch (role) {
      case "developer":
        out.developer[name] = {
          status: "idle",
          brief,
          attempt: 0,
          blocked_on: typeof v.blocked_on === "string" ? v.blocked_on : null,
          worktree: null,
          cwd: null,
          reports: [],
          review: null,
          error: null,
        };
        break;
      case "reviewer":
        out.reviewer[name] = {
          status: "idle",
          brief,
          attempt: 0,
          pass: [],
          report: "",
          error: null,
        };
        break;
      case "test":
        out.test[name] = {
          status: "idle",
          brief,
          attempt: 0,
          worktree: null,
          cwd: null,
          pass: [],
          fail: [],
          report: "",
          error: null,
        };
        break;
      case "integrator":
        out.integrator[name] = {
          status: "idle",
          brief,
          attempt: 0,
          worktree: null,
          cwd: null,
          merged: [],
          conflicts: [],
          report: "",
          error: null,
        };
        break;
    }
  }
  return out;
}

function validateDevChains(devs: Record<string, Partial<DevEntry>>): Record<string, string> {
  const names = Object.keys(devs);
  if (names.length < 2) return {};

  // 1. blocked_on 引用的目标必须存在
  for (const name of names) {
    const blocked = devs[name].blocked_on;
    if (blocked && !devs[blocked]) {
      throw new Error(
        `blocked_on 校验失败: developer.${name}.blocked_on="${blocked}" 但 ${blocked} 不存在于 developer 集合中`,
      );
    }
    if (blocked === name) {
      throw new Error(`blocked_on 校验失败: developer.${name} 不能阻塞自身`);
    }
  }

  // 2. 环形依赖检测
  for (const start of names) {
    const visited = new Set<string>();
    let cur: string | null | undefined = start;
    while (cur && devs[cur]?.blocked_on) {
      if (visited.has(cur)) {
        throw new Error(
          `blocked_on 环形依赖: ${[...visited, cur].join(" → ")}`,
        );
      }
      visited.add(cur);
      cur = devs[cur].blocked_on;
      if (visited.size > names.length) break; // 安全上限
    }
  }

  // 构建链映射
  const chains: Record<string, string> = {};
  for (const name of names) {
    if (devs[name].blocked_on) {
      chains[name] = devs[name].blocked_on!;
    }
  }
  return chains;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const uuid = randomUUID().toLowerCase();
  const short = uuid.slice(0, 8);
  const dir = waveDir(args.repo, uuid);
  const planTarget = resolve(dir, "plan.md");
  await mkdir(dir, { recursive: true });
  let planPath: string;

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
      await writeFile(planTarget, `# ${args.description}\n\n(待完善)\n`, "utf-8");
      planPath = toKanbanRel(planTarget);
    }
  }

  const isBlank = args.mode === "blank";
  const status = isBlank ? "draft" : "planned";

  let worktrees = normalizeWorktrees(
    args.worktreesJson ? JSON.parse(args.worktreesJson) : {},
  );

  const blockedOnChains = validateDevChains(worktrees.developer);

  // planned 校验
  if (status === "planned" && !args.planRef) {
    const planStat = await stat(planTarget);
    if (planStat.size === 0) throw new Error("planned 状态要求 plan.md 非空");
    const planContent = await readFile(planTarget, "utf-8");
    if (planContent.trim().length === 0) throw new Error("planned 状态要求 plan.md 内容非空白");
  }
  const allNames = Object.values(worktrees).flatMap((r) => Object.keys(r));
  if (status === "planned" && allNames.length === 0) {
    throw new Error(
      "planned 状态要求至少一个 role 条目。若暂时没想好,改走 blank 模式",
    );
  }

  await withKanbanLock(async (kanban) => {
    if (kanban[uuid]) throw new Error(`UUID 冲突: ${uuid}`);
    const task: Task = {
      status,
      repo: args.repo,
      description: args.description,
      draft: args.draftRef ?? null,
      plan: planPath,
      created: nowIso(),
      developer: worktrees.developer as Record<string, DevEntry>,
      reviewer: worktrees.reviewer as Record<string, ReviewerEntry>,
      test: worktrees.test as Record<string, TestEntry>,
      integrator: worktrees.integrator as Record<string, IntegratorEntry>,
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
        entries: Object.fromEntries(
          (["developer", "reviewer", "test", "integrator"] as const).map(
            (rk) => [rk, Object.keys(worktrees[rk])],
          ),
        ),
        blockedOnChains,
        hasBlockedDeveloper: Object.keys(blockedOnChains).length > 0,
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
