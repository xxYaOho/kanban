#!/usr/bin/env bun
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  defaultStandbyWaitConfig,
  runStandbyWait,
  standbyBackoffIntervalSec,
  standbyBackoffTotalWaitSec,
} from "./standby-wait";

const scriptsDir = import.meta.dir;
const repo = "kanban-regression";
const uuid = "00000000-0000-4000-8000-000000000001";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function runScript(home: string, script: string, args: string[], cwd?: string): { stdout: string; stderr: string; exitCode: number } {
  const proc = spawnSync("bun", ["run", join(scriptsDir, script), ...args], {
    cwd: cwd ?? scriptsDir,
    env: { ...process.env, HOME: home },
    encoding: "utf-8",
  });
  return {
    stdout: proc.stdout ?? "",
    stderr: proc.stderr ?? "",
    exitCode: proc.status ?? 0,
  };
}

function expectOk(result: { stdout: string; stderr: string; exitCode: number }, label: string): void {
  assert(result.exitCode === 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

async function seedTask(home: string): Promise<string> {
  const root = join(home, ".kanban");
  const taskDir = join(root, repo, uuid);
  await mkdir(taskDir, { recursive: true });
  await writeFile(join(root, "kanban.json"), JSON.stringify({
    [uuid]: {
      status: "in_progress",
      repo,
      description: "Regression protocol task",
      draft: null,
      plan: `~/.kanban/${repo}/${uuid}/plan.md`,
      created: "2026-05-22T10:00:00+08:00",
      updated: "2026-05-22T10:00:00+08:00",
      developer: {
        alpha: {
          status: "waiting_review",
          brief: "Alpha work",
          attempt: 1,
          blocked_on: null,
          worktree: "alpha",
          cwd: "alpha",
          reports: ["report-alpha-01.md"],
          review: null,
          self_review: null,
          review_gate_required: false,
          error: null,
        },
        beta: {
          status: "working",
          brief: "Beta work",
          attempt: 1,
          blocked_on: null,
          worktree: "beta",
          cwd: "beta",
          reports: [],
          review: null,
          self_review: null,
          review_gate_required: false,
          error: null,
        },
        gamma: {
          status: "review_approved",
          brief: "Gamma work",
          attempt: 1,
          blocked_on: null,
          worktree: "gamma",
          cwd: "gamma",
          reports: ["report-gamma-01.md"],
          review: "review-gamma-01.md",
          self_review: null,
          review_gate_required: false,
          error: null,
        },
        delta: {
          status: "done",
          brief: "Delta work",
          attempt: 1,
          blocked_on: null,
          worktree: "delta",
          cwd: "delta",
          reports: ["report-delta-01.md"],
          review: "review-delta-01.md",
          self_review: null,
          review_gate_required: false,
          error: null,
        },
      },
      owner: {},
      reviewer: {
        review: {
          status: "idle",
          brief: "Review delivery",
          attempt: 0,
          pass: [],
          report: "",
          error: null,
        },
      },
      test: {
        legacy: {
          status: "idle",
          brief: "Legacy test entry",
          attempt: 0,
          worktree: null,
          cwd: null,
          case_document: "",
          pass: [],
          fail: [],
          report: "",
          error: null,
        },
      },
      tester: {
        full: {
          status: "idle",
          brief: "Run full test",
          attempt: 0,
          worktree: "full",
          cwd: "full",
          case_document: "",
          pass: [],
          fail: [],
          report: "",
          error: null,
        },
      },
      integrator: {
        merge: {
          status: "idle",
          brief: "Merge delivery",
          attempt: 0,
          worktree: "merge",
          cwd: "merge",
          merged: [],
          conflicts: [],
          report: "",
          error: null,
        },
      },
    },
  }, null, 2) + "\n");
  await writeFile(join(taskDir, "plan.md"), "# Regression protocol task\n", "utf-8");
  await writeFile(join(taskDir, "report-alpha-01.md"), [
    "---",
    "kind: dev-report",
    `uuid: ${uuid}`,
    "worktree: alpha",
    "role: developer",
    "attempt: 1",
    "created: 2026-05-22T10:00:00+08:00",
    "status_after: waiting_review",
    "self_review: self-review-alpha-01.md",
    "---",
    "",
    "# Dev Report",
  ].join("\n"), "utf-8");
  await writeFile(join(taskDir, "report-gamma-01.md"), [
    "---",
    "kind: dev-report",
    `uuid: ${uuid}`,
    "worktree: gamma",
    "role: developer",
    "attempt: 1",
    "created: 2026-05-22T10:00:00+08:00",
    "status_after: ready_for_test",
    "self_review: self-review-gamma-01.md",
    "---",
    "",
    "# Dev Report",
  ].join("\n"), "utf-8");
  await writeFile(join(taskDir, "review-gamma-01.md"), "---\nkind: review\nverdict: approve\n---\n", "utf-8");
  return taskDir;
}

async function seedStandbyResolutionTask(home: string): Promise<void> {
  const root = join(home, ".kanban");
  const secondUuid = "00000000-0000-4000-8000-000000000002";
  const taskDir = join(root, repo, secondUuid);
  await mkdir(taskDir, { recursive: true });
  const data = JSON.parse(await readFile(join(root, "kanban.json"), "utf-8"));
  data[secondUuid] = {
    status: "planned",
    repo,
    description: "Second standby task",
    draft: null,
    plan: `~/.kanban/${repo}/${secondUuid}/plan.md`,
    created: "2026-05-22T10:00:00+08:00",
    updated: "2026-05-22T10:00:00+08:00",
    developer: {
      alpha: {
        status: "idle",
        brief: "Alpha duplicate cwd",
        attempt: 0,
        blocked_on: null,
        worktree: "alpha",
        cwd: "alpha",
        reports: [],
        review: null,
        self_review: null,
        review_gate_required: false,
        error: null,
      },
    },
    owner: {},
    reviewer: {},
    tester: {},
    integrator: {},
  };
  await writeFile(join(root, "kanban.json"), JSON.stringify(data, null, 2) + "\n");
  await writeFile(join(taskDir, "plan.md"), "# Second standby task\n", "utf-8");
}

function parseQueryJson(stdout: string): any {
  const marker = "\0JSON\n";
  const idx = stdout.indexOf(marker);
  assert(idx >= 0, "query output missing JSON marker");
  return JSON.parse(stdout.slice(idx + marker.length).trim());
}

async function testQueryJson(home: string): Promise<void> {
  const cwdRoot = await mkdtemp(join(tmpdir(), "kanban-query-cwd-"));
  const reviewerCwd = join(cwdRoot, "review");
  await mkdir(reviewerCwd);
  const query = runScript(home, "query.ts", [uuid.slice(0, 8)], reviewerCwd);
  expectOk(query, "query reviewer");
  const json = parseQueryJson(query.stdout);

  assert(json.currentEntry?.role === "reviewer", "currentEntry role should be reviewer");
  assert(json.currentEntry?.key === "review", "currentEntry key should be review");
  assert(json.currentEntry?.status === "idle", "currentEntry status should be idle");
  assert(json.currentEntry?.brief === "Review delivery", "currentEntry brief should be present");
  assert(json.eligibleReviewTargets.some((entry: any) => entry.key === "alpha"), "alpha should be eligible for review");
  assert(json.testerBlockedBy.some((entry: any) => entry.key === "alpha"), "alpha should block tester");
  assert(json.testerBlockedBy.some((entry: any) => entry.key === "beta"), "beta should block tester");
  assert(!json.testerBlockedBy.some((entry: any) => entry.key === "delta"), "done developer should not block tester");
  assert(Array.isArray(json.readyForTestTargets), "readyForTestTargets should be present");
  assert(json.integratorBlockedBy.some((entry: any) => entry.role === "tester" && entry.key === "full"), "tester should block integrator");
  assert(json.canReview === false, "canReview should be false when required self-review is missing");
  assert(json.canTest === false, "canTest should be false when developer blockers exist");
  assert(json.canIntegrate === false, "canIntegrate should be false when tester is not done");
  assert(json.canOwnerCloseout === false, "canOwnerCloseout should be false without tester done");
  assert(json.blockedReasons.some((reason: any) => reason.gate === "review"), "blockedReasons should explain review artifact blocker");
  assert(json.blockedReasons.some((reason: any) => reason.gate === "test"), "blockedReasons should explain test blocker");
  assert(json.blockedReasons.some((reason: any) => reason.gate === "integrate"), "blockedReasons should explain integration blocker");
  assert(json.requiredArtifacts.some((artifact: any) =>
    artifact.role === "developer" &&
    artifact.key === "alpha" &&
    artifact.type === "dev-report" &&
    artifact.file === "report-alpha-01.md" &&
    artifact.requiredFor === "review" &&
    artifact.missing === false
  ), "requiredArtifacts should include alpha dev report for review");
  assert(json.requiredArtifacts.some((artifact: any) =>
    artifact.role === "developer" &&
    artifact.key === "alpha" &&
    artifact.type === "self-review" &&
    artifact.requiredFor === "review" &&
    artifact.missing === true
  ), "requiredArtifacts should flag missing alpha self-review");
  assert(!json.nextCommandHints.some((hint: any) =>
    hint.role === "reviewer" &&
    typeof hint.command === "string" &&
    hint.command.includes("--role reviewer")
  ), "nextCommandHints should suppress reviewer command when review artifact is missing");
  assert(typeof json.recommendedNextAction === "string" && json.recommendedNextAction.length < 120, "recommendedNextAction should be short");
  assert(json.idleStations.tester.some((entry: any) => entry.stationName === "legacy"), "legacy task.test should migrate into tester idleStations");
}

async function testQueryGateArtifacts(): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "kanban-query-gates-home-"));
  try {
    const taskDir = await seedTask(home);
    let data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    delete data[uuid].test;
    data[uuid].developer = {
      alpha: {
        status: "waiting_review",
        brief: "Alpha work",
        attempt: 1,
        blocked_on: null,
        worktree: "alpha",
        cwd: "alpha",
        reports: ["report-alpha-01.md"],
        review: null,
        self_review: `~/.kanban/${repo}/${uuid}/self-review-alpha-01.md`,
        review_gate_required: true,
        error: null,
      },
    };
    data[uuid].tester = {
      full: {
        status: "idle",
        brief: "Run full test",
        attempt: 0,
        worktree: "full",
        cwd: "full",
        case_document: "",
        pass: [],
        fail: [],
        report: "",
        error: null,
      },
    };
    data[uuid].integrator = {};
    data[uuid].owner = {};
    await writeFile(join(taskDir, "self-review-alpha-01.md"), [
      "---",
      "kind: self-review",
      `uuid: ${uuid}`,
      "worktree: alpha",
      "role: developer",
      "attempt: 1",
      "created: 2026-05-22T10:00:00+08:00",
      "source_report: report-alpha-01.md",
      "reviewer: subagent",
      "verdict: pass",
      "---",
      "",
      "# Self Review",
    ].join("\n"), "utf-8");
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

    const reviewQuery = runScript(home, "query.ts", [uuid.slice(0, 8)]);
    expectOk(reviewQuery, "query review gate artifacts");
    let json = parseQueryJson(reviewQuery.stdout);
    assert(json.canReview === true, "canReview should be true when dev report and self-review are valid");
    assert(json.nextCommandHints.some((hint: any) => hint.role === "reviewer"), "reviewer hint should exist when review gate is open");

    data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].developer.alpha.self_review = "self-review-alpha-mismatch.md";
    await writeFile(join(taskDir, "self-review-alpha-mismatch.md"), [
      "---",
      "kind: self-review",
      `uuid: ${uuid}`,
      "worktree: alpha",
      "role: developer",
      "attempt: 1",
      "created: 2026-05-22T10:00:00+08:00",
      "source_report: report-other-01.md",
      "reviewer: subagent",
      "verdict: pass",
      "---",
      "",
      "# Self Review",
    ].join("\n"), "utf-8");
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

    const mismatchQuery = runScript(home, "query.ts", [uuid.slice(0, 8)]);
    expectOk(mismatchQuery, "query review mismatched artifacts");
    json = parseQueryJson(mismatchQuery.stdout);
    assert(json.canReview === false, "canReview should reject mismatched report/self-review references");
    assert(json.requiredArtifacts.some((artifact: any) =>
      artifact.role === "developer" &&
      artifact.key === "alpha" &&
      artifact.type === "self-review" &&
      artifact.problem?.includes("source_report")
    ), "requiredArtifacts should explain mismatched self-review source_report");

    data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].developer.alpha.self_review = "self-review-alpha-01.md";
    data[uuid].developer.alpha.status = "done";
    data[uuid].developer.alpha.review_gate_required = false;
    data[uuid].tester = {};
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

    const noTesterQuery = runScript(home, "query.ts", [uuid.slice(0, 8)]);
    expectOk(noTesterQuery, "query integrate without tester");
    json = parseQueryJson(noTesterQuery.stdout);
    assert(json.canIntegrate === false, "canIntegrate should be false without tester evidence");
    assert(json.blockedReasons.some((reason: any) => reason.gate === "integrate"), "blockedReasons should explain missing tester evidence");

    data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].tester = {
      full: {
        status: "done",
        brief: "Run full test",
        attempt: 1,
        worktree: "full",
        cwd: "full",
        case_document: "test-cases-01.md",
        pass: ["alpha"],
        fail: [],
        report: `~/.kanban/${repo}/${uuid}/test-01.md`,
        error: null,
      },
    };
    data[uuid].integrator = {
      merge: {
        status: "idle",
        brief: "Merge delivery",
        attempt: 0,
        worktree: "merge",
        cwd: "merge",
        merged: [],
        conflicts: [],
        report: "",
        error: null,
      },
    };
    await writeFile(join(taskDir, "test-01.md"), [
      "---",
      "kind: test-report",
      `uuid: ${uuid}`,
      "tester: full",
      "role: tester",
      "attempt: 1",
      "created: 2026-05-22T10:00:00+08:00",
      "verdict: pass",
      "---",
      "",
      "# Test Report",
    ].join("\n"), "utf-8");
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

    const integrateQuery = runScript(home, "query.ts", [uuid.slice(0, 8)]);
    expectOk(integrateQuery, "query integrate gate artifacts");
    json = parseQueryJson(integrateQuery.stdout);
    assert(json.canIntegrate === true, "canIntegrate should be true when tester done and pass report exists");
    assert(json.nextCommandHints.some((hint: any) => hint.role === "integrator"), "integrator hint should exist when integrate gate is open");
    assert(json.requiredArtifacts.some((artifact: any) =>
      artifact.role === "tester" &&
      artifact.requiredFor === "integrate" &&
      artifact.file === `~/.kanban/${repo}/${uuid}/test-01.md` &&
      artifact.valid === true
    ), "requiredArtifacts should validate kanban-relative tester report paths");

    data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].owner = {
      main: {
        status: "working",
        brief: "Owner main",
        attempt: 1,
        worktree: "main",
        cwd: "main",
        decisions: [{
          type: "integrator_required",
          target: "task",
          reason: "Need semantic merge",
          created: "2026-05-22T10:00:00+08:00",
          evidence: "test-01.md",
        }],
        closeout: "",
        error: null,
      },
    };
    data[uuid].integrator = {};
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

    const missingIntegratorQuery = runScript(home, "query.ts", [uuid.slice(0, 8)]);
    expectOk(missingIntegratorQuery, "query owner closeout with missing integrator entry");
    json = parseQueryJson(missingIntegratorQuery.stdout);
    assert(json.canOwnerCloseout === false, "owner closeout should wait for owner integrator_required decision without integrator entry");
    assert(json.blockedReasons.some((reason: any) =>
      reason.gate === "owner_closeout" &&
      reason.reason.includes("integrator evidence")
    ), "blockedReasons should explain owner-required integrator evidence");
    assert(!json.nextCommandHints.some((hint: any) => hint.role === "owner"), "owner closeout hint should be suppressed while integrator evidence is missing");

    data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].integrator = {
      merge: {
        status: "idle",
        brief: "Merge delivery",
        attempt: 0,
        worktree: "merge",
        cwd: "merge",
        merged: [],
        conflicts: [],
        report: "",
        error: null,
      },
    };
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

    const closeoutQuery = runScript(home, "query.ts", [uuid.slice(0, 8)]);
    expectOk(closeoutQuery, "query owner closeout with integrator decision");
    json = parseQueryJson(closeoutQuery.stdout);
    assert(json.canOwnerCloseout === false, "owner closeout should wait for active integrator entry");
    assert(json.blockedReasons.some((reason: any) =>
      reason.gate === "owner_closeout" &&
      reason.entries?.some((entry: any) => entry.role === "integrator" && entry.key === "merge")
    ), "blockedReasons should list active integrator from owner decision");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function testDoctorScript(): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "kanban-doctor-home-"));
  try {
    const taskDir = await seedTask(home);
    let data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    delete data[uuid].test;
    data[uuid].developer = {
      alpha: {
        status: "ready_for_test",
        brief: "Alpha work",
        attempt: 1,
        blocked_on: null,
        worktree: "alpha",
        cwd: "alpha",
        reports: ["report-alpha-01.md"],
        review: null,
        self_review: `~/.kanban/${repo}/${uuid}/self-review-alpha-01.md`,
        review_gate_required: false,
        error: null,
      },
    };
    data[uuid].tester = {
      full: {
        status: "done",
        brief: "Run full test",
        attempt: 1,
        worktree: "full",
        cwd: "full",
        case_document: "test-cases-01.md",
        pass: ["alpha"],
        fail: [],
        report: join(taskDir, "test-01.md"),
        error: null,
      },
    };
    data[uuid].integrator = {};
    data[uuid].owner = {};
    await writeFile(join(taskDir, "self-review-alpha-01.md"), [
      "---",
      "kind: self-review",
      `uuid: ${uuid}`,
      "worktree: alpha",
      "role: developer",
      "attempt: 1",
      "created: 2026-05-22T10:00:00+08:00",
      "source_report: report-alpha-01.md",
      "reviewer: subagent",
      "verdict: pass",
      "---",
      "",
      "# Self Review",
    ].join("\n"), "utf-8");
    await writeFile(join(taskDir, "test-01.md"), [
      "---",
      "kind: test-report",
      `uuid: ${uuid}`,
      "tester: full",
      "role: tester",
      "attempt: 1",
      "created: 2026-05-22T10:00:00+08:00",
      "verdict: pass",
      "---",
      "",
      "# Test Report",
    ].join("\n"), "utf-8");
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

    const healthy = runScript(home, "doctor.ts", [uuid.slice(0, 8)]);
    expectOk(healthy, "doctor healthy");
    let json = parseJson(healthy.stdout);
    assert(json.ok === true, "doctor should pass healthy task");
    assert(json.issueCount === 0, "doctor healthy task should have no issues");

    data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].developer.alpha.self_review = "self-review-alpha-bad.md";
    data[uuid].owner = {
      main: {
        status: "working",
        brief: "Owner main",
        attempt: 1,
        worktree: "main",
        cwd: "main",
        decisions: [{
          type: "integrator_required",
          target: "task",
          reason: "Need integration",
          created: "2026-05-22T10:00:00+08:00",
          evidence: "test-01.md",
        }],
        closeout: "",
        error: null,
      },
    };
    await writeFile(join(taskDir, "self-review-alpha-bad.md"), [
      "---",
      "kind: self-review",
      `uuid: ${uuid}`,
      "worktree: alpha",
      "role: developer",
      "attempt: 2",
      "created: 2026-05-22T10:00:00+08:00",
      "source_report: report-other-01.md",
      "reviewer: subagent",
      "verdict: pass",
      "---",
      "",
      "# Self Review",
    ].join("\n"), "utf-8");
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

    const broken = runScript(home, "doctor.ts", [uuid.slice(0, 8)]);
    assert(broken.exitCode === 1, "doctor should fail invalid task");
    json = parseJson(broken.stdout);
    assert(json.ok === false, "doctor invalid task should not be ok");
    assert(json.issues.some((issue: any) => issue.code === "developer_self_review_pair_mismatch"), "doctor should catch self-review source mismatch");
    assert(json.issues.some((issue: any) => issue.code === "developer_artifact_attempt_mismatch"), "doctor should catch attempt mismatch");
    assert(json.issues.some((issue: any) => issue.code === "owner_integrator_required_unresolved"), "doctor should catch unresolved integrator_required decision");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function testRoleAlias(home: string): Promise<void> {
  const result = runScript(home, "role.ts", [
    "--role",
    "test",
    "--worktree",
    "legacy",
    "--brief",
    "Legacy alias refresh",
    "--thread",
    uuid.slice(0, 8),
  ]);
  expectOk(result, "role test alias");
  const json = JSON.parse(result.stdout);
  assert(json.role === "tester", "--role test should normalize to tester");

  const data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
  assert(data[uuid].tester.legacy.brief === "Legacy alias refresh", "legacy tester brief should update task.tester");
  assert(!("test" in data[uuid]), "task.test should be removed on write");
}

