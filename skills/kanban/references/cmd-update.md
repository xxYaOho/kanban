# /kanban --update

更新任务的**人工领域字段**。支持交互式(默认)和快捷两种形态。

## 命令形态

```bash
/kanban --update <uuid>                                       # 交互式
/kanban --update <uuid> <path>=<value> [<path>=<value>...]    # 快捷,跳过交互
```

UUID 允许短前缀(≥6),多候选时列表让用户选。

## 字段白名单

**允许改**:
- 顶层:`status` / `description` / `plan` / `draft` / `repo`
- role 条目 brief:`developer.<name>.brief` / `reviewer.<name>.brief` / `test.<name>.brief` / `integrator.<name>.brief`
- 新增/删除整个 role 条目(仅当 `status ∈ { draft, planned }`;`in_progress` 及之后不允许结构性改动)

**拒绝改**(Agent 领域,由角色 Agent 工作中自动写):
- `<role>.<name>.status / review / report / attempt / error / blocked_on / pass / fail / merged / conflicts`
- `created` / `updated`(系统维护)

**越权拒绝话术**:
```
❌ 字段 `developer.dev-serve.status` 属于 Agent 自主字段,/kanban --update 不允许修改。
   如需强制重置:
   (a) 让该席位的 Agent 重新运行并自检(推荐)
   (b) 人工直接编辑 ~/.kanban/kanban.json(会破坏一致性,自行承担)
```

## 席位重评估

当 `--update` 涉及 `plan` 字段变更（替换或指向新 plan 文件），且任务 status ∈ {draft, planned} 时，在写入前执行席位重评估。

### 触发条件

- `plan` 字段在本次 update 中被修改
- 任务尚未进入 `in_progress`（即 status 为 draft 或 planned）
- 不触发：任务已在执行中（席位已被认领，结构调整会丢失状态）

### 流程

1. 模型读取新 plan.md 内容
2. 按 `cmd-new.md` 中的「预分配席位智能分析」4 条件（C1-C4）重新评估当前席位是否仍适配新 plan
3. 比对结果：

**席位仍适配** → 不中断流程，diff 底部追加：

```
ℹ️ 席位重评估：当前席位仍适配新 plan
```

**席位需调整** → AskUserQuestion：

```
⚠️ 计划调整后席位可能不再合适：
当前: <N> dev（<现有席位列表>）
建议: <调整建议>（合并为 1 个席位 / 拆分为 <M> dev / 调整 blocked_on 链）

(a) 重新调整席位
(b) 保留当前席位不变
(c) 暂不处理，仅保存 plan
```

4. 用户选择处理：
   - 选 (a) → 使用 `del:` + `add:` ops 重建席位结构：
     - 删除所有旧 developer 条目（仅在均 idle + attempt=0 时可操作）
     - 按新分析结果创建 developer 条目（add op 支持 `blocked_on`）
     - 非 developer 角色（reviewer/test/integrator）不受影响
   - 选 (b) → 仅保存 plan，席位不变，diff 底部追加 `⚠️ 席位未随 plan 调整，可能存在不匹配`
   - 选 (c) → 仅保存 plan，不调整席位，不追加警告

### 席位已被认领时的处理

若任务已有 developer 条目被认领（attempt > 0 或 status ≠ idle），无法通过 del/add 重建。此时：

```
⚠️ 以下席位已被认领，无法结构调整：
  - <seat-name>（status=<status>, attempt=<attempt>）
建议：等待当前工作完成后再调整，或手动处理。

(a) 仅保存 plan，暂不调整席位
(b) 取消本次 update
```

### 实现说明

席位调整通过标准的 `del:` + `add:` ops 实现，无需新增脚本逻辑。`add` op 的 JSON 格式：

```
add:developer:<name>:{"brief":"...","blocked_on":"<other-dev-name>"}
```

`blocked_on` 字段可选，仅在 developer 角色且存在依赖时传入。

## 交互式流程

