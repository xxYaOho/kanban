#!/usr/bin/env bun
import { existsSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";

type IssueLevel = "error" | "warning";

interface Issue {
  level: IssueLevel;
  path: string;
  message: string;
}

const REQUIRED_FILES = [
  "task-card.md",
  "timeline.md",
  "result.md",
  "metrics.json",
  "artifacts/source-reference/screenshots/home-original-1280x2744.png",
  "artifacts/source-reference/screenshots/detail-original-1280x1200.png",
  "artifacts/screenshots/home-replica-1280x2744.png",
  "artifacts/screenshots/detail-replica-1280x1200.png",
  "artifacts/screenshots/cart-replica-1280x1200.png",
  "artifacts/visual-comparison/home-diff-1280x2744.png",
  "artifacts/visual-comparison/home-side-by-side-1280x2744.png",
  "artifacts/visual-comparison/home-metrics-1280x2744.json",
];

const REQUIRED_DIRS = [
  "artifacts/app",
  "artifacts/source-reference",
  "artifacts/kanban",
  "artifacts/verification/logs",
  "artifacts/screenshots",
  "artifacts/visual-comparison",
];

const VISUAL_PATH_FIELDS: Record<string, string> = {
  "visual.original": "artifacts/source-reference/screenshots/home-original-1280x2744.png",
  "visual.replica": "artifacts/screenshots/home-replica-1280x2744.png",
  "visual.diff": "artifacts/visual-comparison/home-diff-1280x2744.png",
  "visual.side_by_side": "artifacts/visual-comparison/home-side-by-side-1280x2744.png",
};

const METRIC_FIELDS: Record<string, "string" | "number" | "boolean" | "object" | "array" | "nullableBoolean" | "nullableString"> = {
  "schema_version": "number",
  "case": "string",
  "run_id": "string",
  "kanban_version": "string",
  "started_at": "string",
  "finished_at": "string",
  "duration_seconds": "number",
  "workflow": "object",
  "workflow.flow": "string",
  "workflow.developer_count": "number",
  "workflow.tester_attempts": "number",
  "workflow.reviewer_gate_used": "boolean",
  "workflow.issue_opened": "number",
  "workflow.issue_resolved": "number",
  "workflow.self_review_count": "number",
  "workflow.review_report_count": "number",
  "product": "object",
  "product.homepage": "boolean",
  "product.detail_page": "boolean",
  "product.cart": "boolean",
  "product.search_or_filter": "boolean",
  "product.product_count": "number",
  "product.category_count": "number",
  "product.cart_operations_passed": "boolean",
  "verification": "object",
  "verification.install_passed": "nullableBoolean",
  "verification.typecheck_passed": "nullableBoolean",
  "verification.test_passed": "nullableBoolean",
  "verification.build_passed": "nullableBoolean",
  "verification.smoke_passed": "nullableBoolean",
  "verification.start_command": "string",
  "visual": "object",
  "visual.viewport": "string",
  "visual.original": "string",
  "visual.replica": "string",
  "visual.diff": "string",
  "visual.side_by_side": "string",
  "visual.rmse": "nullableString",
  "visual.mae": "nullableString",
  "visual.absolute_error_pixels": "nullableString",
  "visual.psnr": "nullableString",
  "visual.ssim": "nullableString",
  "artifact_counts": "object",
  "artifact_counts.kanban_markdown": "number",
  "artifact_counts.screenshots": "number",
  "artifact_counts.verification_logs": "number",
  "known_limits": "array",
};

function usage(): never {
  console.error("Usage: bun run scripts/validate-run.ts <runs/<run-id>> [--json]");
  process.exit(2);
}

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc: any, key) => acc?.[key], obj as any);
}

function typeOk(value: unknown, type: string): boolean {
  if (type === "array") return Array.isArray(value);
  if (type === "nullableBoolean") return value === null || typeof value === "boolean";
  if (type === "nullableString") return value === null || typeof value === "string";
  if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  return typeof value === type;
}

function add(issues: Issue[], level: IssueLevel, path: string, message: string): void {
  issues.push({ level, path, message });
}

function validatePath(runDir: string, issues: Issue[]): void {
  for (const dir of REQUIRED_DIRS) {
    const full = join(runDir, dir);
    if (!existsSync(full) || !statSync(full).isDirectory()) {
      add(issues, "error", dir, "required directory is missing");
    }
  }
  for (const file of REQUIRED_FILES) {
    const full = join(runDir, file);
    if (!existsSync(full) || !statSync(full).isFile()) {
      add(issues, "error", file, "required file is missing");
    }
  }
}

function validateMetrics(runDir: string, issues: Issue[]): unknown {
  const metricsPath = join(runDir, "metrics.json");
  if (!existsSync(metricsPath)) return null;
  let metrics: unknown;
  try {
    metrics = JSON.parse(readFileSync(metricsPath, "utf-8"));
  } catch (error) {
    add(issues, "error", "metrics.json", `invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  for (const [field, type] of Object.entries(METRIC_FIELDS)) {
    const value = get(metrics, field);
    if (!typeOk(value, type)) {
      add(issues, "error", `metrics.json:${field}`, `expected ${type}, got ${value === null ? "null" : typeof value}`);
    }
  }
  if (get(metrics, "schema_version") !== 1) add(issues, "error", "metrics.json:schema_version", "expected 1");
  if (get(metrics, "case") !== "replica-blenderhunt") add(issues, "error", "metrics.json:case", "expected replica-blenderhunt");
  if (get(metrics, "visual.viewport") !== "1280x2744") add(issues, "warning", "metrics.json:visual.viewport", "default comparison viewport should be 1280x2744");

  const runRoot = resolve(runDir);
  for (const [field, expectedPath] of Object.entries(VISUAL_PATH_FIELDS)) {
    const value = get(metrics, field);
    if (value !== expectedPath) {
      add(issues, "error", `metrics.json:${field}`, `expected fixed path ${expectedPath}, got ${String(value)}`);
      continue;
    }
    const full = join(runDir, value);
    const resolved = resolve(full);
    if (resolved !== runRoot && !resolved.startsWith(`${runRoot}/`)) {
      add(issues, "error", `metrics.json:${field}`, `path escapes run directory: ${value}`);
      continue;
    }
    if (!existsSync(full)) add(issues, "error", `metrics.json:${field}`, `referenced file is missing: ${value}`);
  }
  return metrics;
}

const args = Bun.argv.slice(2);
const runDir = args.find((arg) => !arg.startsWith("-"));
const asJson = args.includes("--json");
if (!runDir) usage();

const issues: Issue[] = [];
if (!existsSync(runDir) || !statSync(runDir).isDirectory()) {
  add(issues, "error", runDir, "run directory is missing");
} else {
  validatePath(runDir, issues);
  validateMetrics(runDir, issues);
}

const errors = issues.filter((issue) => issue.level === "error").length;
const warnings = issues.filter((issue) => issue.level === "warning").length;
const result = {
  ok: errors === 0,
  run_dir: runDir,
  run_dir_relative: relative(process.cwd(), runDir),
  errors,
  warnings,
  issues,
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`${result.ok ? "OK" : "FAIL"} ${runDir} (${errors} errors, ${warnings} warnings)`);
  for (const issue of issues) {
    console.log(`[${issue.level}] ${issue.path}: ${issue.message}`);
  }
}

process.exit(errors === 0 ? 0 : 1);