async function testTesterCaseDocumentWrite(home: string): Promise<void> {
  const result = runScript(home, "agent-write.ts", [
    "--thread",
    uuid.slice(0, 8),
    "--worktree",
    "full",
    "--set",
    "case_document=test-cases-01.md",
  ]);
  expectOk(result, "tester case_document write");
  const json = parseJson(result.stdout);
  assert(json.applied.includes("case_document=test-cases-01.md"), "agent-write should report case_document update");

  const data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
  assert(data[uuid].tester.full.case_document === "test-cases-01.md", "tester case_document should persist");
}

async function testActionWriteDeveloperSubmit(home: string, taskDir: string): Promise<void> {
  await writeFile(join(taskDir, "report-beta-01.md"), [
    "---",
    "kind: dev-report",
    `uuid: ${uuid}`,
    "worktree: beta",
    "role: developer",
    "attempt: 1",
    "created: 2026-05-22T10:00:00+08:00",
    "status_after: ready_for_test",
    "related_plan: plan.md",
    "related_issue: null",
    "self_review: self-review-beta-01.md",
    "gate_review_required: false",
    "---",
    "",
    "# Dev Report",
  ].join("\n"), "utf-8");
  await writeFile(join(taskDir, "self-review-beta-01.md"), [
    "---",
    "kind: self-review",
    `uuid: ${uuid}`,
    "worktree: beta",
    "role: developer",
    "attempt: 1",
    "created: 2026-05-22T10:00:00+08:00",
    "source_report: report-beta-01.md",
    "verdict: pass",
    "reviewer: subagent",
    "---",
    "",
    "# Self Review",
  ].join("\n"), "utf-8");

  const result = runScript(home, "action-write.ts", [
    "--action",
    "developer.submit-report",
    "--thread",
    uuid.slice(0, 8),
    "--worktree",
    "beta",
    "--report",
    "report-beta-01.md",
    "--self-review",
    "self-review-beta-01.md",
  ]);
  expectOk(result, "developer submit report action");
  const data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
  assert(data[uuid].developer.beta.status === "ready_for_test", "developer submit should set ready_for_test");
  assert(data[uuid].developer.beta.self_review === "self-review-beta-01.md", "developer self_review should persist");
}

