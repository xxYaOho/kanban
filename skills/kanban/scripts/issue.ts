#!/usr/bin/env bun
/**
 * Issue lifecycle for tester-owned bugs.
 *
 * Usage:
 *   bun run issue.ts open --thread <uuid> --test <name> --owner <developer> --title <title> ...
 *   bun run issue.ts done --thread <uuid> --issue <file> --test <name> --resolution <text>
 *   bun run issue.ts closed --thread <uuid> --issue <file> --test <name> --resolution <text>
 */
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";
import { basename, join } from "path";
import { withKanbanLock } from "./kanban-lock";
import { issuePath, toKanbanRel } from "./paths";
import { nowIso, resolveUuid, type Kanban, type Task } from "./kanban-io";
import { issueArchiveDir, resolveIssue, type IssueStatus } from "./issue-io";

type Command = "open" | "done" | "closed";

interface Args {
  command: Command;
  uuid: string;
  issue?: string;
  tester?: string;
  owner?: string;
  title?: string;
  type: string;
  reproduction?: string;
  expected?: string;
  actual?: string;
  diagnosis?: string;
  blocker?: string;
  retest?: string;
  relatedReport?: string;
  resolution?: string;
  force?: boolean;
}

async function resolveText(raw?: string): Promise<string> {
  if (!raw) return "";
  if (raw.startsWith("@")) return await readFile(raw.slice(1), "utf-8");
  return raw;
}

function slugify(title: string): string {
  const ascii = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return ascii || "issue";
}

function parseArgs(argv: string[]): Args {
  const command = argv[0] as Command | undefined;
  if (!command || !["open", "done", "closed"].includes(command)) {
    throw new Error("用法: issue.ts <open|done|closed> ...");
  }
  const a: Partial<Args> = { command, type: "bug" };
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--thread":
      case "--uuid":
        if (!v) throw new Error(`${k} 缺少值`);
        a.uuid = v;
        i++;
        break;
      case "--issue":
        if (!v) throw new Error("--issue 缺少值");
        a.issue = v;
        i++;
        break;
      case "--test":
        if (!v) throw new Error("--test 缺少值");
        a.tester = v;
        i++;
        break;
      case "--owner":
        if (!v) throw new Error("--owner 缺少值");
        a.owner = v;
        i++;
        break;
      case "--title":
        if (!v) throw new Error("--title 缺少值");
        a.title = v;
        i++;
        break;
      case "--type":
        if (!v) throw new Error("--type 缺少值");
        a.type = v;
        i++;
        break;
      case "--reproduction":
        if (!v) throw new Error("--reproduction 缺少值");
        a.reproduction = v;
        i++;
        break;
      case "--expected":
        if (!v) throw new Error("--expected 缺少值");
        a.expected = v;
        i++;
        break;
      case "--actual":
        if (!v) throw new Error("--actual 缺少值");
        a.actual = v;
        i++;
        break;
      case "--diagnosis":
        if (!v) throw new Error("--diagnosis 缺少值");
        a.diagnosis = v;
        i++;
        break;
      case "--blocker":
        if (!v) throw new Error("--blocker 缺少值");
        a.blocker = v;
        i++;
        break;
      case "--retest":
        if (!v) throw new Error("--retest 缺少值");
        a.retest = v;
        i++;
        break;
      case "--related-report":
        if (!v) throw new Error("--related-report 缺少值");
        a.relatedReport = v;
        i++;
        break;
      case "--resolution":
        if (!v) throw new Error("--resolution 缺少值");
        a.resolution = v;
        i++;
        break;
      case "--force":
        a.force = true;
        break;
      default:
        throw new Error(`未知参数: ${k}`);
    }
  }
  if (!a.uuid) throw new Error("缺少 --thread");
  if (command === "open") {
    for (const required of ["tester", "owner", "title", "reproduction", "expected", "actual", "diagnosis", "blocker", "retest"] as const) {
      const flag = required === "tester"
        ? "test"
        : required.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      if (!a[required]) throw new Error(`issue open 缺少 --${flag}`);
    }
  } else {
    if (!a.issue) throw new Error(`${command} 缺少 --issue`);
    if (!a.tester) throw new Error(`${command} 缺少 --test`);
    if (!a.resolution) throw new Error(`${command} 缺少 --resolution`);
  }
  return a as Args;
}

function resolveTaskUuid(kanban: Kanban, prefix: string): string {
  if (kanban[prefix]) return prefix;
  const matches = resolveUuid(kanban, prefix);
  if (matches.length === 0) throw new Error(`找不到任务: ${prefix}`);
  if (matches.length > 1) throw new Error(`UUID 前缀 ${prefix} 多候选: ${matches.join(", ")}`);
  return matches[0];
}

function assertTesterEntry(task: Task, testerName: string): void {
  if (!task.tester?.[testerName]) {
    throw new Error(`tester 条目不存在: ${testerName}`);
  }
}

function assertOwner(task: Task, owner: string, force?: boolean): "developer" | "external" {
  if (task.developer?.[owner]) return "developer";
  if (force) return "external";
  throw new Error(`owner developer 不存在: ${owner}。非 developer owner 请传 --force`);
}

function replaceFrontmatterValue(content: string, key: string, value: string): string {
  const escaped = value.includes(":") || value.includes("#") ? `"${value.replace(/"/g, '\\"')}"` : value;
  const re = new RegExp(`^${key}:.*$`, "m");
  if (re.test(content)) return content.replace(re, `${key}: ${escaped}`);
  return content.replace(/^---\n/, `---\n${key}: ${escaped}\n`);
}

