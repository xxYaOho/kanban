#!/usr/bin/env bun
/**
 * vNext action-based write wrapper.
 *
 * This keeps v1 field setters intact while introducing guarded, artifact-aware
 * transitions for owner/developer/reviewer closeout flow.
 */
import { existsSync, readFileSync } from "fs";
import { basename } from "path";
import { withKanbanLock } from "./kanban-lock";
import {
  nowIso,
  resolveUuid,
  type DevEntry,
  type Kanban,
  type OwnerDecision,
  type Task,
} from "./kanban-io";
import { fromKanbanRel, waveDir } from "./paths";
import { parseFrontmatter } from "./issue-io";

type Action =
  | "owner.register"
  | "owner.request-reviewer-gate"
  | "developer.submit-report"
  | "reviewer.submit-gate-review"
  | "owner.closeout";

interface Args {
  action: Action;
  uuid: string;
  key?: string;
  target?: string;
  brief?: string;
  reason?: string;
  evidence?: string;
  report?: string;
  selfReview?: string;
  review?: string;
  verdict?: "approve" | "reject";
  closeout?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--action":
        if (!v) throw new Error("--action 缺少值");
        a.action = v as Action;
        i++;
        break;
      case "--thread":
      case "--uuid":
        if (!v) throw new Error(`${k} 缺少值`);
        a.uuid = v;
        i++;
        break;
      case "--key":
      case "--worktree":
        if (!v) throw new Error(`${k} 缺少值`);
        a.key = v;
        i++;
        break;
      case "--target":
        if (!v) throw new Error("--target 缺少值");
        a.target = v;
        i++;
        break;
      case "--brief":
        if (!v) throw new Error("--brief 缺少值");
        a.brief = v;
        i++;
        break;
      case "--reason":
        if (!v) throw new Error("--reason 缺少值");
        a.reason = v;
        i++;
        break;
      case "--evidence":
        if (!v) throw new Error("--evidence 缺少值");
        a.evidence = v;
        i++;
        break;
      case "--report":
        if (!v) throw new Error("--report 缺少值");
        a.report = v;
        i++;
        break;
      case "--self-review":
        if (!v) throw new Error("--self-review 缺少值");
        a.selfReview = v;
        i++;
        break;
      case "--review":
        if (!v) throw new Error("--review 缺少值");
        a.review = v;
        i++;
        break;
      case "--verdict":
        if (v !== "approve" && v !== "reject") throw new Error("--verdict 必须是 approve 或 reject");
        a.verdict = v;
        i++;
        break;
      case "--closeout":
        if (!v) throw new Error("--closeout 缺少值");
        a.closeout = v;
        i++;
        break;
      default:
        throw new Error(`未知参数: ${k}`);
    }
  }
  if (!a.action) throw new Error("缺少 --action");
  if (!a.uuid) throw new Error("缺少 --thread");
  return a as Args;
}

function resolveTaskUuid(kanban: Kanban, prefix: string): string {
  if (kanban[prefix]) return prefix;
  const matches = resolveUuid(kanban, prefix);
  if (matches.length === 0) throw new Error(`找不到任务: ${prefix}`);
  if (matches.length > 1) throw new Error(`UUID 前缀 ${prefix} 多候选: ${matches.join(", ")}`);
  return matches[0];
}

function filename(value: string): string {
  return basename(fromKanbanRel(value));
}

function artifactPath(task: Task, uuid: string, value: string): string {
  const path = fromKanbanRel(value);
  if (path !== value || value.startsWith("/")) return path;
  return `${waveDir(task.repo, uuid)}/${filename(value)}`;
}

function readArtifactFrontmatter(task: Task, uuid: string, value: string): Record<string, string> {
  const path = artifactPath(task, uuid, value);
  if (!existsSync(path)) throw new Error(`artifact 不存在: ${path}`);
  return parseFrontmatter(readFileSync(path, "utf-8"));
}

function assertFm(fm: Record<string, string>, key: string, expected: string): void {
  if (fm[key] !== expected) {
    throw new Error(`frontmatter ${key} 应为 ${expected}, 实际 ${fm[key] ?? "(missing)"}`);
  }
}