async function testActionWriteDeveloperSubmitRequiresRelatedIssue(): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "kanban-action-related-issue-home-"));
  try {
    const taskDir = await seedTask(home);
    let data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].developer.beta.status = "follow_issue";
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");
    await writeFile(join(taskDir, "issue-beta-bug.md"), [
      "---",
      `uuid: ${uuid}`,
      "type: bug",
      "status: open",
      "owner: beta",
      "title: Beta bug",
      "created: 2026-05-22T10:00:00+08:00",
      "updated: 2026-05-22T10:00:00+08:00",
      "---",
      "",
      "## Summary",
      "",
      "Beta bug.",
    ].join("\n"), "utf-8");
    await writeFile(join(taskDir, "report-beta-02.md"), [
      "---",
      "kind: dev-report",
      `uuid: ${uuid}`,
      "worktree: beta",
      "role: developer",
      "attempt: 2",
      "created: 2026-05-22T10:00:00+08:00",
      "status_after: ready_for_test",
      "summary: Fixed beta bug",
      "self_review: self-review-beta-02.md",
      "---",
      "",
      "# Dev Report",
    ].join("\n"), "utf-8");
    await writeFile(join(taskDir, "self-review-beta-02.md"), [
      "---",
      "kind: self-review",
      `uuid: ${uuid}`,
      "worktree: beta",
      "role: developer",
      "attempt: 2",
      "created: 2026-05-22T10:00:00+08:00",
      "source_report: report-beta-02.md",
      "reviewer: subagent",
      "verdict: pass",
      "---",
      "",
      "# Self Review",
    ].join("\n"), "utf-8");
    const blocked = runScript(home, "action-write.ts", [
      "--action",
      "developer.submit-report",
      "--thread",
      uuid.slice(0, 8),
      "--worktree",
      "beta",
      "--report",
      "report-beta-02.md",
      "--self-review",
      "self-review-beta-02.md",
    ]);
    assert(blocked.exitCode !== 0, "developer submit should require related_issue for open issue");
    assert(blocked.stderr.includes("related_issue"), "related_issue error should be explicit");

    await writeFile(join(taskDir, "report-beta-02.md"), [
      "---",
      "kind: dev-report",
      `uuid: ${uuid}`,
      "worktree: beta",
      "role: developer",
      "attempt: 2",
      "created: 2026-05-22T10:00:00+08:00",
      "status_after: ready_for_test",
      "summary: Fixed beta bug",
      "related_issue: issue-beta-bug.md",
      "self_review: self-review-beta-02.md",
      "---",
      "",
      "# Dev Report",
    ].join("\n"), "utf-8");
    const ok = runScript(home, "action-write.ts", [
      "--action",
      "developer.submit-report",
      "--thread",
      uuid.slice(0, 8),
      "--worktree",
      "beta",
      "--report",
      "report-beta-02.md",
      "--self-review",
      "self-review-beta-02.md",
    ]);
    expectOk(ok, "developer submit issue report with related_issue");
    data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    assert(data[uuid].developer.beta.status === "ready_for_test", "issue fix submit should set ready_for_test");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function testActionWriteReviewerGate(home: string, taskDir: string): Promise<void> {
  const dataBefore = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
  dataBefore[uuid].owner = {
    main: {
      status: "idle",
      brief: "Owner main",
      attempt: 0,
      worktree: "main",
      cwd: "main",
      decisions: [],
      closeout: "",
      error: null,
    },
  };
  await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(dataBefore, null, 2) + "\n");

  const gate = runScript(home, "action-write.ts", [
    "--action",
    "owner.request-reviewer-gate",
    "--thread",
    uuid.slice(0, 8),
    "--key",
    "main",
    "--target",
    "beta",
    "--reason",
    "Need gate after ready",
    "--evidence",
    "report-beta-01.md",
  ]);
  expectOk(gate, "owner request reviewer gate");
  let data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
  assert(data[uuid].developer.beta.status === "waiting_review", "gate should move ready developer to waiting_review");
  assert(data[uuid].developer.beta.review_gate_required === true, "gate intent should persist");

  await writeFile(join(taskDir, "review-beta-01.md"), [
    "---",
    "kind: review",
    `uuid: ${uuid}`,
    "worktree: beta",
    "reviewer_worktree: review",
    "role: reviewer",
    "attempt: 1",
    "created: 2026-05-22T10:00:00+08:00",
    "verdict: approve",
    "related_report: report-beta-01.md",
    "---",
    "",
    "# Review",
  ].join("\n"), "utf-8");
  const approve = runScript(home, "action-write.ts", [
    "--action",
    "reviewer.submit-gate-review",
    "--thread",
    uuid.slice(0, 8),
    "--target",
    "beta",
    "--review",
    "review-beta-01.md",
    "--verdict",
    "approve",
  ]);
  expectOk(approve, "reviewer approve gate");
  data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
  assert(data[uuid].developer.beta.status === "ready_for_test", "review approve should return ready_for_test");
  assert(data[uuid].developer.beta.review_gate_required === false, "review approve should clear gate intent");
}