function setResolution(content: string, resolution: string): string {
  if (/## Resolution\s+[\s\S]*$/m.test(content)) {
    return content.replace(/## Resolution\s+[\s\S]*$/m, `## Resolution\n\n${resolution.trim()}\n`);
  }
  return `${content.trim()}\n\n## Resolution\n\n${resolution.trim()}\n`;
}

async function buildIssueContent(args: Args, issueUuid: string, now: string): Promise<string> {
  const title = args.title!;
  const owner = args.owner!;
  const reproduction = await resolveText(args.reproduction);
  const expected = await resolveText(args.expected);
  const actual = await resolveText(args.actual);
  const diagnosis = await resolveText(args.diagnosis);
  const blocker = await resolveText(args.blocker);
  const retest = await resolveText(args.retest);
  const relatedReport = args.relatedReport ? `- Related test report: \`${args.relatedReport}\`` : "";

  return `---
kind: issue
uuid: ${issueUuid}
title: "${title.replace(/"/g, '\\"')}"
status: open
type: ${args.type}
owner: ${owner}
created: ${now}
updated: ${now}
---

# Issue - ${title}

## Summary

${blocker.trim()}

## Reproduction

${reproduction.trim()}
${relatedReport ? `\n${relatedReport}` : ""}

## Expected / Actual

Expected: ${expected.trim()}
Actual: ${actual.trim()}

## Diagnosis

${diagnosis.trim()}

## Owner

- Developer: \`${owner}\`
- Required next state: \`${owner}\` 修复后提交 dev report,并重新进入 reviewer 审查。
- Dev report must include: \`related_issue: issue-${slugify(title)}-${issueUuid.slice(0, 8)}.md\`

## Retest Plan

${retest.trim()}

## Resolution

Pending.
`;
}

async function openIssue(args: Args) {
  const issueUuid = randomUUID().toLowerCase();
  const now = nowIso();
  let output: Record<string, unknown> = {};

  await withKanbanLock(async (kanban) => {
    const uuid = resolveTaskUuid(kanban, args.uuid);
    const task = kanban[uuid];
    assertTesterEntry(task, args.tester!);
    const ownerKind = assertOwner(task, args.owner!, args.force);
    const slug = `${slugify(args.title!)}-${issueUuid.slice(0, 8)}`;
    const path = issuePath(task.repo, uuid, slug);
    if (existsSync(path)) throw new Error(`issue 文件已存在: ${path}`);

    await writeFile(path, await buildIssueContent(args, issueUuid, now), "utf-8");

    if (ownerKind === "developer") {
      task.developer[args.owner!].status = "follow_issue";
    }
    task.tester[args.tester!].status = "waiting";
    task.tester[args.tester!].fail = [...new Set([...(task.tester[args.tester!].fail ?? []), basename(path)])];

    output = {
      taskUuid: uuid,
      taskShort: uuid.slice(0, 8),
      issue: basename(path),
      issuePath: toKanbanRel(path),
      owner: args.owner,
      ownerStatus: ownerKind === "developer" ? "follow_issue" : "unchanged",
      tester: args.tester,
      testerStatus: "waiting",
    };
  });

  console.log(JSON.stringify({ ok: true, action: "open", ...output }, null, 2));
}

async function closeIssue(args: Args, status: Exclude<IssueStatus, "open">) {
  const now = nowIso();
  let output: Record<string, unknown> = {};

  await withKanbanLock(async (kanban) => {
    const uuid = resolveTaskUuid(kanban, args.uuid);
    const task = kanban[uuid];
    assertTesterEntry(task, args.tester!);

    const issue = resolveIssue(task.repo, uuid, args.issue!);
    if (status === "done" && task.developer?.[issue.owner]?.status !== "review_approved") {
      const actual = task.developer?.[issue.owner]?.status ?? "not_developer";
      throw new Error(`issue done 前 owner developer 必须是 review_approved。当前 ${issue.owner}:${actual}`);
    }

    const archiveDir = issueArchiveDir(task.repo, uuid);
    await mkdir(archiveDir, { recursive: true });

    const raw = await readFile(issue.path, "utf-8");
    const updated = setResolution(
      replaceFrontmatterValue(
        replaceFrontmatterValue(raw, "status", status),
        "updated",
        now,
      ),
      args.resolution!,
    );
    await writeFile(issue.path, updated, "utf-8");
    const target = join(archiveDir, issue.file);
    await rename(issue.path, target);

    const tester = task.tester[args.tester!];
    if (status === "done") {
      tester.status = "done";
      tester.pass = [...new Set([...(tester.pass ?? []), issue.file])];
      tester.fail = (tester.fail ?? []).filter((file) => file !== issue.file);
    } else {
      tester.status = "waiting";
      tester.fail = (tester.fail ?? []).filter((file) => file !== issue.file);
    }

    output = {
      taskUuid: uuid,
      taskShort: uuid.slice(0, 8),
      issue: issue.file,
      archivedTo: toKanbanRel(target),
      status,
      tester: args.tester,
      testerStatus: tester.status,
    };
  });

  console.log(JSON.stringify({ ok: true, action: status, ...output }, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "open") await openIssue(args);
  else await closeIssue(args, args.command);
}

main().catch((err) => {
  console.error("❌ issue 失败:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