### 0. 定位任务(uuid 解析)

遵循 SKILL.md 中的 **uuid 解析公共流程**:

1. 用户提供 uuid → 直接使用(支持短前缀 ≥6)
2. 未提供 uuid → 读 kanban.json,筛选活跃任务(`status ∈ {in_progress, planned, draft}`)
3. 恰好一个活跃任务 → 静默选中,执行结果中注明"已自动选择任务 <short>"
4. 多个活跃任务 → AskUserQuestion 列出候选(`<short> — <description> [<status>]`),排序:`in_progress` 优先 > `planned` > `draft`
5. 无活跃任务 → 提示"当前无活跃任务",建议 `--new` 创建或 `--update <uuid> status=planned` 激活
6. 终态任务(`done / archived / aborted`)不列入候选

定位成功后,回显当前人工字段(status / description / plan / draft / repo / 所有 role 条目的 brief)。

### 1. 问改哪些

AskUserQuestion 多选:
- status
- description
- plan(plan.md 路径)
- draft(原始需求草稿路径,可选)
- repo
- `<role>.<name>.brief`(按现有 role 条目展开)
- 新增 role 条目
- 删除 role 条目
- 完成(保存并退出)

### 2. 对每个选中项采集新值

**统一容错原则**:先探测上下文 → 有候选则提供选择 → 无候选则给出格式提示 → 输入后校验 → 校验失败重新询问。快捷形态(`path=value`)跳过所有容错,校验失败直接报错。

#### `status`

基于当前 status 推荐 1~3 个合理转移目标:

| 当前 status | 推荐转移                    |
| ----------- | --------------------------- |
| draft       | planned, aborted            |
| planned     | in_progress, aborted        |
| in_progress | done, aborted               |
| done        | archived                    |
| archived    | 无推荐,提示"已是终态"       |
| aborted     | 无推荐,提示"已是终态"       |

示例话术:
```
当前 status: draft,合理的目标:
(a) planned  — plan 已定稿,准备开工
(b) aborted  — 放弃此任务

请选择,或输入其他合法值(draft / in_progress / done / archived / aborted):
```

#### `plan`

**探测上下文**:
1. 检查对话中是否出现过文件路径(特别是 `.md` 文件)
2. 检查当前 worktree 目录下是否存在 `.md` 文件
3. 检查任务对应的 `~/.kanban/<repo>/<uuid>/` 目录下是否存在 `.md` 文件

**有候选**:列出文件供选择,允许自由输入:
```
发现以下可能的 plan 文件:
(a) ~/.kanban/wave/019d9b9f.../plan.md  (已存在,当前值)
(b) ~/docs/requirements-v2.md
(c) 手动输入路径
```

**无候选**:给出格式提示:
```
plan 需要指向一个实际存在的 .md 文件。格式示例:
  ~/.kanban/<repo>/<uuid>/plan.md
  ~/docs/my-plan.md
请输入 plan 文件路径:
```

**校验**:输入后检查文件是否存在且非空字节。不存在则提示并重新询问。

> plan 变更确认后，触发「席位重评估」流程（见上方章节），在 diff 展示前完成。

#### `description`

**Agent 生成候选**:基于以下信息生成一条候选 description:
- plan.md 内容(摘要关键词)
- repo 名称
- 当前席位的 brief 描述

候选要求:
- 不超过 80 字符
- 包含具体技术关键词
- 避免模糊用语(如"优化""改进""调整")

**采集**:
```
基于任务上下文,建议 description:
  "CLI v0.14 命令解析器重构与 RBAC 中间件集成"

(a) 采纳建议
(b) 自行输入
(c) 保持不变
```

选 (b) 后接自由文本输入。选 (c) 跳过此字段。

#### `repo`

**列出候选**:扫描 `~/.kanban/` 下的目录名(排除 `.locks` 和 `archive`):
```
已有 repo 目录:
(a) wave
(b) superconductor
(c) 手动输入新名称
```