async function testActionWriteOwnerCloseoutGuard(): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "kanban-owner-closeout-home-"));
  try {
    const taskDir = await seedTask(home);
    let data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    delete data[uuid].test;
    data[uuid].tester.full.status = "done";
    data[uuid].integrator.merge.attempt = 1;
    data[uuid].integrator.merge.status = "working";
    data[uuid].owner = {
      main: {
        status: "working",
        brief: "Owner main",
        attempt: 1,
        worktree: "main",
        cwd: "main",
        decisions: [],
        closeout: "",
        error: null,
      },
    };
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

    await writeFile(join(taskDir, "owner-closeout-01.md"), [
      "---",
      "kind: owner-closeout",
      `uuid: ${uuid}`,
      "owner: main",
      "role: owner",
      "attempt: 1",
      "created: 2026-05-22T10:00:00+08:00",
      "status_after: done",
      "test_report: test-01.md",
      "integration_report: null",
      "merged: []",
      "conflicts: []",
      "---",
      "",
      "# Owner Closeout",
    ].join("\n"), "utf-8");
    const blocked = runScript(home, "action-write.ts", [
      "--action",
      "owner.closeout",
      "--thread",
      uuid.slice(0, 8),
      "--key",
      "main",
      "--closeout",
      "owner-closeout-01.md",
    ]);
    assert(blocked.exitCode !== 0, "owner closeout should block active integrator");

    data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].integrator.merge.status = "done";
    data[uuid].integrator.merge.report = "integration-01.md";
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");
    const done = runScript(home, "action-write.ts", [
      "--action",
      "owner.closeout",
      "--thread",
      uuid.slice(0, 8),
      "--key",
      "main",
      "--closeout",
      "owner-closeout-01.md",
    ]);
    expectOk(done, "owner closeout after integrator done");
    data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    assert(data[uuid].status === "done", "owner closeout should mark task done");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function testActionWriteOwnerRegister(): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "kanban-owner-register-home-"));
  try {
    const taskDir = await seedTask(home);
    const data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].status = "planned";
    data[uuid].developer = {};
    data[uuid].reviewer = {};
    data[uuid].tester = {};
    data[uuid].integrator = {};
    data[uuid].owner = {};
    delete data[uuid].test;
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");
    const result = runScript(home, "action-write.ts", [
      "--action",
      "owner.register",
      "--thread",
      uuid.slice(0, 8),
      "--key",
      "main",
      "--brief",
      "Owner main",
    ]);
    expectOk(result, "owner register action");
    const updated = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    assert(updated[uuid].owner.main.brief === "Owner main", "owner register should persist owner");
    assert(existsSync(join(taskDir, "plan.md")), "seed task should still have plan");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function testActionWriteOwnerRegisterRejectsExistingSeats(): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "kanban-owner-register-existing-seat-home-"));
  try {
    await seedTask(home);
    const data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].status = "planned";
    data[uuid].developer = {
      idledev: {
        status: "idle",
        brief: "Idle preallocated developer",
        attempt: 0,
        blocked_on: null,
        worktree: "idledev",
        cwd: "idledev",
        reports: [],
        review: null,
        self_review: null,
        review_gate_required: false,
        error: null,
      },
    };
    data[uuid].reviewer = {};
    data[uuid].tester = {};
    data[uuid].integrator = {};
    data[uuid].owner = {};
    delete data[uuid].test;
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");
    const result = runScript(home, "action-write.ts", [
      "--action",
      "owner.register",
      "--thread",
      uuid.slice(0, 8),
      "--key",
      "main",
      "--brief",
      "Owner main",
    ]);
    assert(result.exitCode !== 0, "owner.register should reject existing idle seats");
    assert(result.stderr.includes("已有席位"), "owner.register existing seat error should explain guard");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function testRoleOwnerRegister(): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "kanban-role-owner-home-"));
  try {
    await seedTask(home);
    let data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].status = "planned";
    data[uuid].developer = {};
    data[uuid].reviewer = {};
    data[uuid].tester = {};
    data[uuid].integrator = {};
    data[uuid].owner = {};
    delete data[uuid].test;
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

    const result = runScript(home, "role.ts", [
      "--role",
      "owner",
      "--brief",
      "Owner main",
      "--thread",
      uuid.slice(0, 8),
    ]);
    expectOk(result, "role owner register");
    const json = parseJson(result.stdout);
    assert(json.role === "owner", "owner role should persist in output");
    assert(json.stableKey === "main", "owner default stableKey should be main");

    data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    assert(data[uuid].owner.main.brief === "Owner main", "owner role should persist owner.main");
    assert(data[uuid].owner.main.cwd === "main", "owner main cwd should be main");

    const refresh = runScript(home, "role.ts", [
      "--role",
      "owner",
      "--brief",
      "Owner refreshed",
      "--thread",
      uuid.slice(0, 8),
    ]);
    expectOk(refresh, "role owner refresh");
    data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    assert(data[uuid].owner.main.brief === "Owner refreshed", "owner refresh should update brief");

    const secondOwner = runScript(home, "role.ts", [
      "--role",
      "owner",
      "--worktree",
      "other-main",
      "--brief",
      "Second owner",
      "--thread",
      uuid.slice(0, 8),
    ]);
    assert(secondOwner.exitCode !== 0, "second owner registration should fail");
    assert(secondOwner.stderr.includes("owner 已存在"), "second owner error should mention existing owner");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function testRoleOwnerRejectsExistingSeats(): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "kanban-role-owner-active-home-"));
  try {
    await seedTask(home);
    let data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].status = "planned";
    data[uuid].developer = {
      idledev: {
        status: "idle",
        brief: "Idle preallocated developer",
        attempt: 0,
        blocked_on: null,
        worktree: "idledev",
        cwd: "idledev",
        reports: [],
        review: null,
        self_review: null,
        review_gate_required: false,
        error: null,
      },
    };
    data[uuid].reviewer = {};
    data[uuid].tester = {};
    data[uuid].integrator = {};
    data[uuid].owner = {};
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");
    const result = runScript(home, "role.ts", [
      "--role",
      "owner",
      "--brief",
      "Owner too late",
      "--thread",
      uuid.slice(0, 8),
    ]);
    assert(result.exitCode !== 0, "owner registration should fail when seats already exist");
    assert(result.stderr.includes("已有席位"), "existing seat owner error should explain guard");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function testIssueLifecycle(home: string, taskDir: string): Promise<void> {
  const open = runScript(home, "issue.ts", [
    "open",
    "--thread",
    uuid.slice(0, 8),
    "--test",
    "full",
    "--owner",
    "gamma",
    "--title",
    "Gamma regression",
    "--reproduction",
    "bun test gamma",
    "--expected",
    "pass",
    "--actual",
    "fail",
    "--diagnosis",
    "gamma path",
    "--blocker",
    "blocks tester verdict",
    "--retest",
    "rerun gamma",
    "--related-report",
    "test-01.md",
  ]);
  expectOk(open, "issue open");
  const openJson = JSON.parse(open.stdout);
  assert(openJson.ownerStatus === "follow_issue", "issue open should put owner into follow_issue");
  assert(openJson.testerStatus === "waiting", "issue open should put tester into waiting");

  let data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
  data[uuid].developer.gamma.status = "review_approved";
  await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

  const done = runScript(home, "issue.ts", [
    "done",
    "--thread",
    uuid.slice(0, 8),
    "--issue",
    openJson.issue,
    "--test",
    "full",
    "--resolution",
    "retest passed",
  ]);
  expectOk(done, "issue done");
  const doneJson = JSON.parse(done.stdout);
  assert(doneJson.status === "done", "issue done output should use done status");
  assert(existsSync(join(taskDir, "archive", openJson.issue)), "done issue should move to archive");

  const second = runScript(home, "issue.ts", [
    "open",
    "--thread",
    uuid.slice(0, 8),
    "--test",
    "full",
    "--owner",
    "gamma",
    "--title",
    "Closed regression",
    "--reproduction",
    "bun test closed",
    "--expected",
    "pass",
    "--actual",
    "fail",
    "--diagnosis",
    "closed path",
    "--blocker",
    "no longer valid",
    "--retest",
    "skip",
  ]);
  expectOk(second, "issue open second");
  const secondJson = JSON.parse(second.stdout);

  const closed = runScript(home, "issue.ts", [
    "closed",
    "--thread",
    uuid.slice(0, 8),
    "--issue",
    secondJson.issue,
    "--test",
    "full",
    "--resolution",
    "not planned",
  ]);
  expectOk(closed, "issue closed");
  const closedJson = JSON.parse(closed.stdout);
  assert(closedJson.status === "closed", "issue closed output should use closed status");
  assert(existsSync(join(taskDir, "archive", secondJson.issue)), "closed issue should move to archive");
}

