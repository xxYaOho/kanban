我先把被截断的部分读完,确保掌握完整讨论上下文,然后再输出整合方案。

# Kanban v3.2 最终方案

已读完完整讨论脉络。你的三个反馈落到方案上有三处具体改动:

1. **运行时**:敲定 **Bun**(下文说明理由)
2. **`/kanban --new`**:新增 `--from-file` 和 `--draft` 两种模式,kanban 数据模型引入 `draft` 状态
3. **`/kanban --update`**:保留原命令名,改为**交互式问询**为主,`path=value` 语法作为快捷形式保留

下面是整合后的完整方案。

---

## 一、v3.2 相对 v3.1 的变化总览

| 维度            | v3.1              | v3.2                                                   |
| --------------- | ----------------- | ------------------------------------------------------ |
| 运行时          | 隐含 Node         | **Bun**(原生 TS + 无编译 + 快启动)                     |
| `--new` 输入源  | 只从对话抽取      | 三种:**对话 / `--from-file` / `--draft`**              |
| 数据模型        | 无草案状态        | `status` 新增 `"draft"` 值,允许 `plan`/`worktree` 为空 |
| `--update` 交互 | 强制 `path=value` | **交互式为主**(AskUserQuestion),`path=value` 作快捷    |
| `--update` 范围 | 只改"人工字段"    | 保持不变,边界更严                                      |
| 命令入口        | 同 v3.1           | 同 v3.1                                                |

---

## 二、运行时决策:Bun

**为什么不是 Node / npx / bunx**:

- **Node + npx tsx**:每次启动都要拉编译器,冷启动 200ms+,频繁写锁下累积可观
- **bunx**:单次运行方便,但不管理项目依赖,每次从缓存解包
- **Bun**:既是运行时(原生跑 `.ts`,无需 tsc/tsx),又是包管理器(`bun install` 快过 npm 10×),冷启动 <50ms

**落地方式**:

```bash
# ~/.kanban/ 下
bun install                    # 安装 proper-lockfile / jsonc-parser
bun run scripts/xxx.ts         # 执行 Skill 里的 TS 脚本
```

**未安装兜底**:`--init` 首步检查 `which bun`,缺失则打印一次性安装指令并中止:

```
❌ Bun 未安装。请先执行:
   curl -fsSL https://bun.sh/install | bash
然后重新运行 /kanban --init
```

不做降级分支(降级逻辑会污染后续所有脚本的 shebang,得不偿失)。

---

## 三、目录结构(v3.2)

```plaintext
~/.kanban/                              # 数据层(独立生命周期)
├── kanban.jsonc
├── .locks/
├── package.json                        # { "dependencies": { "proper-lockfile": "...", "jsonc-parser": "..." } }
├── bun.lockb                           # Bun 锁文件
├── node_modules/
├── wave/<repo>/<uuid>/
│   ├── plan.md
│   ├── report-<worktree>-<NN>.md
│   ├── review-<worktree>-<NN>.md
│   ├── test-<NN>.md
│   └── *-error.md
├── archive/YYYY-MM/
└── README.md

~/.claude/
├── commands/
│   └── kanban.md                       # /kanban 分派入口
└── skills/
    └── kanban/
        ├── SKILL.md                    # 主协议
        ├── references/
        │   ├── cmd-init.md
        │   ├── cmd-new.md              # ← 本轮扩写(三种模式)
        │   ├── cmd-update.md           # ← 本轮扩写(交互式)
        │   ├── cmd-query.md
        │   ├── role-developer.md
        │   ├── role-reviewer.md
        │   ├── role-test.md
        │   └── frontmatter-templates.md
        ├── scripts/                    # 所有 .ts 用 bun 执行
        │   ├── kanban-lock.ts
        │   ├── kanban-io.ts
        │   ├── paths.ts
        │   ├── init.ts                 # --init 实现(TS 化,告别 bash)
        │   ├── new-task.ts             # --new 核心逻辑
        │   ├── update-task.ts          # --update 核心逻辑
        │   ├── query.ts                # --uuid 查询
        │   └── status.ts               # 全局 overview
        └── assets/
            ├── kanban-template.jsonc   # {}
            ├── task-template.jsonc     # 完整任务骨架
            ├── draft-template.jsonc    # 草案骨架(本轮新增)
            └── report-skeletons/
                ├── dev-report.md
                ├── review.md
                └── test-report.md
```