选择已有名称则直接使用;选 (c) 接受自由输入。新 repo 名称仅做目录命名校验(合法字符、非空)。

#### `<role>.<name>.brief`

**回显当前值**,基于 plan.md 内容推荐 1~2 个候选 brief(复用 `--role` 的 context 追问逻辑),加自由输入:

```
当前 brief: "重构命令解析器"

根据 plan 内容,建议:
(a) "重构命令解析器并补充单元测试"
(b) "实现 RBAC 中间件集成"
(c) 保持不变
(d) 手动输入
```

#### 新增 role 条目

依次采集:
1. **role**:developer / reviewer / test / integrator
2. **name**:非空、与同 role 下现有条目不重名
3. **brief**:非空,同上方 `<role>.<name>.brief` 逻辑(无当前值可回显,跳过"保持不变"选项)

#### 删除 role 条目

从现有 role 条目列表多选。被选中的条目将在 diff 阶段确认后删除。

### 3. diff 展示 + 二次确认

```
以下改动将提交,确认?
  status:               draft → planned
  description:          "CLI v0.14 优化(草案)" → "CLI v0.14 优化"
  draft:                null → "~/docs/requirements-v1.md"
  + developer.dev-serve: { brief: "重构命令解析器" }
  - developer.obsolete
```
用户选 `确认` / `取消` / `回到修改`。

### 4. 写入

`withKanbanLock` 原子提交,刷新 `updated`。

### 5. `status → planned` 的提升校验

在锁内、写前执行:
- `plan` 文件存在且非空字节
- 至少一个 role 条目
- 每个 role 条目有非空 `brief`

不满足则拒绝写入,列出缺失项:
```
❌ 无法提升 status → planned,缺失以下项:
  - plan 文件为空: ~/.kanban/wave/019d9b9f.../plan.md
  - developer.dev-serve.brief 未填写
```

## 快捷形态

```
/kanban --update 019d9b9f description="CLI v0.14 优化" status=planned
/kanban --update 019d9b9f draft="~/docs/requirements-v1.md"
/kanban --update 019d9b9f developer.dev-serve.brief="重构命令解析器"
/kanban --update 019d9b9f add:reviewer:review:'{"brief":"统一 review"}'
/kanban --update 019d9b9f del:developer:obsolete
```

**语法规则**:
- `<path>=<value>`:设置(path 在白名单)
- `add:<role>:<name>:<json>`:新增 role 条目(value 是 JSON 对象,至少含 `brief`)
- `del:<role>:<name>`:删除 role 条目
- value 有空格时用引号;JSON 用单引号包外层
- 多个操作**原子提交**,任一非法则全部不生效

**容错豁免**:快捷形态跳过所有交互式容错(候选推荐、上下文探测),校验失败直接报错,不重新询问。

## 实现脚本

```bash
bun run $SCRIPTS/update-task.ts <uuid> <op>...
```

`<op>` 格式:
- `set:<path>=<value>`
- `add:<role>:<name>:<json>`
- `del:<role>:<name>`

Agent 负责把交互式选择翻译成这些 op,再调脚本。

## 删除 role 条目的注意事项

- 删除 `status=idle, attempt=0` 的条目是安全的——这是未被认领的预分配席位，无工作历史
- 删除 `status` 非 idle 或 `attempt > 0` 的条目会丢失该 worktree 的工作历史（report、review 等文件不会被删除，但 kanban 中的状态追踪会断裂）
- 若目的是将预分配席位映射到真实 cwd，优先使用 `/kanban --role` 的认领机制，而非先删后建

## 撤销

**不支持**。每次提交前的 diff + 二次确认已足够防误操作。如需恢复历史,建议 `cd ~/.kanban && git init` 用 git 管理状态文件。

## 汇报模板

```
✅ 任务 019d9b9f 已更新
变更:
  status:               draft → planned
  + developer.dev-serve: { brief: "..." }
当前 status: planned,可以在 dev-serve worktree 启动 Claude。
```