async function testRelatedIssueGuard(home: string, taskDir: string): Promise<void> {
  const issueResult = runScript(home, "issue.ts", [
    "open",
    "--thread",
    uuid.slice(0, 8),
    "--test",
    "full",
    "--owner",
    "gamma",
    "--title",
    "Related guard",
    "--reproduction",
    "bun test related",
    "--expected",
    "pass",
    "--actual",
    "fail",
    "--diagnosis",
    "related path",
    "--blocker",
    "needs dev fix",
    "--retest",
    "rerun related",
  ]);
  expectOk(issueResult, "issue open for related guard");

  await writeFile(join(taskDir, "report-gamma-02.md"), [
    "---",
    "kind: dev-report",
    "uuid: 00000000-0000-4000-8000-000000000001",
    "worktree: gamma",
    "role: developer",
    "attempt: 2",
    "related_issue: null",
    "---",
    "",
    "# Dev Report",
    "",
  ].join("\n"), "utf-8");

  const rejected = runScript(home, "agent-write.ts", [
    "--thread",
    uuid.slice(0, 8),
    "--worktree",
    "gamma",
    "--set",
    "status=waiting_review",
    "--set",
    "report=report-gamma-02.md",
  ]);
  assert(rejected.exitCode !== 0, "developer report without related_issue should fail while open issue exists");
  assert(rejected.stderr.includes("related_issue"), "related issue guard should mention related_issue");
}

