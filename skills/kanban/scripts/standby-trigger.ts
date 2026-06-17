#!/usr/bin/env bun
/**
 * Pure-read standby trigger detector.
 *
 * It decides whether the registered role entry has an actionable next step.
 * It does not write kanban state or report files.
 */
import { assertRole, type Role } from "./protocol";
import {
  latestDeveloperReport,
  loadStandbyEntry,
  openIssuesWithOwnerStatus,
} from "./standby-state";
import type { DevEntry, Task } from "./kanban-io";
import { isCliEntry } from "./cli-entry";

type StandbyAction =
  | "review_waiting_developer"
  | "tester_full_test"
  | "tester_retest_issue"
  | "developer_start"
  | "developer_review_rejected"
  | "developer_follow_issue";

export interface StandbyTriggerArgs {
  uuid: string;
  role: Role;
  key: string;
  seen: Set<string>;
}

export interface StandbyTriggerResult {
  ready: boolean;
  role?: Role;
  key?: string;
  action?: StandbyAction;
  targets?: string[];
  fingerprint?: string;
  reason: string;
}

export function parseStandbyTriggerArgs(argv: string[]): StandbyTriggerArgs {
  const raw: Partial<{ uuid: string; role: Role; key: string; seen: string }> = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--thread":
      case "--uuid":
        if (!v) throw new Error(`${k} 缺少值`);
        raw.uuid = v;
        i++;
        break;
      case "--role":
        if (!v) throw new Error("--role 缺少值");
        raw.role = assertRole(v);
        i++;
        break;
      case "--key":
      case "--worktree":
        if (!v) throw new Error(`${k} 缺少值`);
        raw.key = v;
        i++;
        break;
      case "--seen":
        raw.seen = v ?? "";
        i++;
        break;
      default:
        throw new Error(`未知参数: ${k}`);
    }
  }
  if (!raw.uuid) throw new Error("缺少 --thread");
  if (!raw.role) throw new Error("缺少 --role");
  if (!raw.key) throw new Error("缺少 --key");
  return {
    uuid: raw.uuid,
    role: raw.role,
    key: raw.key,
    seen: new Set((raw.seen ?? "").split(",").filter(Boolean)),
  };
}

function fingerprint(
  role: Role,
  key: string,
  action: StandbyAction,
  targetKey: string,
  targetStatus: string,
  targetAttempt: number,
  artifact: string,
): string {
  return [role, key, action, targetKey, targetStatus, String(targetAttempt), artifact || "-"].join(":");
}

function readyIfUnseen(
  args: StandbyTriggerArgs,
  trigger: Omit<StandbyTriggerResult, "ready"> & { fingerprint: string },
): StandbyTriggerResult {
  if (args.seen.has(trigger.fingerprint)) {
    return { ready: false, reason: `fingerprint already seen: ${trigger.fingerprint}` };
  }
  return { ready: true, ...trigger };
}

function developerEntries(task: Task): Array<[string, DevEntry]> {
  return Object.entries(task.developer ?? {});
}

