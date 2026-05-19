import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { basename, dirname, resolve } from "path";
import type { Task } from "./kanban-io";
import { fromKanbanRel } from "./paths";

const MULTI_PLAN_MARKER = /\bmulti-plan\b/i;
const ROLE_KEYS = ["developer", "reviewer", "test", "integrator"] as const;

export interface PlanInspection {
  planAbs: string;
  planExists: boolean;
  planHasContent: boolean;
  content: string;
  linkedSubPlans: string[];
  actualSubPlans: string[];
  isMultiPlan: boolean;
}

export function extractLinkedSubPlans(markdown: string): string[] {
  const matches = new Set<string>();
  const linkPattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of markdown.matchAll(linkPattern)) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget) continue;
    const withoutFragment = rawTarget.split("#")[0];
    if (/^[a-z][a-z0-9+.-]*:/i.test(withoutFragment)) continue;
    if (!withoutFragment.startsWith("./")) continue;
    const filename = basename(withoutFragment);
    if (withoutFragment === `./${filename}` && /^plan-[^/\\]+\.md$/i.test(filename)) {
      matches.add(filename);
    }
  }
  return [...matches].sort();
}

export function listActualSubPlans(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^plan-[^/\\]+\.md$/i.test(f))
    .sort();
}

export function isMultiPlanContent(markdown: string): boolean {
  return extractLinkedSubPlans(markdown).length > 0 || MULTI_PLAN_MARKER.test(markdown);
}

export function inspectPlan(task: Task): PlanInspection {
  const planAbs = fromKanbanRel(task.plan);
  const planExists = existsSync(planAbs);
  if (!planExists) {
    return {
      planAbs,
      planExists,
      planHasContent: false,
      content: "",
      linkedSubPlans: [],
      actualSubPlans: listActualSubPlans(dirname(planAbs)),
      isMultiPlan: false,
    };
  }

  const content = readFileSync(planAbs, "utf-8");
  const linkedSubPlans = extractLinkedSubPlans(content);
  const actualSubPlans = listActualSubPlans(dirname(planAbs));
  return {
    planAbs,
    planExists,
    planHasContent: statSync(planAbs).size > 0 && content.trim().length > 0,
    content,
    linkedSubPlans,
    actualSubPlans,
    isMultiPlan: isMultiPlanContent(content),
  };
}

export function buildMultiPlanIndex(description: string): string {
  return [
    `# ${description}`,
    "",
    "multi-plan index",
    "",
    "## SubPlans",
    "",
    "- 待确认第一个子计划后,添加 `./plan-<slug>.md` 链接。",
    "",
    "## Protocol",
    "",
    "- `draft`: 尚无实际子计划。",
    "- `planned`: 至少一个 `plan-*.md` 子计划已确认并落盘。",
    "- `in_progress`: 至少一个 developer 席位已认领；仍可追加新的 idle 子计划席位。",
    "",
  ].join("\n");
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function allRoleEntries(task: Task): Array<{ role: string; name: string; brief: string; entry: any }> {
  const entries: Array<{ role: string; name: string; brief: string; entry: any }> = [];
  for (const role of ROLE_KEYS) {
    for (const [name, entry] of Object.entries(task[role] ?? {})) {
      entries.push({ role, name, brief: String((entry as any).brief ?? ""), entry });
    }
  }
  return entries;
}

function hasRoleForSubPlan(task: Task, subPlans: string[]): boolean {
  const entries = allRoleEntries(task);
  if (entries.length === 0 || subPlans.length === 0) return false;
  if (entries.length === 1 && subPlans.length === 1) return true;

  return subPlans.some((filename) => {
    const slug = normalizeKey(filename.replace(/^plan-/i, "").replace(/\.md$/i, ""));
    if (!slug) return false;
    return entries.some((entry) => {
      const roleKey = normalizeKey(`${entry.name} ${entry.brief}`);
      return roleKey.includes(slug) || slug.includes(roleKey);
    });
  });
}

export function validatePromotableTask(task: Task): string[] {
  const errs: string[] = [];
  const inspection = inspectPlan(task);

  if (!inspection.planExists) {
    errs.push(`plan 文件不存在: ${task.plan}`);
  } else if (!inspection.planHasContent) {
    errs.push(`plan 文件为空: ${task.plan}`);
  }

  const roleEntries = allRoleEntries(task);
  if (roleEntries.length === 0) {
    errs.push("所有 role 条目为空,需至少一个条目");
  }

  if (inspection.isMultiPlan) {
    const missingLinkedSubPlans = inspection.linkedSubPlans.filter(
      (filename) => !existsSync(resolve(dirname(inspection.planAbs), filename)),
    );
    for (const filename of missingLinkedSubPlans) {
      errs.push(`plan.md 引用了不存在的子计划: ./${filename}`);
    }
    if (inspection.actualSubPlans.length === 0) {
      errs.push("multi-plan 需要至少一个实际 plan-*.md 子计划");
    } else if (!hasRoleForSubPlan(task, inspection.actualSubPlans)) {
      errs.push("multi-plan 需要至少一个与 plan-*.md 子计划对应的 role 条目");
    }
  }

  for (const { role, name, brief } of roleEntries) {
    if (!brief.trim()) {
      errs.push(`${role}.${name}.brief 未填写`);
    }
  }

  return errs;
}

export async function assertLinkedSubPlansExist(srcPlan: string, targetDir: string): Promise<string[]> {
  const content = readFileSync(srcPlan, "utf-8");
  const linkedSubPlans = extractLinkedSubPlans(content);
  for (const filename of linkedSubPlans) {
    const src = resolve(dirname(srcPlan), filename);
    if (!existsSync(src)) {
      throw new Error(`plan.md 引用了不存在的子计划: ./${filename}`);
    }
  }
  for (const filename of linkedSubPlans) {
    const target = resolve(targetDir, filename);
    if (existsSync(target) && statSync(target).isDirectory()) {
      throw new Error(`子计划目标路径是目录: ${target}`);
    }
  }
  return linkedSubPlans;
}
