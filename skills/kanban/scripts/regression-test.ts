#!/usr/bin/env bun
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

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

async function main() {
  const home = await mkdtemp(join(tmpdir(), "kanban-regression-home-"));
  try {
    const taskDir = await seedTask(home);
    await testQueryJson(home);
    await testRoleAlias(home);
    await testIssueLifecycle(home, taskDir);
    await testRelatedIssueGuard(home, taskDir);
    console.log("regression tests passed");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