function hasActiveEntries(task: Task): boolean {
  for (const role of ["developer", "reviewer", "tester", "integrator"] as const) {
    for (const entry of Object.values(task[role] ?? {})) {
      if (entry.status !== "idle" || entry.attempt > 0) return true;
    }
  }
  return false;
}

function activeIntegratorEntries(task: Task): string[] {
  const decisions = Object.values(task.owner ?? {}).flatMap((entry) => entry.decisions ?? []);
  const hasIntegratorDecision = decisions.some((decision) => decision.type === "integrator_required");
  const active = Object.entries(task.integrator ?? {})
    .filter(([, entry]) =>
      entry.status !== "done" && (
        entry.attempt > 0 ||
        Boolean(entry.report) ||
        (entry.merged ?? []).length > 0 ||
        (entry.conflicts ?? []).length > 0 ||
        hasIntegratorDecision
      )
    )
    .map(([key]) => key);
  return active;
}

function ownerRegister(task: Task, args: Args): string[] {
  const key = args.key ?? "main";
  if (Object.keys(task.owner ?? {}).length > 0) throw new Error("owner 已存在");
  if (hasActiveEntries(task)) throw new Error("已有席位进入工作状态,不能注册 owner");
  task.owner[key] = {
    status: "idle",
    brief: args.brief ?? "主线协调、计划和收尾",
    attempt: 0,
    worktree: key === "main" ? "main" : key,
    cwd: key === "main" ? "main" : key,
    decisions: [],
    closeout: "",
    error: null,
  };
  return [`owner.${key}`];
}

function requestReviewerGate(task: Task, args: Args): string[] {
  if (!args.target) throw new Error("owner.request-reviewer-gate 缺少 --target");
  const dev = task.developer?.[args.target];
  if (!dev) throw new Error(`developer.${args.target} 不存在`);
  const ownerKey = args.key ?? Object.keys(task.owner ?? {})[0];
  if (!ownerKey || !task.owner?.[ownerKey]) throw new Error("owner 不存在,不能请求 reviewer gate");
  const decision: OwnerDecision = {
    type: "reviewer_gate",
    target: `developer.${args.target}`,
    reason: args.reason ?? "reviewer gate requested",
    created: nowIso(),
    evidence: args.evidence ? filename(args.evidence) : null,
  };
  task.owner[ownerKey].decisions = [...(task.owner[ownerKey].decisions ?? []), decision];
  dev.review_gate_required = true;
  const applied = [`owner.${ownerKey}.decisions+=reviewer_gate`, `developer.${args.target}.review_gate_required=true`];
  if (dev.status === "ready_for_test") {
    dev.status = "waiting_review";
    applied.push(`developer.${args.target}.status=waiting_review`);
  }
  return applied;
}

function submitDeveloperReport(task: Task, uuid: string, args: Args): string[] {
  if (!args.key) throw new Error("developer.submit-report 缺少 --worktree");
  if (!args.report) throw new Error("developer.submit-report 缺少 --report");
  if (!args.selfReview) throw new Error("developer.submit-report 缺少 --self-review");
  const dev = task.developer?.[args.key];
  if (!dev) throw new Error(`developer.${args.key} 不存在`);
  const reportFile = filename(args.report);
  const selfReviewFile = filename(args.selfReview);
  const reportFm = readArtifactFrontmatter(task, uuid, reportFile);
  const selfReviewFm = readArtifactFrontmatter(task, uuid, selfReviewFile);
  assertFm(reportFm, "kind", "dev-report");
  assertFm(reportFm, "uuid", uuid);
  assertFm(reportFm, "worktree", args.key);
  assertFm(reportFm, "self_review", selfReviewFile);
  assertFm(selfReviewFm, "kind", "self-review");
  assertFm(selfReviewFm, "uuid", uuid);
  assertFm(selfReviewFm, "worktree", args.key);
  assertFm(selfReviewFm, "source_report", reportFile);
  if (reportFm.attempt !== selfReviewFm.attempt) {
    throw new Error(`report/self-review attempt 不一致: ${reportFm.attempt} vs ${selfReviewFm.attempt}`);
  }
  dev.reports = [...(dev.reports ?? []), reportFile];
  dev.self_review = selfReviewFile;
  dev.status = dev.review_gate_required ? "waiting_review" : "ready_for_test";
  dev.error = null;
  return [
    `developer.${args.key}.reports+=${reportFile}`,
    `developer.${args.key}.self_review=${selfReviewFile}`,
    `developer.${args.key}.status=${dev.status}`,
  ];
}

