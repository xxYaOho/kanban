#!/usr/bin/env bun
import { existsSync, readFileSync } from "fs";
import { basename, join } from "path";
import { readKanban, resolveUuid, type Task } from "./kanban-io";
import { parseFrontmatter } from "./issue-io";
import { fromKanbanRel, waveDir } from "./paths";

type Severity = "error" | "warning";

interface DoctorIssue {
  severity: Severity;
  code: string;
  thread: string;
  path: string;
  message: string;
}

interface ArtifactResult {
  file: string | null;
  missing: boolean;
  valid: boolean;
  problem?: string;
  frontmatter?: Record<string, string>;
}

function artifactPath(task: Task, uuid: string, file: string | null | undefined): string | null {
  if (!file) return null;
  const resolved = fromKanbanRel(file);
  if (resolved !== file || file.startsWith("/")) return resolved;
  return join(waveDir(task.repo, uuid), basename(file));
}

function readArtifact(task: Task, uuid: string, file: string | null | undefined): ArtifactResult {
  const path = artifactPath(task, uuid, file);
  if (!file || !path || !existsSync(path)) {
    return { file: file ?? null, missing: true, valid: false, problem: "missing" };
  }
  const frontmatter = parseFrontmatter(readFileSync(path, "utf-8"));
  return { file, missing: false, valid: true, frontmatter };
}

function sameArtifactRef(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return basename(fromKanbanRel(a)) === basename(fromKanbanRel(b));
}

function expectFields(result: ArtifactResult, expected: Record<string, string>): ArtifactResult {
  if (result.missing || !result.frontmatter) return result;
  for (const [key, value] of Object.entries(expected)) {
    if (result.frontmatter[key] !== value) {
      return {
        ...result,
        valid: false,
        problem: `${key} expected ${value}, got ${result.frontmatter[key] ?? "(missing)"}`,
      };
    }
  }
  return result;
}

function addArtifactIssue(
  issues: DoctorIssue[],
  uuid: string,
  path: string,
  code: string,
  result: ArtifactResult,
): void {
  if (result.valid && !result.missing) return;
  issues.push({
    severity: "error",
    code,
    thread: uuid,
    path,
    message: `${result.file ?? "(missing file reference)"}: ${result.problem ?? "invalid artifact"}`,
  });
}

function validateDeveloperArtifacts(issues: DoctorIssue[], task: Task, uuid: string): void {
  for (const [key, entry] of Object.entries(task.developer ?? {})) {
    if (!["ready_for_test", "waiting_review", "review_approved"].includes(entry.status)) continue;
    const report = entry.reports.at(-1) ?? null;
    const reportResult = expectFields(readArtifact(task, uuid, report), {
      kind: "dev-report",
      uuid,
      worktree: key,
    });
    const selfReviewResult = expectFields(readArtifact(task, uuid, entry.self_review), {
      kind: "self-review",
      uuid,
      worktree: key,
    });
    addArtifactIssue(issues, uuid, `developer.${key}.reports[-1]`, "developer_report_invalid", reportResult);
    addArtifactIssue(issues, uuid, `developer.${key}.self_review`, "developer_self_review_invalid", selfReviewResult);

    if (!reportResult.frontmatter || !selfReviewResult.frontmatter) continue;
    if (entry.self_review && !sameArtifactRef(reportResult.frontmatter.self_review, entry.self_review)) {
      issues.push({
        severity: "error",
        code: "developer_report_pair_mismatch",
        thread: uuid,
        path: `developer.${key}.reports[-1]`,
        message: `report self_review expected ${entry.self_review}, got ${reportResult.frontmatter.self_review ?? "(missing)"}`,
      });
    }
    if (report && !sameArtifactRef(selfReviewResult.frontmatter.source_report, report)) {
      issues.push({
        severity: "error",
        code: "developer_self_review_pair_mismatch",
        thread: uuid,
        path: `developer.${key}.self_review`,
        message: `self-review source_report expected ${report}, got ${selfReviewResult.frontmatter.source_report ?? "(missing)"}`,
      });
    }
    if (reportResult.frontmatter.attempt !== selfReviewResult.frontmatter.attempt) {
      issues.push({
        severity: "error",
        code: "developer_artifact_attempt_mismatch",
        thread: uuid,
        path: `developer.${key}`,
        message: `report/self-review attempt mismatch: ${reportResult.frontmatter.attempt ?? "(missing)"} vs ${selfReviewResult.frontmatter.attempt ?? "(missing)"}`,
      });
    }
  }
}