function buildFullTestArtifact(task: Task): string {
  return developerEntries(task)
    .map(([key, entry]) => `${key}:${entry.attempt}:${latestDeveloperReport(entry) || "-"}`)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function isDeveloperReadyForTest(status: string): boolean {
  return status === "ready_for_test" || status === "review_approved" || status === "done";
}

function isDeveloperNewlyReadyForTest(status: string): boolean {
  return status === "ready_for_test" || status === "review_approved";
}

function isDeveloperBlockerSatisfied(task: Task, blockedOn: string | null): boolean {
  if (!blockedOn) return true;
  const blocker = task.developer?.[blockedOn];
  return Boolean(blocker && isDeveloperReadyForTest(blocker.status));
}

function reviewerTrigger(args: StandbyTriggerArgs, task: Task): StandbyTriggerResult {
  const target = developerEntries(task)
    .filter(([, entry]) => entry.status === "waiting_review")
    .sort(([a], [b]) => a.localeCompare(b))[0];
  if (!target) return { ready: false, reason: "no developer waiting_review" };

  const [targetKey, entry] = target;
  const artifact = latestDeveloperReport(entry);
  const fp = fingerprint(args.role, args.key, "review_waiting_developer", targetKey, entry.status, entry.attempt, artifact);
  return readyIfUnseen(args, {
    role: args.role,
    key: args.key,
    action: "review_waiting_developer",
    targets: [targetKey],
    fingerprint: fp,
    reason: `developer.${targetKey} is waiting_review`,
  });
}

function testerTrigger(args: StandbyTriggerArgs, uuid: string, task: Task): StandbyTriggerResult {
  const tester = task.tester?.[args.key];
  if (!tester) throw new Error(`tester.${args.key} 不存在`);
  if (tester.status === "done") return { ready: false, reason: "tester already done" };

  if (tester.status === "waiting") {
    const issue = openIssuesWithOwnerStatus(task, uuid)
      .filter((item) => item.ownerStatus === "ready_for_test" || item.ownerStatus === "review_approved")
      .sort((a, b) => a.file.localeCompare(b.file))[0];
    if (issue) {
      const ownerReport = latestDeveloperReport(task.developer?.[issue.owner]);
      const artifact = `${issue.file}|${ownerReport || "-"}`;
      const fp = fingerprint(args.role, args.key, "tester_retest_issue", issue.owner, issue.ownerStatus, tester.attempt, artifact);
      return readyIfUnseen(args, {
        role: args.role,
        key: args.key,
        action: "tester_retest_issue",
        targets: [issue.file],
        fingerprint: fp,
        reason: `open issue ${issue.file} owner ${issue.owner} is ready for test`,
      });
    }
    return { ready: false, reason: "tester waiting; no open issue owner is ready for test" };
  }

  const developers = developerEntries(task);
  const allReady = developers.length > 0 &&
    developers.every(([, entry]) => isDeveloperReadyForTest(entry.status));
  const hasNewReady = developers.some(([, entry]) => isDeveloperNewlyReadyForTest(entry.status));
  if (!allReady) return { ready: false, reason: "not all developers are ready_for_test, review_approved, or done" };
  if (!hasNewReady) return { ready: false, reason: "all developers are already done" };

  const artifact = buildFullTestArtifact(task);
  const fp = fingerprint(args.role, args.key, "tester_full_test", "all-developers", "ready_for_test", tester.attempt, artifact);
  return readyIfUnseen(args, {
    role: args.role,
    key: args.key,
    action: "tester_full_test",
    targets: ["all-developers"],
    fingerprint: fp,
    reason: "all developers are ready for test",
  });
}

function developerTrigger(args: StandbyTriggerArgs, uuid: string, task: Task): StandbyTriggerResult {
  const dev = task.developer?.[args.key];
  if (!dev) throw new Error(`developer.${args.key} 不存在`);

  if (dev.status === "idle") {
    const blockerSatisfied = isDeveloperBlockerSatisfied(task, dev.blocked_on);
    if ((task.status === "planned" || task.status === "in_progress") && blockerSatisfied) {
      const fp = fingerprint(args.role, args.key, "developer_start", args.key, dev.status, dev.attempt, task.plan || "-");
      return readyIfUnseen(args, {
        role: args.role,
        key: args.key,
        action: "developer_start",
        targets: [args.key],
        fingerprint: fp,
        reason: dev.blocked_on
          ? `developer blocker ${dev.blocked_on} is ready`
          : "developer is idle and task can start",
      });
    }
    return { ready: false, reason: dev.blocked_on ? `developer blocked_on ${dev.blocked_on}` : `task status ${task.status} cannot start` };
  }

  if (dev.status === "review_rejected") {
    const artifact = dev.review || "-";
    const fp = fingerprint(args.role, args.key, "developer_review_rejected", args.key, dev.status, dev.attempt, artifact);
    return readyIfUnseen(args, {
      role: args.role,
      key: args.key,
      action: "developer_review_rejected",
      targets: [args.key],
      fingerprint: fp,
      reason: "developer review_rejected",
    });
  }

  if (dev.status === "follow_issue") {
    const issues = openIssuesWithOwnerStatus(task, uuid)
      .filter((item) => item.owner === args.key)
      .sort((a, b) => a.file.localeCompare(b.file));
    for (const issue of issues) {
      const fp = fingerprint(args.role, args.key, "developer_follow_issue", args.key, dev.status, dev.attempt, issue.file);
      if (args.seen.has(fp)) continue;
      return {
        ready: true,
        role: args.role,
        key: args.key,
        action: "developer_follow_issue",
        targets: [issue.file],
        fingerprint: fp,
        reason: `developer owns open issue ${issue.file}`,
      };
    }
    if (issues.length > 0) {
      return {
        ready: false,
        reason: `all developer follow_issue fingerprints already seen: ${issues.map((issue) => issue.file).join(", ")}`,
      };
    }

    const fp = fingerprint(args.role, args.key, "developer_follow_issue", args.key, dev.status, dev.attempt, "-");
    return readyIfUnseen(args, {
      role: args.role,
      key: args.key,
      action: "developer_follow_issue",
      targets: [args.key],
      fingerprint: fp,
      reason: "developer follow_issue",
    });
  }

  return { ready: false, reason: `developer status ${dev.status} is not actionable` };
}

export async function getStandbyTrigger(args: StandbyTriggerArgs): Promise<StandbyTriggerResult> {
  if (args.role === "integrator") throw new Error("v1 不支持 integrator --standby");

  const entry = await loadStandbyEntry(args.uuid, args.role, args.key);
  if (args.role === "reviewer") {
    return reviewerTrigger(args, entry.task);
  } else if (args.role === "tester") {
    return testerTrigger(args, entry.uuid, entry.task);
  } else if (args.role === "developer") {
    return developerTrigger(args, entry.uuid, entry.task);
  }
  throw new Error(`不支持的 standby role: ${args.role}`);
}

async function main() {
  const args = parseStandbyTriggerArgs(Bun.argv.slice(2));
  const trigger = await getStandbyTrigger(args);
  console.log(JSON.stringify(trigger, null, 2));
}

if (isCliEntry(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
