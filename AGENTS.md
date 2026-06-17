# skill_kanban Agent Instructions

## 项目定位

这个仓库维护 `skill-kanban`：一个用于多 Agent、多 git worktree 协作的本地看板协议。

本仓库本身不是 `/kanban` 的业务使用方。维护时不要把 `AGENTS.md` 写成 `/kanban` 使用手册；它只记录进入仓库后的维护入口、边界和当前状态。

## 工作方式

开始任务前先了解当前状态：

```bash
sc worktree status --json
git status --short
rg --files
```

如果任务涉及 `/kanban` 行为、角色承接、thread 状态、standby、clear 或报告流转，先读真实脚本和 reference，不要只凭 README 或记忆判断。

常用入口：

- 协议入口：`skills/kanban/SKILL.md`
- 命令与角色细节：`skills/kanban/references/*.md`
- 数据模型：`skills/kanban/references/data-model.md`
- 共享交付合同：`skills/kanban/references/shared-delivery-contract.md`
- 执行脚本：`skills/kanban/scripts/*.ts`
- 用户向概览：`README.md`

所有 TypeScript 脚本用 Bun 执行：

```bash
bun run skills/kanban/scripts/<script>.ts [args...]
```

常用验证：

```bash
cd skills/kanban
bun install
bun run typecheck
bun run test
bun run help
```

## 维护边界

- 协议真源在 `skills/kanban/SKILL.md` 和 `references/`；不要复制出第二份完整协议。
- 保持 TypeScript strict mode 和 ESM 风格。
- 写入 kanban 状态必须走现有脚本和锁；不要直接手改 `~/.kanban/kanban.json`。
- Agent 字段更新走 `scripts/agent-write.ts` 或 `scripts/action-write.ts` guarded action；人工领域字段更新走 `scripts/update-task.ts`。
- 修改状态机、query JSON、standby、clear、锁或报告流转时，必须跑 `bun run typecheck` 和 `bun run test`。
- 只改和当前任务直接相关的文件。不要顺手扩 CLI surface、重命名角色或重写协议结构。
- 文档默认用中文，保持正式、直接、克制；文档中不使用 Emoji。

## 看板 Handoff

只记录维护入口,不是 `/kanban` 协议手册。超过 3 条就压缩,只保留最新事实。

- 版本: `v0.1.0` 是 origin baseline；`v0.2.0` 是已合入 main 的 vNext loop model；版本真源只用 git tag。
- vNext: `owner`、developer `self-review`、optional reviewer gate、owner closeout 已落地；reviewer 不再默认必经。
- Benchmark: 当前 case 在 `benchmarks/case_replica-blenderhunt/`；归档在 `benchmarks/archives/`；摘要见 `benchmarks/benchmark-archive-report-20260617.md`。

### 下次启动

```bash
git log --oneline -8
git status --short
git diff --stat
sed -n '1,220p' skills/kanban/SKILL.md
bun run skills/kanban/scripts/help.ts
```