两个变化:

- 脚本统一 `.ts`(Bun 原生支持),去掉 bash 混用
- `assets/` 多一份 `draft-template.jsonc`

---

## 四、数据模型:引入 `draft`

### 任务顶层 status 扩展

```
status ∈ { draft, planned, in_progress, done, archived, aborted }
             ↑ 新增
```

**状态语义**:

- `draft`:占位中,`plan` 可能为空/不完整,`worktree` 可能为空字典
- `planned`:plan 已定稿,worktree 已分配,可以开工
- `in_progress`:任意 worktree 已进入 `working`
- 后三者同 v3

### 草案任务的最小有效形态

```jsonc
{
  "019d9b9f-7c0c-7e44-8f37-8a77ce1edcf7": {
    "status": "draft",
    "repo": "wave",
    "description": "CLI v0.14 优化(草案)",
    "plan": "~/.kanban/wave/wave/019d9b9f.../plan.md", // 可能是占位文件
    "created": "2026-04-18T14:00:00Z",
    "worktree": {}, // 允许为空
  },
}
```

**约束放松**(仅 `draft` 状态下):

- `plan` 允许指向空文件或简短笔记
- `worktree` 允许为 `{}`
- 一旦 `status` 转为 `planned`,必须满足:`plan` 非空 + `worktree` 至少一个条目 + 每个 worktree 字段齐全

**校验点**:`/kanban --update <uuid> status=planned` 触发此校验,不满足则拒绝并提示缺失项。

---

## 五、四个子命令完整规格

### 5.1 `/kanban --init`(更新为 Bun)

`references/cmd-init.md` 要点:

1. 检查 `which bun` → 缺失则提示安装并中止
2. 检查 `~/.kanban/` 是否存在 → 存在则问 `(a)跳过 / (b)重置 / (c)取消`
3. `mkdir -p ~/.kanban/{.locks,wave,archive}`
4. 拷贝 `assets/kanban-template.jsonc` → `~/.kanban/kanban.jsonc`(内容 `{}`)
5. 写入 `~/.kanban/package.json`:
   ```json
   {
     "name": "kanban-data",
     "private": true,
     "type": "module",
     "dependencies": {
       "proper-lockfile": "^4.1.2",
       "jsonc-parser": "^3.3.1"
     }
   }
   ```
6. `cd ~/.kanban && bun install`
7. 写 `README.md`(目录说明 + 禁改 `.locks/` 警告)
8. 汇报 `✅ Kanban 已初始化,Bun 依赖就位`

**scripts/init.ts 骨架**:

```typescript
#!/usr/bin/env bun
import { $ } from "bun";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

const ROOT = join(homedir(), ".kanban");

async function main() {
  // 1. Bun check — 如果这脚本能跑,Bun 已在
  // 2. 目录存在性处理
  if (existsSync(ROOT)) {
    console.log(`⚠️  ${ROOT} 已存在,请人工决定是否重置`);
    process.exit(2);
  }
  // 3~6. 建目录、写模板、装依赖
  await mkdir(join(ROOT, ".locks"), { recursive: true });
  await mkdir(join(ROOT, "wave"), { recursive: true });
  await mkdir(join(ROOT, "archive"), { recursive: true });
  await writeFile(join(ROOT, "kanban.jsonc"), "{}\n");
  await writeFile(join(ROOT, "package.json"), JSON.stringify(pkg, null, 2));
  await $`cd ${ROOT} && bun install`.quiet();
  console.log("✅ Kanban 已初始化");
}
main();
```

### 5.2 `/kanban --new`(三种模式)

**命令形态**:

```bash
/kanban --new                               # 模式自动判别
/kanban --new --from-file <path>            # 从文件导入
/kanban --new --draft                       # 创建草案
/kanban --new --draft --from-file <path>    # 草案 + 种子文件
```

**模式判别树**(Agent 逻辑,见 `references/cmd-new.md`):

```
/kanban --new 被触发
├─ 有 --from-file <path>?
│   ├─ 是 → 【模式 B: 文件导入】
│   │       - 读取文件内容作为 plan
│   │       - 若同时有 --draft → status=draft
│   │       - 否则 → 尝试从文件解析出 worktree 划分,失败则回退草案
│   └─ 否 → 继续判别
├─ 有 --draft?
│   ├─ 是 → 【模式 C: 空草案】
│   │       - 不要求 plan 内容
│   │       - 问用户 description,其他字段先空
│   └─ 否 → 【模式 A: 对话抽取】
│           - 扫描当前对话上下文,尝试抽取 plan
│           - 无法抽取 → 用 AskUserQuestion 提供三选项:
│             (a) 我帮你从对话中整理一份(继续抽取)
│             (b) 你指定一个 plan 文件路径 → 转 --from-file
│             (c) 创建空草案 → 转 --draft
```

**三种模式的产物对比**:

| 模式       | `status`             | `plan` 文件             | `worktree`            | 典型场景               |
| ---------- | -------------------- | ----------------------- | --------------------- | ---------------------- |
| A 对话抽取 | `planned`            | 从对话整理出的完整 plan | 按对话里的划分填充    | 已在 CC 里讨论完       |
| B 文件导入 | `planned` 或 `draft` | 拷贝自 `--from-file`    | 尝试解析,解析不出则空 | 从 Cursor/其他工具转入 |
| C 空草案   | `draft`              | 空文件/占位标题         | `{}`                  | 先占 UUID,后续完善     |

**`scripts/new-task.ts` 关键片段**:

```typescript
import { withKanbanLock } from "./kanban-lock";
import { waveDir, kanbanFile } from "./paths";
import { mkdir, writeFile, readFile, copyFile } from "fs/promises";
import { randomUUID } from "crypto";
import { basename, resolve } from "path";
import { $ } from "bun";

interface NewTaskInput {
  mode: "extract" | "fromFile" | "draft";
  description: string;
  repo: string;
  planPath?: string; // --from-file 用
  planContent?: string; // extract 模式用
  worktrees?: Record<string, { role: string; action: string }>;
  draft?: boolean;
}

export async function newTask(input: NewTaskInput) {
  const uuid = randomUUID().toLowerCase();
  const short = uuid.slice(0, 8);
  const dir = waveDir(input.repo, uuid);
  await mkdir(dir, { recursive: true });

  const planTarget = `${dir}/plan.md`;
  if (input.mode === "fromFile" && input.planPath) {
    await copyFile(resolve(input.planPath), planTarget);
  } else if (input.mode === "extract" && input.planContent) {
    await writeFile(planTarget, input.planContent);
  } else {
    // draft 模式:占位
    await writeFile(
      planTarget,
      `# ${input.description}

(草案,待完善)\n`,
    );
  }

  const isDraft = input.draft || input.mode === "draft";
  await withKanbanLock(async (kanban) => {
    if (kanban[uuid]) throw new Error("UUID 冲突");
    kanban[uuid] = {
      status: isDraft ? "draft" : "planned",
      repo: input.repo,
      description: input.description,
      plan: planTarget,
      created: new Date().toISOString(),
      worktree: input.worktrees ?? {},
    };
  });
  return {
    uuid,
    short,
    dir,
    planTarget,
    status: isDraft ? "draft" : "planned",
  };
}
```

**Agent 汇报**(按模式区分):

模式 A / B(正式任务):

```
✅ 任务已创建 [planned]
UUID: 019d9b9f-7c0c-...
Short: 019d9b9f
Plan: ~/.kanban/wave/wave/019d9b9f.../plan.md
Worktrees: dev-serve, dev-gui
下一步:在对应 worktree 启动 Claude。
```

