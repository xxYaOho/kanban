#!/usr/bin/env bun
/**
 * /kanban --init 实现
 *
 * 参数:
 *   --reset    在 ~/.kanban 已存在时直接覆盖重建(需要 Agent 层二次确认后传入)
 *   --skip     在 ~/.kanban 已存在时什么都不做,直接退出 0
 *   --migrate  在 ~/.kanban 已存在时执行旧格式迁移
 *
 * 默认行为(无上面三个 flag 时):若目录已存在,exit 3 报告迁移需求或 exit 2 让 Agent 层问用户。
 */
import { $ } from "bun";
import { existsSync } from "fs";
import { mkdir, writeFile, rm, rename, readdir, unlink, readFile as readFileAsync } from "fs/promises";
import { KANBAN_ROOT, KANBAN_FILE, LOCKS_DIR, ARCHIVE_ROOT } from "./paths";
import { nowIso } from "./kanban-io";
import { join, basename } from "path";

const MIN_BUN_VERSION = "1.1.0";

function semverGte(a: string, b: string): boolean {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return true;
}

const CLAUDE_MD = `# ~/.kanban/ 操作规范

此目录是 kanban skill 的数据层，由 skill 脚本维护。
直接在此目录启动 Claude 时，请遵守以下约定。

## 禁止操作
- 不要修改或删除 \`.locks/\` 下的文件（会破坏并发锁）
- 不要直接写入 \`kanban.json\`（必须通过 skill 脚本，走文件锁）
- 不要删除 \`<repo>/<uuid>/\` 下的任何历史报告文件

## 紧急修复流程
1. 确认当前无 Agent 正在运行（避免写冲突）
2. 手动编辑 \`kanban.json\`
3. 用以下命令验证格式：
   bun run ~/.claude/skills/kanban/scripts/query.ts <uuid>

## 归档规范
- 完成的任务目录移到 \`archive/YYYY-MM/\` 下
- \`kanban.json\` 中对应条目 status 改为 \`archived\`

## 字段权限提醒
以下字段由 Agent 自主维护，人工不应覆盖：
- worktree.*.status / attempt / report / review / test / error / blocked_on / integration
以下字段允许人工修改（等同于 /kanban --update）：
- status / description / plan / repo / worktree.*.role / worktree.*.action
`;

function parseArgs(argv: string[]) {
  return {
    reset: argv.includes("--reset"),
    skip: argv.includes("--skip"),
    migrate: argv.includes("--migrate"),
  };
}

function checkDependency(): void {
  const nmPath = join(import.meta.dir, "..", "node_modules", "proper-lockfile");
  if (!existsSync(nmPath)) {
    console.error("❌ 未检测到 proper-lockfile 依赖。");
    console.error("请在 skills/kanban/ 目录下安装依赖后再运行:");
    console.error("  cd ~/.claude/skills/kanban && bun install");
    process.exit(1);
  }
}

function detectMigrationNeeds(): string[] {
  const needs: string[] = [];
  if (existsSync(join(KANBAN_ROOT, "kanban.jsonc"))) {
    needs.push("kanban.jsonc → kanban.json");
  }
  if (existsSync(join(KANBAN_ROOT, "wave"))) {
    needs.push("wave/<repo>/ → <repo>/");
  }
  for (const file of ["package.json", "bun.lock", "bun.lockb"]) {
    if (existsSync(join(KANBAN_ROOT, file))) {
      needs.push(`清理 ${file}`);
      break;
    }
  }
  if (existsSync(join(KANBAN_ROOT, "node_modules"))) {
    needs.push("清理 node_modules/");
  }
  return needs;
}