function parseJson(stdout: string): any {
  return JSON.parse(stdout);
}

function testStandbyWaitBackoff(): void {
  assert(standbyBackoffIntervalSec(1) === 15, "standby wait should start at 15s");
  assert(standbyBackoffIntervalSec(5) === 15, "standby wait should keep 15s for first 5 empty polls");
  assert(standbyBackoffIntervalSec(6) === 30, "standby wait should use 30s after 5 empty polls");
  assert(standbyBackoffIntervalSec(11) === 60, "standby wait should use 60s after 10 empty polls");
  assert(standbyBackoffIntervalSec(16) === 120, "standby wait should use 120s after 15 empty polls");
  assert(standbyBackoffIntervalSec(21) === 240, "standby wait should use 240s after 20 empty polls");
  assert(standbyBackoffIntervalSec(100) === 240, "standby wait should cap at 240s");
  assert(defaultStandbyWaitConfig.maxEmptyPolls === 100, "standby wait should stop after 100 empty polls");
  assert(standbyBackoffTotalWaitSec() === 20325, "standby wait 100-poll total should be 20325s");
}

async function testStandbyReviewer(home: string): Promise<void> {
  const trigger = runScript(home, "standby-trigger.ts", [
    "--thread",
    uuid.slice(0, 8),
    "--role",
    "reviewer",
    "--key",
    "review",
  ]);
  expectOk(trigger, "standby reviewer trigger");
  const json = parseJson(trigger.stdout);
  assert(json.ready === true, "reviewer should trigger on waiting_review developer");
  assert(json.action === "review_waiting_developer", "reviewer action should be review_waiting_developer");
  assert(json.fingerprint === "reviewer:review:review_waiting_developer:alpha:waiting_review:1:report-alpha-01.md", "reviewer fingerprint should use target developer attempt and latest report");

  const seen = runScript(home, "standby-trigger.ts", [
    "--thread",
    uuid.slice(0, 8),
    "--role",
    "reviewer",
    "--key",
    "review",
    "--seen",
    json.fingerprint,
  ]);
  expectOk(seen, "standby reviewer seen");
  const seenJson = parseJson(seen.stdout);
  assert(seenJson.ready === false, "seen reviewer fingerprint should not retrigger");
}

