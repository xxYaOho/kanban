#!/usr/bin/env bun
/**
 * Agent 领域字段写入脚本。
 *
 * 用法:
 *   bun run agent-write.ts --thread <uuid> --worktree <name> --set key=value [...]
 *
 * --thread    任务 UUID，支持短前缀（≥6 字符）
 * --worktree  目标 worktree 名（在 developer/reviewer/tester/integrator 中查找）
 * --set       字段赋值，可多次传入。数组字段传 JSON 字符串。
 * --append-reports <scope>=<json>  向 developer.reports 追加条目
 *
 * stdout: JSON { ok, taskUuid, taskShort, worktree, applied, taskStatus }
 */
import { withKanbanLock } from "./kanban-lock";
import {
  resolveUuid,
  type Kanban,
  type Task,
  type DevStatus,
  type IntegratorStatus,
  type ReviewerStatus,
  type TesterStatus,
  VALID_DEV_STATUSES,
  VALID_REVIEWER_STATUSES,
  VALID_TESTER_STATUSES,
  VALID_INTEGRATOR_STATUSES,
} from "./kanban-io";
import { readFileSync } from "fs";
import { basename } from "path";
import { fromKanbanRel, waveDir } from "./paths";
import { hasRelatedIssueReference, listIssues } from "./issue-io";
import { roleKeys, type Role } from "./protocol";

// ── 白名单 ──────────────────────────────────────────────────────────────────

const AGENT_WRITABLE_FIELDS = new Set([
  "status",
  "attempt",
  "error",
  "blocked_on",   // developer
  "reports",      // developer (JSON array)
  "review",       // developer (string)
  "case_document", // tester (string)
  "pass",         // reviewer + tester
  "fail",         // tester
  "report",       // reviewer + tester + integrator (string)
  "merged",       // integrator
  "conflicts",    // integrator
]);

type AgentStatus = DevStatus | ReviewerStatus | TesterStatus | IntegratorStatus;

const ALL_VALID_STATUSES = new Set<AgentStatus>([
  ...VALID_DEV_STATUSES,
  ...VALID_REVIEWER_STATUSES,
  ...VALID_TESTER_STATUSES,
  ...VALID_INTEGRATOR_STATUSES,
]);

// ── 参数解析 ─────────────────────────────────────────────────────────────────

interface Op {
  key: string;
  raw: string;
}

interface AppendReportOp {
  scope: string;
  description: string;
  document: string;
}

interface Args {
  uuid: string;
  worktree: string;
  ops: Op[];
  appendReports: AppendReportOp[];
}

function parseArgs(argv: string[]): Args {
  const a: Partial<Args> & { ops: Op[]; appendReports: AppendReportOp[] } = {
    ops: [],
    appendReports: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case "--thread":
      case "--uuid":
        if (!v) throw new Error(`${k} 缺少值`);
        a.uuid = v;
        i++;
        break;
      case "--worktree":
        if (!v) throw new Error("--worktree 缺少值");
        a.worktree = v;
        i++;
        break;
      case "--set": {
        if (!v) throw new Error("--set 缺少值，格式: --set key=value");
        const eq = v.indexOf("=");
        if (eq === -1) throw new Error(`--set 格式错误: ${v}，应为 key=value`);
        a.ops.push({ key: v.slice(0, eq), raw: v.slice(eq + 1) });
        i++;
        break;
      }
      case "--append-reports": {
        if (!v) throw new Error("--append-reports 缺少值");
        const eqIdx = v.indexOf("=");
        if (eqIdx === -1) throw new Error("--append-reports 格式: <scope>=<json>");
        const scope = v.slice(0, eqIdx);
        const entryJson = v.slice(eqIdx + 1);
        let entry: Record<string, unknown>;
        try { entry = JSON.parse(entryJson); } catch {
          throw new Error(`--append-reports JSON 解析失败: ${entryJson}`);
        }
        if (typeof entry.description !== "string" || typeof entry.document !== "string") {
          throw new Error("--append-reports 需要 { description: string, document: string }");
        }
        a.appendReports.push({ scope, description: entry.description, document: entry.document });
        i++;
        break;
      }
      default:
        throw new Error(`未知参数: ${k}`);
    }
  }

  if (!a.uuid) throw new Error("缺少 --thread");
  if (!a.worktree) throw new Error("缺少 --worktree");
  if (a.ops.length === 0 && a.appendReports.length === 0) {
    throw new Error("至少需要一个 --set 或 --append-reports");
  }

  return a as Args;
}

