#!/usr/bin/env bun
/**
 * /kanban --init 实现
 *
 * 参数:
 *   --reset   在 ~/.kanban 已存在时直接覆盖重建(需要 Agent 层二次确认后传入)
 *   --skip    在 ~/.kanban 已存在时什么都不做,直接退出 0
 *
 * 默认行为(无上面两个 flag 时):若目录已存在,exit 2 让 Agent 层问用户。
 */
import { $ } from "bun";
import { existsSync } from "fs";
import { mkdir, writeFile, rm } from "fs/promises";
import { KANBAN_ROOT, KANBAN_FILE, LOCKS_DIR, ARCHIVE_ROOT } from "./paths";
import { join, basename } from "path";

const PKG = {
  name: "kanban-data",
  private: true,
  type: "module",
  dependencies: {
    "proper-lockfile": "^4.1.2",
    "jsonc-parser": "^3.3.1",
  },
};

const README = `# ~/.kanban/

Kanban 多 Agent 协作的数据层。由 \`kanban\` skill 维护。

## 结构
- \`kanban.jsonc\` — 状态总表(所有任务 + worktree 字段)
- \`.locks/\` — ⚠️ 建议性文件锁,**不要手动修改或删除**,否则会破坏并发安全
- \`wave/<repo>/<uuid>/\` — 每个任务的工作目录(plan/报告/review/test),按需创建
- \`archive/YYYY-MM/\` — 归档的完成任务
- \`package.json\` / \`bun.lockb\` / \`node_modules/\` — 脚本运行时依赖

## 维护建议
- 用 git 管理此目录可得到状态历史:\`cd ~/.kanban && git init\`
- 手动编辑 \`kanban.jsonc\` 会绕过锁与 schema,**仅用于紧急修复**
- 恢复依赖:\`cd ~/.kanban && bun install\`
`;

function parseArgs(argv: string[]) {
  return {
    reset: argv.includes("--reset"),
    skip: argv.includes("--skip"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (existsSync(KANBAN_ROOT)) {
    if (args.skip) {
      console.log(`⚠️  ${KANBAN_ROOT} 已存在,跳过`);
      process.exit(0);
    }
    if (args.reset) {
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
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
    } else {
      console.error(`⚠️  ${KANBAN_ROOT} 已存在。请传 --reset(重建)或 --skip(跳过)。`);
      process.exit(2);
    }
  }

  // 建目录(.locks 和 archive;wave/ 按需由 new-task.ts 创建)
  await mkdir(LOCKS_DIR, { recursive: true });
  await mkdir(ARCHIVE_ROOT, { recursive: true });

  // 写模板文件
  await writeFile(KANBAN_FILE, "{}\n", "utf-8");
  await writeFile(join(KANBAN_ROOT, "package.json"), JSON.stringify(PKG, null, 2) + "\n", "utf-8");
  await writeFile(join(KANBAN_ROOT, "README.md"), README, "utf-8");

  // 装依赖
  const result = await $`cd ${KANBAN_ROOT} && bun install`.quiet().nothrow();
  if (result.exitCode !== 0) {
    console.error("❌ bun install 失败:");
    console.error(result.stderr.toString());
    process.exit(1);
  }

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