async function testStandbyWaitReady(home: string): Promise<void> {
  const result = runScript(home, "standby-wait.ts", [
    "--thread",
    uuid.slice(0, 8),
    "--role",
    "reviewer",
    "--key",
    "review",
  ]);
  expectOk(result, "standby wait ready");
  const json = parseJson(result.stdout);
  assert(json.ready === true, "standby wait should return ready trigger JSON");
  assert(json.action === "review_waiting_developer", "standby wait should preserve trigger action");
  assert(json.fingerprint === "reviewer:review:review_waiting_developer:alpha:waiting_review:1:report-alpha-01.md", "standby wait should preserve trigger fingerprint");
}

async function testStandbyTesterFullTest(home: string): Promise<void> {
  const data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
  data[uuid].tester.full.status = "idle";
  data[uuid].tester.full.attempt = 0;
  data[uuid].developer.alpha.status = "review_approved";
  data[uuid].developer.beta.status = "ready_for_test";
  data[uuid].developer.beta.reports = ["report-beta-01.md"];
  data[uuid].developer.gamma.status = "review_approved";
  data[uuid].developer.delta.status = "done";
  await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

  const trigger = runScript(home, "standby-trigger.ts", [
    "--thread",
    uuid.slice(0, 8),
    "--role",
    "tester",
    "--key",
    "full",
  ]);
  expectOk(trigger, "standby tester full trigger");
  const json = parseJson(trigger.stdout);
  assert(json.ready === true, "tester should trigger when all developers are approved");
  assert(json.action === "tester_full_test", "tester action should be tester_full_test");
  assert(json.fingerprint.includes("ready_for_test"), "tester full fingerprint should use ready_for_test marker");

  data[uuid].developer.alpha.status = "done";
  data[uuid].developer.beta.status = "done";
  data[uuid].developer.gamma.status = "done";
  await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");
  const allDone = runScript(home, "standby-trigger.ts", [
    "--thread",
    uuid.slice(0, 8),
    "--role",
    "tester",
    "--key",
    "full",
  ]);
  expectOk(allDone, "standby tester all done");
  const allDoneJson = parseJson(allDone.stdout);
  assert(allDoneJson.ready === false, "tester should not trigger full test when all developers are already done");
}

async function testStandbyTesterRetest(home: string): Promise<void> {
  const taskDir = join(home, ".kanban", repo, uuid);
  const issueFile = "issue-gamma-retest.md";
  const data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
  data[uuid].tester.full.status = "waiting";
  data[uuid].tester.full.attempt = 1;
  data[uuid].developer.gamma.status = "ready_for_test";
  data[uuid].developer.gamma.reports = ["report-gamma-01.md", "report-gamma-02.md"];
  await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");
  await writeFile(join(taskDir, issueFile), [
    "---",
    "kind: issue",
    "uuid: issue-gamma-retest",
    "title: Gamma retest",
    "status: open",
    "type: bug",
    "owner: gamma",
    "created: 2026-05-22T10:00:00+08:00",
    "updated: 2026-05-22T10:00:00+08:00",
    "---",
    "",
    "## Summary",
    "",
    "Retest gamma.",
    "",
  ].join("\n"), "utf-8");

  const trigger = runScript(home, "standby-trigger.ts", [
    "--thread",
    uuid.slice(0, 8),
    "--role",
    "tester",
    "--key",
    "full",
  ]);
  expectOk(trigger, "standby tester retest trigger");
  const json = parseJson(trigger.stdout);
  assert(json.ready === true, "tester should trigger retest when issue owner is approved");
  assert(json.action === "tester_retest_issue", "tester action should be tester_retest_issue");
  assert(json.fingerprint === "tester:full:tester_retest_issue:gamma:ready_for_test:1:issue-gamma-retest.md|report-gamma-02.md", "tester retest fingerprint should use issue and owner latest report");
}

async function testStandbyDeveloper(home: string): Promise<void> {
  const data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
  data[uuid].developer.alpha.status = "review_rejected";
  data[uuid].developer.alpha.review = "review-alpha-01.md";
  data[uuid].developer.beta.status = "idle";
  data[uuid].developer.beta.blocked_on = null;
  data[uuid].developer.gamma.status = "follow_issue";
  await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

  const rejected = runScript(home, "standby-trigger.ts", [
    "--thread",
    uuid.slice(0, 8),
    "--role",
    "developer",
    "--key",
    "alpha",
  ]);
  expectOk(rejected, "standby developer rejected");
  assert(parseJson(rejected.stdout).action === "developer_review_rejected", "review_rejected developer should trigger rework");

  const idle = runScript(home, "standby-trigger.ts", [
    "--thread",
    uuid.slice(0, 8),
    "--role",
    "developer",
    "--key",
    "beta",
  ]);
  expectOk(idle, "standby developer idle");
  assert(parseJson(idle.stdout).action === "developer_start", "idle developer should trigger start");

  const issue = runScript(home, "standby-trigger.ts", [
    "--thread",
    uuid.slice(0, 8),
    "--role",
    "developer",
    "--key",
    "gamma",
  ]);
  expectOk(issue, "standby developer issue");
  assert(parseJson(issue.stdout).action === "developer_follow_issue", "follow_issue developer should trigger issue fix");
}

