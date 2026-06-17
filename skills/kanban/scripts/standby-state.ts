import { basename } from "path";
import { readKanban, resolveUuid, type DevEntry, type Kanban, type Task } from "./kanban-io";
import { listIssues, type IssueMeta } from "./issue-io";
import { roleKeys, type Role } from "./protocol";

export interface StandbyEntryRef {
  uuid: string;
  task: Task;
  role: Role;
  key: string;
  status: string;
  attempt: number;
}

export interface OpenIssueWithOwnerStatus extends IssueMeta {
  ownerStatus: string;
}

export function resolveTaskUuid(kanban: Kanban, prefix: string): string {
  if (kanban[prefix]) return prefix;
  const matches = resolveUuid(kanban, prefix);
  if (matches.length === 0) throw new Error(`找不到任务: ${prefix}`);
  if (matches.length > 1) {
    throw new Error(`UUID 前缀 ${prefix} 多候选: ${matches.join(", ")}`);
  }
  return matches[0];
}

export function latestDeveloperReport(entry: DevEntry | undefined): string {
  const reports = entry?.reports ?? [];
  return reports[reports.length - 1] ?? "";
}

export function resolveEntryInTask(task: Task, uuid: string, role: Role, key: string): StandbyEntryRef {
  const entry = task[role]?.[key] as { status?: string; attempt?: number } | undefined;
  if (!entry) {
    throw new Error(`任务 ${uuid.slice(0, 8)} 中找不到 ${role}.${key}`);
  }
  return {
    uuid,
    task,
    role,
    key,
    status: entry.status ?? "",
    attempt: entry.attempt ?? 0,
  };
}

export function findActiveEntryByCwd(kanban: Kanban, cwdName: string): StandbyEntryRef[] {
  const matches: StandbyEntryRef[] = [];
  for (const [uuid, task] of Object.entries(kanban)) {
    if (task.status !== "planned" && task.status !== "in_progress") continue;
    for (const role of roleKeys()) {
      if (role === "reviewer") continue;
      const entries = task[role] ?? {};
      for (const [key, entry] of Object.entries(entries)) {
        const maybeEntry = entry as { cwd?: string | null; status?: string; attempt?: number };
        if (maybeEntry.cwd === cwdName || key === cwdName) {
          matches.push({
            uuid,
            task,
            role,
            key,
            status: maybeEntry.status ?? "",
            attempt: maybeEntry.attempt ?? 0,
          });
        }
      }
    }
  }
  return matches;
}

export async function resolveSingleActiveEntryForCwd(cwd = basename(process.cwd())): Promise<StandbyEntryRef> {
  const kanban = await readKanban();
  const matches = findActiveEntryByCwd(kanban, cwd);
  if (matches.length === 0) {
    const reviewerEntries = Object.entries(kanban)
      .filter(([, task]) => task.status === "planned" || task.status === "in_progress")
      .flatMap(([uuid, task]) =>
        Object.entries(task.reviewer ?? {}).map(([key, entry]) => ({
          uuid,
          key,
          status: entry.status,
        }))
      );
    if (reviewerEntries.length > 0) {
      const labels = reviewerEntries
        .map((entry) => `${entry.uuid.slice(0, 8)}:reviewer.${entry.key}(${entry.status})`)
        .join(", ");
      throw new Error(
        `当前 cwd "${cwd}" 未匹配任何 planned/in_progress 席位。reviewer 是无 cwd 席位,` +
          `请显式使用 /kanban --thread <id> --role reviewer --standby；这不是 role 注册失败。可用 reviewer: ${labels}`,
      );
    }
    throw new Error(`当前 cwd "${cwd}" 未匹配任何 planned/in_progress 席位，请先注册角色`);
  }
  if (matches.length > 1) {
    const labels = matches
      .map((match) => `${match.uuid.slice(0, 8)}:${match.role}.${match.key}(${match.status})`)
      .join(", ");
    throw new Error(`当前 cwd "${cwd}" 匹配多个席位，请指定 thread: ${labels}`);
  }
  return matches[0];
}

export function openIssuesWithOwnerStatus(task: Task, uuid: string): OpenIssueWithOwnerStatus[] {
  return listIssues(task.repo, uuid, { status: "open" }).map((issue) => ({
    ...issue,
    ownerStatus: task.developer?.[issue.owner]?.status ?? "not_developer",
  }));
}

export async function loadStandbyEntry(uuidPrefix: string, role: Role, key: string): Promise<StandbyEntryRef> {
  const kanban = await readKanban();
  const uuid = resolveTaskUuid(kanban, uuidPrefix);
  const task = kanban[uuid];
  if (!task) throw new Error(`找不到任务: ${uuidPrefix}`);
  return resolveEntryInTask(task, uuid, role, key);
}