async function runMigration(): Promise<void> {
  const oldFile = join(KANBAN_ROOT, "kanban.jsonc");

  // 1. Rename kanban.jsonc → kanban.json
  if (existsSync(oldFile) && !existsSync(KANBAN_FILE)) {
    await rename(oldFile, KANBAN_FILE);
    console.log("  迁移:kanban.jsonc → kanban.json");
  }

  // 2. Move wave/<repo>/ → <repo>/
  const waveDir = join(KANBAN_ROOT, "wave");
  if (existsSync(waveDir)) {
    const entries = await readdir(waveDir);
    for (const entry of entries) {
      const src = join(waveDir, entry);
      const dst = join(KANBAN_ROOT, entry);
      if (!existsSync(dst)) {
        await rename(src, dst);
        console.log(`  迁移:wave/${entry} → ${entry}/`);
      }
    }
    const remaining = await readdir(waveDir);
    if (remaining.length === 0) {
      await rm(waveDir, { recursive: true });
      console.log("  迁移:移除空的 wave/ 目录");
    }
  }

  // 3. Update stored paths in kanban.json
  if (existsSync(KANBAN_FILE)) {
    const raw = await readFileAsync(KANBAN_FILE, "utf-8");
    const data = JSON.parse(raw);
    let dirty = false;
    for (const task of Object.values(data) as Record<string, any>[]) {
      if (task.plan && typeof task.plan === "string" && task.plan.includes("~/.kanban/wave/")) {
        task.plan = task.plan.replace("~/.kanban/wave/", "~/.kanban/");
        dirty = true;
      }
      for (const wt of Object.values(task.worktree ?? {}) as Record<string, any>[]) {
        for (const field of ["report", "review", "test"] as const) {
          if (wt[field] && typeof wt[field] === "string" && wt[field].includes("~/.kanban/wave/")) {
            wt[field] = wt[field].replace("~/.kanban/wave/", "~/.kanban/");
            dirty = true;
          }
        }
      }
    }
    if (dirty) {
      await writeFile(KANBAN_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
      console.log("  迁移:更新任务路径(wave/ 前缀已移除)");
    }
  }

  // 4. Remove npm artifacts from data layer
  for (const file of ["package.json", "bun.lock", "bun.lockb"]) {
    const p = join(KANBAN_ROOT, file);
    if (existsSync(p)) {
      await unlink(p);
      console.log(`  清理:删除 ${file}`);
    }
  }
  const nmDir = join(KANBAN_ROOT, "node_modules");
  if (existsSync(nmDir)) {
    await rm(nmDir, { recursive: true, force: true });
    console.log("  清理:删除 node_modules/");
  }

  // 5. 补写 CLAUDE.md（已存在则跳过）
  const claudeMdPath = join(KANBAN_ROOT, "CLAUDE.md");
  if (!existsSync(claudeMdPath)) {
    await writeFile(claudeMdPath, CLAUDE_MD, "utf-8");
    console.log("  补写:CLAUDE.md");
  }
}

async function main() {
  // Bun 版本检查
  if (!semverGte(Bun.version, MIN_BUN_VERSION)) {
    console.error(`⚠️  当前 Bun 版本 ${Bun.version} 过旧，最低要求 ${MIN_BUN_VERSION}。`);
    console.error("请升级：bun upgrade");
    process.exit(1);
  }

  // 依赖检查
  checkDependency();

  const args = parseArgs(process.argv.slice(2));

  if (existsSync(KANBAN_ROOT)) {
    const migrationNeeds = detectMigrationNeeds();

    if (args.migrate) {
      if (migrationNeeds.length === 0) {
        console.log("✅ 数据层已是最新格式,无需迁移");
        process.exit(0);
      }
      await runMigration();
      console.log("✅ 迁移完成");
      process.exit(0);
    }

    if (args.skip) {
      console.log(`⚠️  ${KANBAN_ROOT} 已存在,跳过`);
      process.exit(0);
    }

    if (args.reset) {
      const ts = nowIso().slice(0, 19).replace(/[:T]/g, "-");
      const backupName = `kanban-backup-${ts}.tar.gz`;
      const backupPath = join(KANBAN_ROOT, "..", backupName);
      const parentDir = join(KANBAN_ROOT, "..");
      const backupResult = await $`tar -czf ${backupPath} -C ${parentDir} ${basename(KANBAN_ROOT)}`.quiet().nothrow();
      if (backupResult.exitCode === 0) {
        console.log(`📦 备份已创建: ${backupPath}`);
      } else {
        console.error(`⚠️  备份失败,继续重置: ${backupResult.stderr.toString()}`);
      }
      await rm(KANBAN_ROOT, { recursive: true, force: true });
    } else if (migrationNeeds.length > 0) {
      // 检测到旧格式,exit 3 让 Agent 层提供迁移选项
      console.log(
        JSON.stringify(
          {
            needsMigration: true,
            items: migrationNeeds,
            hint: "请传 --migrate(迁移)或 --reset(重建)",
          },
          null,
          2,
        ),
      );
      process.exit(3);
    } else {
      console.error(`⚠️  ${KANBAN_ROOT} 已存在。请传 --reset(重建)或 --skip(跳过)。`);
      process.exit(2);
    }
  }

  // 建目录(.locks 和 archive;repo 目录按需由 new-task.ts 创建)
  await mkdir(LOCKS_DIR, { recursive: true });
  await mkdir(ARCHIVE_ROOT, { recursive: true });

  // 写模板文件
  await writeFile(KANBAN_FILE, "{}\n", "utf-8");
  await writeFile(join(KANBAN_ROOT, "CLAUDE.md"), CLAUDE_MD, "utf-8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        root: KANBAN_ROOT,
        file: KANBAN_FILE,
        message: "Kanban 已初始化",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("❌ init 失败:", err?.message ?? err);
  process.exit(1);
});