async function testStandbyDeveloperFollowIssueSkipsSeenIssue(): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "kanban-standby-dev-issue-home-"));
  try {
    const taskDir = await seedTask(home);
    const data = JSON.parse(await readFile(join(home, ".kanban", "kanban.json"), "utf-8"));
    data[uuid].developer.gamma.status = "follow_issue";
    data[uuid].developer.gamma.attempt = 2;
    await writeFile(join(home, ".kanban", "kanban.json"), JSON.stringify(data, null, 2) + "\n");

    await writeFile(join(taskDir, "issue-a-seen.md"), [
      "---",
      "kind: issue",
      "uuid: issue-a-seen",
      "title: Seen issue",
      "status: open",
      "type: bug",
      "owner: gamma",
      "created: 2026-05-22T10:00:00+08:00",
      "updated: 2026-05-22T10:00:00+08:00",
      "---",
      "",
      "## Summary",
      "",
      "Already handled by this standby session.",
      "",
    ].join("\n"), "utf-8");
    await writeFile(join(taskDir, "issue-b-new.md"), [
      "---",
      "kind: issue",
      "uuid: issue-b-new",
      "title: New issue",
      "status: open",
      "type: bug",
      "owner: gamma",
      "created: 2026-05-22T10:01:00+08:00",
      "updated: 2026-05-22T10:01:00+08:00",
      "---",
      "",
      "## Summary",
      "",
      "New issue should wake the developer.",
      "",
    ].join("\n"), "utf-8");

    const seenFingerprint = "developer:gamma:developer_follow_issue:gamma:follow_issue:2:issue-a-seen.md";
    const trigger = runScript(home, "standby-trigger.ts", [
      "--thread",
      uuid.slice(0, 8),
      "--role",
      "developer",
      "--key",
      "gamma",
      "--seen",
      seenFingerprint,
    ]);
    expectOk(trigger, "standby developer should skip seen issue");
    const json = parseJson(trigger.stdout);
    assert(json.ready === true, "developer should trigger when a later owner issue is unseen");
    assert(json.action === "developer_follow_issue", "developer issue action should be preserved");
    assert(json.targets?.[0] === "issue-b-new.md", "developer should target first unseen owner issue");
    assert(
      json.fingerprint === "developer:gamma:developer_follow_issue:gamma:follow_issue:2:issue-b-new.md",
      "developer follow_issue fingerprint should use unseen issue file",
    );

    const allSeen = runScript(home, "standby-trigger.ts", [
      "--thread",
      uuid.slice(0, 8),
      "--role",
      "developer",
      "--key",
      "gamma",
      "--seen",
      `${seenFingerprint},developer:gamma:developer_follow_issue:gamma:follow_issue:2:issue-b-new.md`,
    ]);
    expectOk(allSeen, "standby developer all issues seen");
    const allSeenJson = parseJson(allSeen.stdout);
    assert(allSeenJson.ready === false, "developer should not trigger when every owner issue fingerprint is seen");
    assert(
      allSeenJson.reason.includes("all developer follow_issue fingerprints already seen"),
      "developer all-seen reason should explain why standby stays idle",
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function testStandbyWaitExpired(): Promise<void> {
  let sleeps = 0;
  let sleptMs = 0;
  let triggerCalls = 0;
  const result = await runStandbyWait(async () => {
    triggerCalls++;
    return { ready: false, reason: "no actionable standby trigger" };
  }, async (ms) => {
    sleeps++;
    sleptMs += ms;
  }, { log: () => {} });

  assert(result.ready === false, "standby wait should expire without a trigger");
  assert("expired" in result && result.expired === true, "standby wait expiry should be explicit");
  assert(triggerCalls === 100, "standby wait should check once per empty poll");
  assert(sleeps === 100, "standby wait should sleep once per empty poll");
  assert(sleptMs === standbyBackoffTotalWaitSec() * 1000, "standby wait should sleep according to backoff total");
}

async function testStandbyResolve(home: string): Promise<void> {
  const cwdRoot = await mkdtemp(join(tmpdir(), "kanban-standby-cwd-"));
  const reviewCwd = join(cwdRoot, "review");
  const missingCwd = join(cwdRoot, "missing");
  const alphaCwd = join(cwdRoot, "alpha");
  await mkdir(reviewCwd);
  await mkdir(missingCwd);
  await mkdir(alphaCwd);

  const resolved = runScript(home, "standby-resolve.ts", [], reviewCwd);
  expectOk(resolved, "standby resolve unique");
  const json = parseJson(resolved.stdout);
  assert(json.thread === uuid, "standby resolve should find current thread");
  assert(json.role === "reviewer" && json.key === "review", "standby resolve should find reviewer entry");

  const missing = runScript(home, "standby-resolve.ts", [], missingCwd);
  assert(missing.exitCode !== 0, "standby resolve should fail for no candidate");

  await seedStandbyResolutionTask(home);
  const multi = runScript(home, "standby-resolve.ts", [], alphaCwd);
  assert(multi.exitCode !== 0, "standby resolve should fail for multiple candidates");
  assert(multi.stderr.includes("匹配多个席位"), "multiple candidate error should be explicit");
}

async function main() {
  const home = await mkdtemp(join(tmpdir(), "kanban-regression-home-"));
  try {
	    const taskDir = await seedTask(home);
	    await testQueryJson(home);
	    await testQueryGateArtifacts();
	    await testDoctorScript();
	    await testRoleAlias(home);
    await testRoleOwnerRegister();
    await testRoleOwnerRejectsExistingSeats();
    await testTesterCaseDocumentWrite(home);
    await testActionWriteOwnerRegister();
    await testActionWriteOwnerRegisterRejectsExistingSeats();
    await testActionWriteDeveloperSubmit(home, taskDir);
    await testActionWriteDeveloperSubmitRequiresRelatedIssue();
    await testActionWriteReviewerGate(home, taskDir);
    await testActionWriteOwnerCloseoutGuard();
    await testIssueLifecycle(home, taskDir);
    await testRelatedIssueGuard(home, taskDir);
    testStandbyWaitBackoff();
    await testStandbyReviewer(home);
    await testStandbyWaitReady(home);
    await testStandbyTesterFullTest(home);
    await testStandbyTesterRetest(home);
    await testStandbyDeveloper(home);
    await testStandbyDeveloperFollowIssueSkipsSeenIssue();
    await testStandbyWaitExpired();
    await testStandbyResolve(home);
    console.log("regression tests passed");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