function validateTesterArtifacts(issues: DoctorIssue[], task: Task, uuid: string): void {
  for (const [key, entry] of Object.entries(task.tester ?? {})) {
    if (entry.status !== "done") continue;
    const result = expectFields(readArtifact(task, uuid, entry.report), {
      kind: "test-report",
      uuid,
      verdict: "pass",
    });
    addArtifactIssue(issues, uuid, `tester.${key}.report`, "tester_report_invalid", result);
  }
}

function validateIntegratorArtifacts(issues: DoctorIssue[], task: Task, uuid: string): void {
  for (const [key, entry] of Object.entries(task.integrator ?? {})) {
    if (entry.status !== "done") continue;
    const result = expectFields(readArtifact(task, uuid, entry.report), {
      kind: "integration-report",
      uuid,
    });
    addArtifactIssue(issues, uuid, `integrator.${key}.report`, "integrator_report_invalid", result);
  }
}

function hasIntegratorRequiredDecision(task: Task): boolean {
  return Object.values(task.owner ?? {})
    .flatMap((entry) => entry.decisions ?? [])
    .some((decision) => decision.type === "integrator_required");
}

function validateOwnerCloseout(issues: DoctorIssue[], task: Task, uuid: string): void {
  if (!hasIntegratorRequiredDecision(task)) return;
  const hasDoneIntegrator = Object.values(task.integrator ?? {})
    .some((entry) => entry.status === "done" && Boolean(entry.report));
  if (!hasDoneIntegrator) {
    issues.push({
      severity: "error",
      code: "owner_integrator_required_unresolved",
      thread: uuid,
      path: "owner.*.decisions",
      message: "owner has integrator_required decision but no done integrator report",
    });
  }
}

function validateTaskFiles(issues: DoctorIssue[], task: Task, uuid: string): void {
  const dir = waveDir(task.repo, uuid);
  if (!existsSync(dir)) {
    issues.push({
      severity: "error",
      code: "task_dir_missing",
      thread: uuid,
      path: dir,
      message: "task directory does not exist",
    });
  }
  const planPath = fromKanbanRel(task.plan);
  if (!existsSync(planPath)) {
    issues.push({
      severity: "error",
      code: "plan_missing",
      thread: uuid,
      path: "plan",
      message: `${task.plan} does not exist`,
    });
  }
}

function diagnoseTask(task: Task, uuid: string): DoctorIssue[] {
  const issues: DoctorIssue[] = [];
  validateTaskFiles(issues, task, uuid);
  validateDeveloperArtifacts(issues, task, uuid);
  validateTesterArtifacts(issues, task, uuid);
  validateIntegratorArtifacts(issues, task, uuid);
  validateOwnerCloseout(issues, task, uuid);
  return issues;
}

async function main() {
  const [uuidPrefix] = Bun.argv.slice(2);
  const kanban = await readKanban();
  let selected: string[];
  if (uuidPrefix) {
    if (kanban[uuidPrefix]) {
      selected = [uuidPrefix];
    } else {
      const matches = resolveUuid(kanban, uuidPrefix);
      if (matches.length === 0) throw new Error(`找不到任务: ${uuidPrefix}`);
      if (matches.length > 1) throw new Error(`UUID 前缀 ${uuidPrefix} 多候选: ${matches.join(", ")}`);
      selected = matches;
    }
  } else {
    selected = Object.keys(kanban);
  }

  const issues = selected.flatMap((uuid) => diagnoseTask(kanban[uuid], uuid));
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const result = {
    ok: errorCount === 0,
    threadCount: selected.length,
    issueCount: issues.length,
    errorCount,
    warningCount,
    issues,
  };
  console.log(JSON.stringify(result, null, 2));
  if (errorCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error("❌ doctor 失败:", err?.message ?? err);
  process.exit(1);
});