模式 C(草案):

```
📝 草案任务已创建 [draft]
UUID: 019d9b9f-...
Short: 019d9b9f
Plan 占位: ~/.kanban/wave/wave/019d9b9f.../plan.md
提示:
  - 在对话中继续梳理 plan,随后:
    /kanban --update 019d9b9f     # 逐项完善
  - 完善后执行:
    /kanban --update 019d9b9f status=planned
```

### 5.3 `/kanban --update`(交互式)

**命令形态(两路都支持)**:

```bash
/kanban --update <uuid>                              # 交互式:Agent 发起 questions
/kanban --update <uuid> <path>=<value> [<path>=<value>...]  # 快捷:直接写入
```

**交互式流程**(`references/cmd-update.md`):

```
1. Agent 根据 <uuid> 定位任务,裸读当前全部人工字段并回显
2. 用 AskUserQuestion 提出多选:
   「你想更新哪项?(可多选)」
     - status
     - description
     - plan (指向文件路径)
     - repo
     - worktree.<name>.role
     - worktree.<name>.action
     - 新增 worktree 条目
     - 删除 worktree 条目
     - 完成(保存并退出)
3. 对每个选中项,二次 AskUserQuestion 获取新值:
   - status → 枚举选择(draft/planned/in_progress/done/archived/aborted)
   - description → 文本输入(附当前值)
   - plan → 文本输入(校验文件存在)
   - worktree.<name>.role → 枚举(developer/reviewer/test)
   - 新增 worktree → 问 name / role / action 三个字段
4. 全部采集完后 diff 展示给用户:
   「以下改动,确认提交?
      status: draft → planned
      + worktree.dev-serve = { role:developer, action:"..." }」
5. 确认后 withKanbanLock 原子写入,汇报 diff
6. 若 status 改为 planned,触发前置校验(plan 非空 + worktree 非空 + 字段齐全);不通过则拒绝并列出缺失项
```

**快捷形式**(跳过交互):

```
/kanban --update 019d9b9f description="CLI v0.14 优化" status=planned
/kanban --update 019d9b9f worktree.dev-serve.role=developer worktree.dev-serve.action="重构命令解析器"
```

**字段白名单**(与 v3.1 一致,不变):

- 允许:`status / description / plan / repo / worktree.<name>.role / worktree.<name>.action`
- 允许新增/删除 `worktree.<name>` 整个条目(仅 `status=draft` 或 `planned` 时)
- 禁止:`worktree.<name>.status/review/test/report/attempt/error/blocked_on`(这些是 Agent 领域)

**越权拒绝话术**:

```
❌ 字段 `worktree.dev-serve.status` 属于 Agent 自主字段,/kanban --update 不允许修改。
   如需强制重置:
   (a) 让该 worktree 的 Agent 重新运行并自检
   (b) 人工直接编辑 ~/.kanban/kanban.jsonc(需承担破坏一致性的风险)
```

**`scripts/update-task.ts` 核心签名**:

```typescript
export const EDITABLE_PATHS = new Set([
  "status",
  "description",
  "plan",
  "repo",
]);
export const EDITABLE_WORKTREE_PATHS = new Set(["role", "action"]);

export async function updateTask(
  uuid: string,
  ops: Array<{ path: string; value: unknown }>,
  opts: { allowCreateWorktree?: boolean; allowDeleteWorktree?: boolean } = {},
) {
  // 1. path 白名单校验
  // 2. withKanbanLock 内执行 set/delete
  // 3. 若 status → planned,调 validatePromotable(task) 校验
  // 4. 返回 diff
}
```

### 5.4 `/kanban --uuid <uuid>`

与 v3.1 完全一致,不赘述。新增一点:**若任务 `status=draft`,视图顶部加一条横幅**:

```
📋 Task 019d9b9f  [DRAFT]  (CLI v0.14 优化)
⚠️  此任务仍在草案阶段,worktree 可能未分配。
    完善后运行:/kanban --update 019d9b9f status=planned

Repo:    wave
Plan:    ~/.kanban/wave/wave/019d9b9f.../plan.md
...
```

