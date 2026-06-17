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
  type IntegratorEntry,
  type Kanban,
  type OwnerDecision,
  type Task,
  type TesterEntry,
} from "./kanban-io";
import { fromKanbanRel, waveDir } from "./paths";
import { listIssues, parseFrontmatter } from "./issue-io";

type Action =
  | "owner.register"
  | "owner.request-reviewer-gate"
  | "developer.submit-report"
  | "reviewer.submit-gate-review"
  | "tester.submit-cases"
  | "tester.submit-report"
  | "integrator.submit-integration-report"
  | "owner.closeout";

type Verdict = "approve" | "reject" | "pass" | "fail";

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
  verdict?: Verdict;
  closeout?: string;
  caseDocument?: string;
  targets: string[];
  merged: string[];
  conflicts: string[];
}

function isVerdict(value: string): value is Verdict {
  return ["approve", "reject", "pass", "fail"].includes(value);
}

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> = {};
  const targets: string[] = [];
  const merged: string[] = [];
  const conflicts: string[] = [];
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
        targets.push(v);
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
        if (!v || !isVerdict(v)) {
          throw new Error("--verdict 必须是 approve/reject 或 pass/fail");
        }
        a.verdict = v;
        i++;
        break;
      case "--closeout":
        if (!v) throw new Error("--closeout 缺少值");
        a.closeout = v;
        i++;
        break;
      case "--case-document":
        if (!v) throw new Error("--case-document 缺少值");
        a.caseDocument = v;
        i++;
        break;
      case "--merged":
        if (!v) throw new Error("--merged 缺少值");
        merged.push(v);
        i++;
        break;
      case "--conflict":
      case "--conflicts":
        if (!v) throw new Error(`${k} 缺少值`);
        conflicts.push(v);
        i++;
        break;
      default:
        throw new Error(`未知参数: ${k}`);
    }
  }
  if (!a.action) throw new Error("缺少 --action");
  if (!a.uuid) throw new Error("缺少 --thread");
  a.targets = targets;
  a.merged = merged;
  a.conflicts = conflicts;
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

function relatedIssueRefs(fm: Record<string, string>): string[] {
  const value = fm.related_issue?.trim().replace(/^"(.*)"$/, "$1") ?? "";
  if (!value || value === "null") return [];
  return value
    .split(",")
    .map((item) => filename(item.trim()))
    .filter(Boolean);
}

function openIssuesForOwner(task: Task, uuid: string, owner: string) {
  return listIssues(task.repo, uuid, { status: "open" })
    .filter((issue) => issue.owner === owner);
}

function relatedIssuesFromReports(task: Task, uuid: string, reportFiles: string[]): Set<string> {
  const related = new Set<string>();
  for (const reportFile of reportFiles) {
    const fm = readArtifactFrontmatter(task, uuid, reportFile);
    for (const issueFile of relatedIssueRefs(fm)) {
      related.add(issueFile);
    }
  }
  return related;
}

function uncoveredOpenIssues(task: Task, uuid: string, owner: string, reportFiles: string[]) {
  const openIssues = openIssuesForOwner(task, uuid, owner);
  if (openIssues.length === 0) return [];
  const related = relatedIssuesFromReports(task, uuid, reportFiles);
  return openIssues.filter((issue) => !related.has(issue.file));
}

function assertFm(fm: Record<string, string>, key: string, expected: string): void {
  if (fm[key] !== expected) {
    throw new Error(`frontmatter ${key} 应为 ${expected}, 实际 ${fm[key] ?? "(missing)"}`);
  }
}

function assertFmOneOf(fm: Record<string, string>, key: string, expected: string[]): void {
  if (!expected.includes(fm[key] ?? "")) {
    throw new Error(`frontmatter ${key} 应为 ${expected.join(" 或 ")}, 实际 ${fm[key] ?? "(missing)"}`);
  }
}

