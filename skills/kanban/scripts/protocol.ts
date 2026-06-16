/**
 * Canonical kanban protocol registry.
 *
 * Runtime state uses canonical role keys only. Legacy aliases are accepted at
 * command boundaries and normalized before touching task data.
 */

export const roles = ["owner", "developer", "reviewer", "tester", "integrator"] as const;
export type Role = (typeof roles)[number];

export const roleAliases = {
  test: "tester",
} as const satisfies Record<string, Role>;

export type RoleAlias = keyof typeof roleAliases;
export type RoleInput = Role | RoleAlias;

const roleSet = new Set<string>(roles);
const roleAliasMap: Record<string, Role> = roleAliases;

export function normalizeRole(input: string): Role | null {
  const candidate = roleAliasMap[input] ?? input;
  return roleSet.has(candidate) ? candidate as Role : null;
}

export function assertRole(input: string): Role {
  const role = normalizeRole(input);
  if (!role) throw new Error(`非法 role: ${input}`);
  return role;
}

export function isRole(input: string): input is Role {
  return roleSet.has(input);
}

export function roleKeys(): Role[] {
  return [...roles];
}

type RoleEntryHost = Partial<Record<Role, Record<string, unknown>>>;

export function getRoleEntries<T = unknown>(
  task: RoleEntryHost,
  role: Role,
): Record<string, T> {
  return (task[role] ?? {}) as Record<string, T>;
}

export function setRoleEntries<T>(
  task: RoleEntryHost,
  role: Role,
  entries: Record<string, T>,
): void {
  task[role] = entries as Record<string, unknown>;
}

export const taskStatuses = [
  "draft",
  "planned",
  "in_progress",
  "done",
  "archived",
  "aborted",
] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const terminalTaskStatuses = ["done", "archived", "aborted"] as const;

export const statusDisplayOrder = [
  "in_progress",
  "planned",
  "draft",
  "done",
  "archived",
  "aborted",
] as const satisfies readonly TaskStatus[];

export const developerStatuses = [
  "idle",
  "working",
  "follow_issue",
  "ready_for_test",
  "waiting_review",
  "under_review",
  "review_approved",
  "review_rejected",
  "done",
  "blocked",
] as const;
export type DeveloperStatus = (typeof developerStatuses)[number];

export const ownerStatuses = ["idle", "working", "waiting", "done", "blocked"] as const;
export type OwnerStatus = (typeof ownerStatuses)[number];

export const reviewerStatuses = ["idle", "working", "done"] as const;
export type ReviewerStatus = (typeof reviewerStatuses)[number];

export const testerStatuses = ["idle", "working", "waiting", "done"] as const;
export type TesterStatus = (typeof testerStatuses)[number];

export const integratorStatuses = ["idle", "working", "done"] as const;
export type IntegratorStatus = (typeof integratorStatuses)[number];

export const roleStatuses = {
  owner: ownerStatuses,
  developer: developerStatuses,
  reviewer: reviewerStatuses,
  tester: testerStatuses,
  integrator: integratorStatuses,
} as const;

export type AgentStatus =
  | OwnerStatus
  | DeveloperStatus
  | ReviewerStatus
  | TesterStatus
  | IntegratorStatus;

export const issueStatuses = ["open", "done", "closed"] as const;
export type IssueStatus = (typeof issueStatuses)[number];

export const reportTypes = {
  owner: "owner-closeout",
  developer: "dev-report",
  reviewer: "review",
  tester: "test-report",
  integrator: "integration-report",
} as const;
export type ReportType = (typeof reportTypes)[Role];

export const reportFilePrefixes = {
  owner: "owner-closeout",
  developer: "report",
  reviewer: "review",
  tester: "test",
  integrator: "integration",
  issue: "issue",
} as const;