function submitGateReview(task: Task, uuid: string, args: Args): string[] {
  if (!args.target) throw new Error("reviewer.submit-gate-review 缺少 --target");
  if (!args.review) throw new Error("reviewer.submit-gate-review 缺少 --review");
  if (!args.verdict) throw new Error("reviewer.submit-gate-review 缺少 --verdict");
  const dev = task.developer?.[args.target];
  if (!dev) throw new Error(`developer.${args.target} 不存在`);
  if (dev.status !== "waiting_review") throw new Error(`developer.${args.target} 不是 waiting_review`);
  const reviewFile = filename(args.review);
  const fm = readArtifactFrontmatter(task, uuid, reviewFile);
  assertFm(fm, "kind", "review");
  assertFm(fm, "uuid", uuid);
  assertFm(fm, "worktree", args.target);
  assertFm(fm, "verdict", args.verdict);
  dev.review = reviewFile;
  dev.review_gate_required = false;
  dev.status = args.verdict === "approve" ? "ready_for_test" : "review_rejected";
  return [
    `developer.${args.target}.review=${reviewFile}`,
    `developer.${args.target}.review_gate_required=false`,
    `developer.${args.target}.status=${dev.status}`,
  ];
}

function submitOwnerCloseout(task: Task, uuid: string, args: Args): string[] {
  const ownerKey = args.key ?? Object.keys(task.owner ?? {})[0];
  if (!ownerKey || !task.owner?.[ownerKey]) throw new Error("owner 不存在,不能 closeout");
  if (!args.closeout) throw new Error("owner.closeout 缺少 --closeout");
  const testers = Object.values(task.tester ?? {});
  if (testers.length === 0 || testers.some((entry) => entry.status !== "done")) {
    throw new Error("owner.closeout 前 tester 必须全部 done");
  }
  const activeIntegrators = activeIntegratorEntries(task);
  if (activeIntegrators.length > 0) {
    const notDone = activeIntegrators.filter((key) => task.integrator[key]?.status !== "done" || !task.integrator[key]?.report);
    if (notDone.length > 0) {
      throw new Error(`active integrator 未完成: ${notDone.join(", ")}`);
    }
  }
  const closeoutFile = filename(args.closeout);
  const fm = readArtifactFrontmatter(task, uuid, closeoutFile);
  assertFm(fm, "kind", "owner-closeout");
  assertFm(fm, "uuid", uuid);
  assertFm(fm, "owner", ownerKey);
  task.owner[ownerKey].closeout = closeoutFile;
  task.owner[ownerKey].status = "done";
  task.status = "done";
  return [`owner.${ownerKey}.closeout=${closeoutFile}`, "task.status=done"];
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const result = await withKanbanLock((kanban: Kanban) => {
    const uuid = resolveTaskUuid(kanban, args.uuid);
    const task = kanban[uuid];
    let applied: string[];
    switch (args.action) {
      case "owner.register":
        applied = ownerRegister(task, args);
        break;
      case "owner.request-reviewer-gate":
        applied = requestReviewerGate(task, args);
        break;
      case "developer.submit-report":
        applied = submitDeveloperReport(task, uuid, args);
        break;
      case "reviewer.submit-gate-review":
        applied = submitGateReview(task, uuid, args);
        break;
      case "owner.closeout":
        applied = submitOwnerCloseout(task, uuid, args);
        break;
      default:
        throw new Error(`未知 action: ${args.action}`);
    }
    return {
      taskUuid: uuid,
      taskShort: uuid.slice(0, 8),
      action: args.action,
      applied,
      taskStatus: task.status,
    };
  });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