---

## 六、`/kanban` 命令入口(更新)

`~/.claude/commands/kanban.md`:

```markdown
---
description: Kanban 多 Agent 协作命令(init / new / update / uuid)
---

你是 kanban 命令分派器。先激活 skill `kanban`,再根据参数分派。

**参数**: $ARGUMENTS

**分派表**:
| 形态 | 行为 | 加载 reference |
|---|---|---|
| `--init` | 初始化 `~/.kanban/`(检测 Bun) | references/cmd-init.md |
| `--new` | 从对话抽取创建任务 | references/cmd-new.md |
| `--new --from-file <path>` | 从文件导入创建任务 | references/cmd-new.md |
| `--new --draft [--from-file <path>]` | 创建草案任务 | references/cmd-new.md |
| `--update <uuid>` | 交互式更新 | references/cmd-update.md |
| `--update <uuid> <path>=<value>...` | 快捷更新 | references/cmd-update.md |
| `--uuid <uuid>` | 站在当前 worktree 视角查询 | references/cmd-query.md |
| 空 / `--help` | 输出用法 | 内置 |

**通用规则**:

- UUID 支持短前缀(≥6 字符)匹配,多候选时列出请求用户选择
- 所有 TS 脚本通过 `bun run ~/.claude/skills/kanban/scripts/<x>.ts` 执行
- 写操作必须走 `scripts/kanban-lock.ts` 的 `withKanbanLock()`
- 每个子命令执行后简明汇报结果,不要冗长复述
```

---

## 七、SKILL.md 主协议(增量调整)

只列本轮需要改动的段落:

````markdown
## 触发路径

1. 命令触发:用户输入 `/kanban --xxx`,由命令文件分派
2. 自动触发:cwd 是某 worktree + `~/.kanban/kanban.jsonc` 中存在对应条目
3. **草案处理**:自动触发时若 task.status == "draft",Agent **不进入工作模式**,而是提示:
   「当前任务仍是草案,请先运行 `/kanban --update <uuid>` 完善,并将 status 提升为 planned」

## 运行时

所有 TS 脚本用 Bun:

```bash
bun run ~/.claude/skills/kanban/scripts/<script>.ts [args...]
```

## 身份识别(仅非 draft 任务)

1. worktreeName = basename(pwd)
2. 遍历 kanban,找到 task 满足:
   - task.worktree[worktreeName] 存在
   - task.status ∈ { planned, in_progress }
3. 多匹配 → 取 updated 最新;仍多 → AskUserQuestion
4. role = task.worktree[worktreeName].role
5. 加载 references/role-<role>.md

## ⛔ 禁止清单(新增三条)

- ❌ 在 status=draft 的任务上自动进入工作模式
- ❌ 通过 /kanban --update 修改 worktree.<name>.{status,review,test,report,attempt,error,blocked_on}
- ❌ 把 draft 任务的 plan 文件当作权威来源直接开工(draft plan 可能不完整)
````

---

## 八、命令 × 锁 × 权限速查表(v3.2)

| 命令                | 运行时                | 读                  | 写                         | 锁     | 典型触发者         |
| ------------------- | --------------------- | ------------------- | -------------------------- | ------ | ------------------ |
| `--init`            | bun + shell           | -                   | 建目录/文件                | 不需要 | 人(首次)           |
| `--new`(对话)       | bun                   | readKanban          | withKanbanLock             | ✅     | 人(计划后)         |
| `--new --from-file` | bun                   | readKanban + 读文件 | withKanbanLock + 拷贝文件  | ✅     | 人(从外部工具转入) |
| `--new --draft`     | bun                   | readKanban          | withKanbanLock             | ✅     | 人(占位)           |
| `--update`(交互)    | bun + AskUserQuestion | readKanban          | withKanbanLock             | ✅     | 人(维护)           |
| `--update`(快捷)    | bun                   | readKanban          | withKanbanLock             | ✅     | 人(批处理)         |
| `--uuid`            | bun                   | readKanban          | -                          | 不需要 | 人(查询)           |
| 角色工作(自动)      | bun                   | readKanban          | withKanbanLock(改自己字段) | ✅     | Agent              |