// ── 值校验与转换 ─────────────────────────────────────────────────────────────

function parseValue(key: string, raw: string): unknown {
  if (raw === "null") return null;

  switch (key) {
    case "status": {
      if (!ALL_VALID_STATUSES.has(raw as AgentStatus)) {
        throw new Error(`无效的 status: "${raw}"`);
      }
      return raw;
    }
    case "attempt": {
      if (!/^\d+$/.test(raw)) throw new Error(`attempt 必须是非负整数，收到: "${raw}"`);
      const n = Number(raw);
      if (!Number.isSafeInteger(n)) throw new Error(`attempt 数值过大: "${raw}"`);
      return n;
    }
    case "reports":
    case "pass":
    case "fail":
    case "merged":
    case "conflicts": {
      // 数组字段，接受 JSON 数组或原始 JSON 值
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error(`${key} 必须是数组`);
        return parsed;
      } catch (e) {
        if (e instanceof SyntaxError) throw new Error(`${key} JSON 解析失败: ${raw}`);
        throw e;
      }
    }
    default:
      // review, report, case_document, error, blocked_on - 字符串原样
      return raw;
  }
}

// ── 主逻辑 ───────────────────────────────────────────────────────────────────

type RoleKey = Role;

function extractFilename(path: string): string {
  return basename(fromKanbanRel(path));
}

function latestReportFile(entry: Record<string, unknown>, applied: string[]): string | null {
  for (let i = applied.length - 1; i >= 0; i--) {
    const item = applied[i];
    if (item.startsWith("reports.+=")) return item.slice("reports.+=".length);
  }
  const reports = entry["reports"];
  if (Array.isArray(reports) && typeof reports[reports.length - 1] === "string") {
    return reports[reports.length - 1];
  }
  return null;
}

function assertRelatedIssueForDevReport(
  task: Task,
  uuid: string,
  worktree: string,
  entry: Record<string, unknown>,
  applied: string[],
  isSubmittingReport: boolean,
): void {
  if (!isSubmittingReport) return;
  if ((entry["status"] as string | undefined) !== "waiting_review") return;
  const openIssues = listIssues(task.repo, uuid, { status: "open" })
    .filter((issue) => issue.owner === worktree);
  if (openIssues.length === 0) return;

  const reportFile = latestReportFile(entry, applied);
  if (!reportFile) {
    throw new Error(
      `developer.${worktree} 有 open issue,提交 waiting_review 必须同时写入 report 并在 frontmatter 引用 related_issue。` +
        ` 需引用: ${openIssues.map((i) => i.file).join(", ")}`,
    );
  }

  const reportPath = `${waveDir(task.repo, uuid)}/${extractFilename(reportFile)}`;
  let content = "";
  try {
    content = readFileSync(reportPath, "utf-8");
  } catch {
    throw new Error(`读取 dev report 失败: ${reportPath}`);
  }
  if (!hasRelatedIssueReference(content, openIssues.map((i) => i.file))) {
    throw new Error(
      `developer.${worktree} 有 open issue,dev report frontmatter 必须包含 related_issue。` +
        ` 需引用: ${openIssues.map((i) => i.file).join(", ")}`,
    );
  }
}