function parseFmList(value: string | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed || trimmed === "null") return [];
  const unquoted = trimmed.replace(/^"(.*)"$/, "$1");
  if (unquoted.startsWith("[") && unquoted.endsWith("]")) {
    try {
      const parsed = JSON.parse(unquoted);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {
      // Fall through to permissive comma parser. Frontmatter examples are often YAML-ish.
    }
    return unquoted
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return unquoted
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFmNumber(fm: Record<string, string>, key: string): number {
  const value = fm[key];
  if (!value || !/^\d+$/.test(value)) {
    throw new Error(`frontmatter ${key} 必须是非负整数, 实际 ${value ?? "(missing)"}`);
  }
  return Number(value);
}

function assertSameMembers(actual: string[], expected: string[], label: string): void {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = [...expectedSet].filter((item) => !actualSet.has(item));
  const extra = [...actualSet].filter((item) => !expectedSet.has(item));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`${label} 与 frontmatter 不一致: missing=${missing.join(",") || "none"} extra=${extra.join(",") || "none"}`);
  }
}

function assertTaskActive(task: Task): void {
  if (task.status !== "planned" && task.status !== "in_progress") {
    throw new Error(`task.status 必须是 planned 或 in_progress, 实际 ${task.status}`);
  }
}

function assertAttemptCanApply(entry: { attempt: number }, attemptRaw: string | undefined, label: string): number {
  const attempt = parseFmNumber({ attempt: attemptRaw ?? "" }, "attempt");
  if (entry.attempt > 0 && attempt < entry.attempt) {
    throw new Error(`${label} attempt 不能回退: ${attempt} < ${entry.attempt}`);
  }
  entry.attempt = attempt;
  return attempt;
}

function registeredDeveloperReports(task: Task): Set<string> {
  const reports = new Set<string>();
  for (const dev of Object.values(task.developer ?? {})) {
    for (const report of dev.reports ?? []) reports.add(filename(report));
  }
  return reports;
}

function assertKnownDevelopers(task: Task, keys: string[], label: string): void {
  for (const key of keys) {
    if (!task.developer?.[key]) throw new Error(`${label} 引用了不存在的 developer.${key}`);
  }
}

function assertTesterPassEvidence(task: Task, uuid: string): void {
  const testedDevelopers = new Set<string>();
  for (const [key, tester] of Object.entries(task.tester ?? {})) {
    if (tester.status !== "done" || !tester.report) {
      throw new Error(`tester.${key} 必须 done 且有 report`);
    }
    if (!tester.case_document) throw new Error(`tester.${key}.case_document 为空,不能收尾`);
    const testFm = readArtifactFrontmatter(task, uuid, tester.report);
    assertFm(testFm, "kind", "test-report");
    assertFm(testFm, "uuid", uuid);
    assertFm(testFm, "test_worktree", key);
    assertFm(testFm, "role", "tester");
    assertFm(testFm, "verdict", "pass");
    if (!testFm.related_case_document) throw new Error(`tester.${key} test report 缺少 related_case_document`);
    const caseDocument = filename(testFm.related_case_document);
    if (caseDocument !== tester.case_document) {
      throw new Error(`tester.${key} test report related_case_document 与 tester.case_document 不一致: ${caseDocument}`);
    }
    const caseFm = readArtifactFrontmatter(task, uuid, caseDocument);
    assertFm(caseFm, "kind", "test-cases");
    assertFm(caseFm, "uuid", uuid);
    assertFm(caseFm, "tester_worktree", key);
    assertFm(caseFm, "role", "tester");
    assertFmOneOf(caseFm, "status", ["human_reviewed", "revised"]);
    if (!caseFm.human_reviewed_at || caseFm.human_reviewed_at === "null") {
      throw new Error(`tester.${key} test-cases 必须有 human_reviewed_at`);
    }
    const covered = parseFmList(testFm.covered_worktrees);
    if (covered.length === 0) throw new Error(`tester.${key} test report covered_worktrees 为空`);
    assertKnownDevelopers(task, covered, `tester.${key} test report covered_worktrees`);
    const caseCovered = parseFmList(caseFm.covered_worktrees);
    for (const target of covered) {
      if (!caseCovered.includes(target)) {
        throw new Error(`tester.${key} test report covered_worktrees 超出 test-cases 范围: ${target}`);
      }
      testedDevelopers.add(target);
    }
  }
  const untestedDevelopers = Object.keys(task.developer ?? {}).filter((key) => !testedDevelopers.has(key));
  if (untestedDevelopers.length > 0) {
    throw new Error(`tester pass report 未覆盖 developer: ${untestedDevelopers.join(", ")}`);
  }
}

