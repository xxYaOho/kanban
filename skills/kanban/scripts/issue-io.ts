import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { basename, join } from "path";
import { waveDir } from "./paths";
export type { IssueStatus } from "./protocol";
import type { IssueStatus } from "./protocol";

export interface IssueMeta {
  file: string;
  path: string;
  uuid: string;
  title: string;
  status: IssueStatus | string;
  type: string;
  owner: string;
  created: string;
  updated: string;
  summary: string;
  mtimeMs: number;
}

export function issueArchiveDir(repo: string, taskUuid: string): string {
  return join(waveDir(repo, taskUuid), "archive");
}

export function parseFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end === -1) return {};
  const raw = content.slice(4, end).trim();
  const out: Record<string, string> = {};
  let activeListKey: string | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) {
      const value = match[2].trim();
      out[match[1]] = value.replace(/^"(.*)"$/, "$1");
      activeListKey = value === "" ? match[1] : null;
      continue;
    }
    const listItem = line.match(/^\s*-\s*(.*)$/);
    if (activeListKey && listItem) {
      const value = listItem[1].trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      const current = out[activeListKey];
      out[activeListKey] = current ? `${current},${value}` : value;
    }
  }
  return out;
}

export function extractSummary(content: string): string {
  const match = content.match(/## Summary\s+([\s\S]*?)(?:\n## |\s*$)/);
  if (!match) return "";
  return match[1].trim().replace(/\s+/g, " ");
}

export function listIssues(
  repo: string,
  taskUuid: string,
  options: { status?: IssueStatus } = {},
): IssueMeta[] {
  const dir = waveDir(repo, taskUuid);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => /^issue-[^/\\]+\.md$/i.test(file))
    .map((file) => {
      const path = join(dir, file);
      const content = readFileSync(path, "utf-8");
      const fm = parseFrontmatter(content);
      return {
        file,
        path,
        uuid: fm.uuid ?? "",
        title: fm.title ?? file,
        status: fm.status ?? "open",
        type: fm.type ?? "bug",
        owner: fm.owner ?? "",
        created: fm.created ?? "",
        updated: fm.updated ?? "",
        summary: extractSummary(content),
        mtimeMs: statSync(path).mtimeMs,
      };
    })
    .filter((issue) => !options.status || issue.status === options.status)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export function resolveIssue(
  repo: string,
  taskUuid: string,
  issueRef: string,
): IssueMeta {
  const normalizedRef = basename(issueRef);
  const issues = listIssues(repo, taskUuid);
  const matches = issues.filter((issue) =>
    issue.file === normalizedRef ||
    issue.file.startsWith(normalizedRef) ||
    (!!issue.uuid && issue.uuid.startsWith(issueRef)),
  );
  if (matches.length === 0) {
    throw new Error(`找不到 issue: ${issueRef}`);
  }
  if (matches.length > 1) {
    throw new Error(`issue 引用 "${issueRef}" 匹配多个文件: ${matches.map((i) => i.file).join(", ")}`);
  }
  return matches[0];
}

export function hasRelatedIssueReference(content: string, issueFiles: string[]): boolean {
  const match = content.match(/^related_issue:\s*(.+)$/m);
  if (!match) return false;
  const value = match[1].trim().replace(/^"(.*)"$/, "$1");
  return issueFiles.some((file) => value === file || value.endsWith(`/${file}`));
}
