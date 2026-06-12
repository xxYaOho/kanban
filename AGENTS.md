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
- Agent 字段更新走 `scripts/agent-write.ts`；人工领域字段更新走 `scripts/update-task.ts`。
- 修改状态机、query JSON、standby、clear、锁或报告流转时，必须跑 `bun run typecheck` 和 `bun run test`。
- 只改和当前任务直接相关的文件。不要顺手扩 CLI surface、重命名角色或重写协议结构。
- 文档默认用中文，保持正式、直接、克制；文档中不使用 Emoji。

## 看板

这个模块记录维护 `skill-kanban` 时的快速启动信息。它不是 `/kanban` 数据源；真实任务状态仍以代码、reference、测试和 git 历史为准。

### 最近迭代

- reviewer / tester 履职规范已加强：review 必须覆盖 plan 对齐、代码健康、测试风险；tester 必须维护 `test-cases-<NN>.md`，并用 `tester.<name>.case_document` 记录测试用例文档。
- `frontmatter-templates.md` 正在从完整模板压缩为字段合同：保留所有 kind 的文件名、frontmatter 字段、枚举和正文段落；实际正文优先使用 `assets/report-skeletons/*.md`。
- `role-integrator.md` 正在修正文档一致性：不要写不存在的 `integration` 字段，也不要把 integrator 置为不存在的 `blocked` 状态；异常路径记录自身 `conflicts` / `error` 并保持合法状态。
- `query.ts` 尾部 JSON 已作为 reviewer、tester、integrator 承接决策的机器接口。
- `tester` 是 canonical role；`test` 只保留为 legacy alias。
- `developer.done` 是 tester pass 后的完成态，不阻塞后续 tester 判断。
- `--standby` 已实现为 Human 显式开启的前台等待控制器，不是后台 daemon。
- developer `follow_issue` 的 standby 触发已支持遍历多个未见 open issue。
- `/kanban --clear` 只归档 `~/.kanban` 数据；真实 git worktree 清理属于 integrator/main 收尾职责。

### 遗留关注

- 继续前先跑 `git status --short` 和 `git diff --stat` 确认真实未提交范围；不要依赖本文记录的旧状态。
- 压缩文档时不能删除 runtime 合同：字段白名单、状态机、脚本调用、frontmatter 字段、报告文件名、standby trigger/fingerprint 语义必须保留。
- `frontmatter-templates.md` 不能只变成 skeleton 指针；`plan-review`、`issue`、`error-note` 没有 skeleton，必须保留字段与正文结构合同。
- 修改 `standby-trigger.ts` 时，同时检查 `standby-wait.ts`、`standby-resolve.ts` 和 `regression-test.ts`。
- 修改 tester 完成语义时，同时检查 `cmd-query.md`、`data-model.md`、`role-test.md`、`README.md` 和 query JSON 字段。
- 修改 clear 或集成收尾边界时，确认没有把真实 git worktree 清理塞进 `/kanban --clear`。
- 修改角色文档时，优先复用 `shared-delivery-contract.md`，避免在 reviewer、tester、integrator 手册中重复整套 checklist。

### 下次优先看

```bash
git log --oneline -8
git status --short
git diff --stat
sed -n '1,220p' skills/kanban/SKILL.md
sed -n '1,220p' skills/kanban/references/frontmatter-templates.md
sed -n '110,145p' skills/kanban/references/role-integrator.md
sed -n '1,220p' skills/kanban/references/data-model.md
bun run skills/kanban/scripts/help.ts
```