---

## 九、落地清单(更新版)

### Phase 0 — 环境准备(10 分钟)

- [ ] 确认/安装 Bun:`curl -fsSL https://bun.sh/install | bash`
- [ ] `mkdir -p ~/.claude/skills/kanban/{references,scripts,assets/report-skeletons}`
- [ ] `mkdir -p ~/.claude/commands`

### Phase 1 — 命令入口 + `--init` + `--new` 最小版(1 天)

- [ ] 写 `~/.claude/commands/kanban.md` 分派入口
- [ ] 写 `SKILL.md`(含运行时说明、触发路径、禁止清单)
- [ ] 写 `references/cmd-init.md`、`scripts/init.ts`、`assets/kanban-template.jsonc`
- [ ] 写 `references/cmd-new.md`、`scripts/new-task.ts`、`assets/task-template.jsonc`、`assets/draft-template.jsonc`
- [ ] 跑 `/kanban --init`,看目录齐全 + `bun install` 成功
- [ ] 跑 `/kanban --new --draft` 创建一个草案任务,验证 jsonc 结构
- [ ] 跑 `/kanban --new --from-file path/to/plan.md` 验证文件导入

### Phase 2 — 并发安全 + `--update` + `--uuid`(1 天)

- [ ] 写 `scripts/kanban-lock.ts`、`scripts/kanban-io.ts`、`scripts/paths.ts`
- [ ] 写 `references/cmd-update.md` + `scripts/update-task.ts`(含白名单 + AskUserQuestion 流程)
- [ ] 写 `references/cmd-query.md` + `scripts/query.ts`
- [ ] 验证 `/kanban --update <uuid>` 交互式能把 draft → planned(触发校验)
- [ ] 并发启动 2 个 terminal 同时 `--update` 同一任务,验证锁生效

### Phase 3 — 角色协作链路(1 天)

- [ ] 写 `references/role-developer.md` / `role-reviewer.md` / `role-test.md`
- [ ] 写 `references/frontmatter-templates.md` 集中 4 个模板
- [ ] 写 `assets/report-skeletons/*`
- [ ] 手建 1 个完整任务(2 个 dev + 1 个 reviewer + 1 个 test),跑通 dev → review(reject)→ dev → review(approve)→ test → done

### Phase 4 — 运维(按需)

- [ ] `scripts/status.ts` 全局概览
- [ ] `scripts/archive-done.ts` 完成任务归档
- [ ] 真需要时再评估 cron/watcher(默认不做)

---

## 十、三个待你确认的隐性决策(我替你定了,可回滚)

| 决策点                                                                 | 我的选择                             | 理由                                                            | 如何回滚                               |
| ---------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- | -------------------------------------- |
| `draft` 是顶层 `status` 值还是独立 `draft: bool` 字段                  | **status 值**(少一个字段,状态机完整) | 避免 `status=planned, draft=true` 的矛盾态                      | 改模型时只需迁移一次                   |
| `--new --from-file` 的 plan 文件是**拷贝**进 kanban 还是**引用**原路径 | **拷贝**                             | 避免外部文件被删/改后 kanban plan 字段失效;原文件保留给用户参考 | 改为软链接即可                         |
| `--update` 交互式是否支持**撤销上一步**                                | **不支持**                           | 加入撤销需要状态栈,复杂度上升明显;一次 diff 确认够用            | 真需要时在 update-task.ts 里加 history |

---

**v3.2 特点**:把 v3.1 的 95% 保留,针对"草案先入 / 文件导入 / 交互更新"三个实际痛点补齐,Bun 让 TS 脚本体验接近 shell 的轻量感。**Phase 1 一天能跑通,单任务草案化流转立刻生效。**

切到 Agent mode,我可以直接在你机器上创建这批文件(包括 `SKILL.md`、4 个 cmd-\*.md、核心 scripts 骨架)。