function hasAnyNonOwnerSeat(task: Task): boolean {
  for (const role of ["developer", "reviewer", "tester", "integrator"] as const) {
    if (Object.keys(task[role] ?? {}).length > 0) return true;
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
  if (hasAnyNonOwnerSeat(task)) throw new Error("已有席位,不能注册 owner");
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
  const openIssues = openIssuesForOwner(task, uuid, args.key);
  if (openIssues.length > 0) {
    const related = relatedIssueRefs(reportFm);
    if (!openIssues.some((issue) => related.includes(issue.file))) {
      throw new Error(
        `developer.${args.key} 有 open issue,dev report frontmatter 必须包含 related_issue。` +
          ` 需引用: ${openIssues.map((issue) => issue.file).join(", ")}`,
      );
    }
  }
  const reportFiles = [...(dev.reports ?? []), reportFile];
  const remainingOpenIssues = uncoveredOpenIssues(task, uuid, args.key, reportFiles);
  dev.reports = [...(dev.reports ?? []), reportFile];
  dev.self_review = selfReviewFile;
  dev.status = dev.review_gate_required
    ? "waiting_review"
    : remainingOpenIssues.length > 0 ? "follow_issue" : "ready_for_test";
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
  if (args.verdict !== "approve" && args.verdict !== "reject") {
    throw new Error("reviewer.submit-gate-review 缺少 --verdict approve|reject");
  }
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
  const relatedReport = fm.related_report ? filename(fm.related_report) : null;
  if (relatedReport && !dev.reports.includes(relatedReport)) {
    throw new Error(`review related_report 不在 developer.${args.target}.reports 中: ${relatedReport}`);
  }
  const remainingOpenIssues = args.verdict === "approve"
    ? uncoveredOpenIssues(task, uuid, args.target, dev.reports)
    : [];
  dev.status = args.verdict === "approve"
    ? remainingOpenIssues.length > 0 ? "follow_issue" : "ready_for_test"
    : "review_rejected";
  return [
    `developer.${args.target}.review=${reviewFile}`,
    `developer.${args.target}.review_gate_required=false`,
    `developer.${args.target}.status=${dev.status}`,
  ];
}

function testerEntry(task: Task, key: string): TesterEntry {
  const entry = task.tester?.[key];
  if (!entry) throw new Error(`tester.${key} 不存在`);
  return entry;
}

function integratorEntry(task: Task, key: string): IntegratorEntry {
  const entry = task.integrator?.[key];
  if (!entry) throw new Error(`integrator.${key} 不存在`);
  return entry;
}

function submitTesterCases(task: Task, uuid: string, args: Args): string[] {
  assertTaskActive(task);
  if (!args.key) throw new Error("tester.submit-cases 缺少 --worktree");
  if (!args.caseDocument) throw new Error("tester.submit-cases 缺少 --case-document");
  const tester = testerEntry(task, args.key);
  const caseFile = filename(args.caseDocument);
  const fm = readArtifactFrontmatter(task, uuid, caseFile);
  assertFm(fm, "kind", "test-cases");
  assertFm(fm, "uuid", uuid);
  assertFm(fm, "tester_worktree", args.key);
  assertFm(fm, "role", "tester");
  assertFmOneOf(fm, "status", ["draft", "human_reviewed", "revised"]);
  if (!fm.source_plan) throw new Error("test-cases 缺少 source_plan");
  if (!filename(fm.source_plan) || filename(task.plan) !== filename(fm.source_plan)) {
    throw new Error(`test-cases source_plan 与 task.plan 不一致: ${fm.source_plan}`);
  }
  const covered = parseFmList(fm.covered_worktrees);
  assertKnownDevelopers(task, covered, "test-cases covered_worktrees");
  const knownReports = registeredDeveloperReports(task);
  for (const relatedReport of parseFmList(fm.related_reports)) {
    if (!knownReports.has(filename(relatedReport))) {
      throw new Error(`test-cases related_reports 未登记在 developer reports 中: ${relatedReport}`);
    }
  }
  assertAttemptCanApply(tester, fm.attempt, `tester.${args.key}`);
  tester.case_document = caseFile;
  if (tester.status === "idle") tester.status = "working";
  tester.error = null;
  return [`tester.${args.key}.case_document=${caseFile}`, `tester.${args.key}.status=${tester.status}`];
}

function submitTesterReport(task: Task, uuid: string, args: Args): string[] {
  assertTaskActive(task);
  if (!args.key) throw new Error("tester.submit-report 缺少 --worktree");
  if (!args.report) throw new Error("tester.submit-report 缺少 --report");
  if (args.verdict !== "pass" && args.verdict !== "fail") {
    throw new Error("tester.submit-report 缺少 --verdict pass|fail");
  }
  const verdict = args.verdict;
  const tester = testerEntry(task, args.key);
  if (!tester.case_document) throw new Error(`tester.${args.key}.case_document 为空,不能提交 test report`);
  const reportFile = filename(args.report);
  const fm = readArtifactFrontmatter(task, uuid, reportFile);
  assertFm(fm, "kind", "test-report");
  assertFm(fm, "uuid", uuid);
  assertFm(fm, "test_worktree", args.key);
  assertFm(fm, "role", "tester");
  assertFm(fm, "verdict", verdict);
  if (!fm.related_case_document) throw new Error("test report 缺少 related_case_document");
  const caseDocument = filename(fm.related_case_document);
  if (tester.case_document !== caseDocument) {
    throw new Error(`test report related_case_document 与 tester.${args.key}.case_document 不一致: ${caseDocument}`);
  }
  const caseFm = readArtifactFrontmatter(task, uuid, caseDocument);
  assertFm(caseFm, "kind", "test-cases");
  assertFm(caseFm, "uuid", uuid);
  assertFm(caseFm, "tester_worktree", args.key);
  assertFm(caseFm, "role", "tester");
  if (verdict === "pass") {
    assertFmOneOf(caseFm, "status", ["human_reviewed", "revised"]);
    if (!caseFm.human_reviewed_at || caseFm.human_reviewed_at === "null") {
      throw new Error("tester.submit-report pass 前 test-cases 必须有 human_reviewed_at");
    }
  }
  assertAttemptCanApply(tester, fm.attempt, `tester.${args.key}`);
  const covered = parseFmList(fm.covered_worktrees);
  if (covered.length === 0) {
    throw new Error("tester.submit-report frontmatter covered_worktrees 必须指定覆盖 developer");
  }
  if (args.targets.length > 0) {
    assertSameMembers(args.targets, covered, "tester.submit-report --target");
  }
  assertKnownDevelopers(task, covered, "test-report covered_worktrees");
  const caseCovered = parseFmList(caseFm.covered_worktrees);
  if (caseCovered.length === 0) {
    throw new Error("test-cases covered_worktrees 不能为空");
  }
  for (const target of covered) {
    if (!caseCovered.includes(target)) {
      throw new Error(`test-report covered_worktrees 超出 test-cases 范围: ${target}`);
    }
  }
  const applied = [`tester.${args.key}.case_document=${tester.case_document}`];
  if (verdict === "pass") {
    const activeNotCovered = Object.keys(task.developer ?? {})
      .filter((key) => !covered.includes(key));
    if (activeNotCovered.length > 0) {
      throw new Error(`tester pass 未覆盖 developer: ${activeNotCovered.join(", ")}`);
    }
    for (const target of covered) {
      const dev = task.developer?.[target];
      if (!dev) throw new Error(`covered developer.${target} 不存在`);
      if (!["ready_for_test", "review_approved", "done"].includes(dev.status)) {
        throw new Error(`developer.${target} 当前 status=${dev.status}, tester pass 前必须 ready_for_test/review_approved/done`);
      }
    }
    for (const target of covered) {
      task.developer[target]!.status = "done";
      applied.push(`developer.${target}.status=done`);
    }
    tester.pass = [...new Set([...(tester.pass ?? []), ...covered])];
    tester.fail = [];
    tester.status = "done";
  } else {
    tester.fail = [...new Set([...(tester.fail ?? []), ...covered])];
    tester.pass = [];
    tester.status = "idle";
  }
  tester.report = reportFile;
  tester.error = null;
  applied.push(`tester.${args.key}.report=${reportFile}`, `tester.${args.key}.status=${tester.status}`);
  return applied;
}

function submitIntegrationReport(task: Task, uuid: string, args: Args): string[] {
  assertTaskActive(task);
  if (!args.key) throw new Error("integrator.submit-integration-report 缺少 --worktree");
  if (!args.report) throw new Error("integrator.submit-integration-report 缺少 --report");
  const integrator = integratorEntry(task, args.key);
  const reportFile = filename(args.report);
  const fm = readArtifactFrontmatter(task, uuid, reportFile);
  assertFm(fm, "kind", "integration-report");
  assertFm(fm, "uuid", uuid);
  assertFm(fm, "worktree", args.key);
  assertFm(fm, "role", "integrator");
  assertFmOneOf(fm, "regression_result", ["pass", "fail"]);
  parseFmNumber(fm, "conflicts_resolved");
  assertAttemptCanApply(integrator, fm.attempt, `integrator.${args.key}`);
  const merged = args.merged.length > 0 ? args.merged : parseFmList(fm.merged_branches);
  const conflicts = args.conflicts.length > 0 ? args.conflicts : parseFmList(fm.conflicts_escalated);
  const developerBlockers = Object.entries(task.developer ?? {})
    .filter(([, dev]) => dev.status !== "done")
    .map(([key]) => key);
  if (developerBlockers.length > 0) {
    throw new Error(`integrator submit 前 developer 必须全部 done: ${developerBlockers.join(", ")}`);
  }
  assertTesterPassEvidence(task, uuid);
  integrator.report = reportFile;
  integrator.merged = merged;
  integrator.conflicts = conflicts;
  integrator.status = fm.regression_result === "pass" && conflicts.length === 0 ? "done" : "working";
  integrator.error = fm.regression_result === "pass" ? null : "integration regression failed";
  if (fm.regression_result === "pass" && conflicts.length > 0) {
    integrator.error = "integration conflicts escalated";
  }
  return [
    `integrator.${args.key}.report=${reportFile}`,
    `integrator.${args.key}.merged=${JSON.stringify(merged)}`,
    `integrator.${args.key}.conflicts=${JSON.stringify(conflicts)}`,
    `integrator.${args.key}.status=${integrator.status}`,
  ];
}

function submitOwnerCloseout(task: Task, uuid: string, args: Args): string[] {
  const ownerKey = args.key ?? Object.keys(task.owner ?? {})[0];
  if (!ownerKey || !task.owner?.[ownerKey]) throw new Error("owner 不存在,不能 closeout");
  if (!args.closeout) throw new Error("owner.closeout 缺少 --closeout");
  const developerBlockers = Object.entries(task.developer ?? {})
    .filter(([, entry]) => entry.status !== "done")
    .map(([key]) => key);
  if (developerBlockers.length > 0) {
    throw new Error(`owner.closeout 前 developer 必须全部 done: ${developerBlockers.join(", ")}`);
  }
  const testers = Object.values(task.tester ?? {});
  if (testers.length === 0 || testers.some((entry) => entry.status !== "done")) {
    throw new Error("owner.closeout 前 tester 必须全部 done");
  }
  assertTesterPassEvidence(task, uuid);
  const activeIntegrators = activeIntegratorEntries(task);
  if (activeIntegrators.length > 0) {
    const notDone = activeIntegrators.filter((key) => task.integrator[key]?.status !== "done" || !task.integrator[key]?.report);
    if (notDone.length > 0) {
      throw new Error(`active integrator 未完成: ${notDone.join(", ")}`);
    }
  }
  const integratorRequired = Object.values(task.owner ?? {})
    .flatMap((entry) => entry.decisions ?? [])
    .some((decision) => decision.type === "integrator_required");
  const doneIntegrators = Object.entries(task.integrator ?? {})
    .filter(([, entry]) => entry.status === "done");
  if (integratorRequired && doneIntegrators.length === 0) {
    throw new Error("owner.closeout 前 owner 要求的 integrator evidence 必须完成");
  }
  for (const [key, entry] of doneIntegrators) {
    if (!entry.report) throw new Error(`integrator.${key}.report 为空,不能 closeout`);
    const fm = readArtifactFrontmatter(task, uuid, entry.report);
    assertFm(fm, "kind", "integration-report");
    assertFm(fm, "uuid", uuid);
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
      case "tester.submit-cases":
        applied = submitTesterCases(task, uuid, args);
        break;
      case "tester.submit-report":
        applied = submitTesterReport(task, uuid, args);
        break;
      case "integrator.submit-integration-report":
        applied = submitIntegrationReport(task, uuid, args);
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