function assertGuardedWriteAllowed(roleKey: RoleKey, op: Op): void {
  if (roleKey === "developer" && op.key === "status" && op.raw === "done") {
    throw new Error("developer.status=done 必须通过 action-write.ts --action tester.submit-report 更新");
  }
  const guardedByRole: Partial<Record<RoleKey, Set<string>>> = {
    tester: new Set(["status", "case_document", "pass", "fail", "report"]),
    integrator: new Set(["status", "report", "merged", "conflicts"]),
  };
  if (guardedByRole[roleKey]?.has(op.key)) {
    const action = roleKey === "tester"
      ? "tester.submit-cases / tester.submit-report"
      : "integrator.submit-integration-report";
    throw new Error(`${roleKey}.${op.key} 必须通过 action-write.ts --action ${action} 更新`);
  }
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));

  const result = await withKanbanLock((kanban: Kanban) => {
    // 1. 解析 UUID
    let uuid = kanban[args.uuid] ? args.uuid : undefined;
    if (!uuid) {
      const matches = resolveUuid(kanban, args.uuid);
      if (matches.length === 0) throw new Error(`未找到匹配的 UUID: "${args.uuid}"`);
      if (matches.length > 1) {
        throw new Error(`UUID 前缀 "${args.uuid}" 匹配多个任务: ${matches.join(", ")}`);
      }
      uuid = matches[0];
    }
    const task = kanban[uuid];

    // 2. 在所有 role key 中查找目标 worktree
    let roleKey: RoleKey | null = null;
    let entry: Record<string, unknown> | null = null;
    for (const rk of roleKeys()) {
      const roleEntries = task[rk] as Record<string, any> | undefined;
      if (roleEntries?.[args.worktree]) {
        roleKey = rk;
        entry = roleEntries[args.worktree] as Record<string, unknown>;
        break;
      }
    }

    if (!entry) {
      const existing = roleKeys().flatMap((rk) => Object.keys((task[rk] as any) ?? {}));
      throw new Error(
        `worktree "${args.worktree}" 不存在于任务 ${uuid.slice(0, 8)}。` +
          `现有条目: ${existing.join(", ") || "(无)"}`,
      );
    }
    if (!roleKey) throw new Error(`worktree "${args.worktree}" 未匹配 role`);

    // 3. 校验并应用 --set
    const applied: string[] = [];
    for (const op of args.ops) {
      assertGuardedWriteAllowed(roleKey, op);
      // 向后兼容：旧字段 report/review/test 映射到新结构
      if (op.key === "report" || op.key === "review" || op.key === "test") {
        if (roleKey === "developer" && op.key === "review") {
          // developer.review — 单字符串字段
          entry[op.key] = op.raw === "null" ? null : op.raw;
          applied.push(`${op.key}=${op.raw}`);
          continue;
        }
        if (roleKey === "reviewer" && op.key === "report") {
          entry["report"] = op.raw === "null" ? "" : op.raw;
          applied.push(`report=${op.raw}`);
          continue;
        }
        if (roleKey === "tester" && op.key === "report") {
          entry["report"] = op.raw === "null" ? "" : op.raw;
          applied.push(`report=${op.raw}`);
          continue;
        }
        if (roleKey === "integrator" && op.key === "report") {
          entry["report"] = op.raw === "null" ? "" : op.raw;
          applied.push(`report=${op.raw}`);
          continue;
        }
        // developer.report → developer.reports 数组追加
        if (roleKey === "developer" && op.key === "report") {
          const reports = (entry["reports"] as string[]) ?? [];
          const filename = op.raw === "null" ? "" : op.raw.split("/").pop() ?? op.raw;
          if (filename) reports.push(filename);
          entry["reports"] = reports;
          applied.push(`reports.+=${filename}`);
          continue;
        }
      }

      if (!AGENT_WRITABLE_FIELDS.has(op.key)) {
        throw new Error(
          `字段 "${op.key}" 不在 Agent 可写白名单中。` +
            `可写字段: ${[...AGENT_WRITABLE_FIELDS].join(", ")}`,
        );
      }
      const value = parseValue(op.key, op.raw);
      entry[op.key] = value;
      applied.push(`${op.key}=${op.raw}`);
    }

    // 4. 应用 --append-reports
    for (const ar of args.appendReports) {
      const reports = (entry["reports"] as string[]) ?? [];
      const filename = ar.document.split("/").pop() ?? ar.document;
      reports.push(filename);
      entry["reports"] = reports;
      applied.push(`reports.+=${filename}`);
    }

    if (roleKey === "developer") {
      const isSubmittingReport =
        args.appendReports.length > 0 ||
        args.ops.some((op) =>
          (op.key === "status" && op.raw === "waiting_review") ||
          op.key === "report" ||
          op.key === "reports"
        );
      assertRelatedIssueForDevReport(task, uuid, args.worktree, entry, applied, isSubmittingReport);
    }

    return {
      taskUuid: uuid,
      taskShort: uuid.slice(0, 8),
      worktree: args.worktree,
      roleKey,
      applied,
      taskStatus: task.status,
    };
  });

  console.log(JSON.stringify({ ok: true, ...result }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
