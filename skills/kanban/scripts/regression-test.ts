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
          error: null,
        },
      },
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
  await writeFile(join(taskDir, "report-alpha-01.md"), "---\nkind: dev-report\n---\n", "utf-8");
  await writeFile(join(taskDir, "report-gamma-01.md"), "---\nkind: dev-report\n---\n", "utf-8");
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
        error: null,
      },
    },
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
  assert(json.integratorBlockedBy.some((entry: any) => entry.role === "tester" && entry.key === "full"), "tester should block integrator");
  assert(typeof json.recommendedNextAction === "string" && json.recommendedNextAction.length < 120, "recommendedNextAction should be short");
  assert(json.idleStations.tester.some((entry: any) => entry.stationName === "legacy"), "legacy task.test should migrate into tester idleStations");
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
  data[uuid].developer.beta.status = "review_approved";
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
  assert(
    json.fingerprint === "tester:full:tester_full_test:all-developers:review_approved:0:alpha:1:report-alpha-01.md|beta:1:report-beta-01.md|delta:1:report-delta-01.md|gamma:1:report-gamma-01.md",
    "tester full fingerprint should allow done developers and use sorted developer attempt/report artifact",
  );

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
  data[uuid].developer.gamma.status = "review_approved";
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
  assert(json.fingerprint === "tester:full:tester_retest_issue:gamma:review_approved:1:issue-gamma-retest.md|report-gamma-02.md", "tester retest fingerprint should use issue and owner latest report");
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
    await testRoleAlias(home);
    await testTesterCaseDocumentWrite(home);
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
