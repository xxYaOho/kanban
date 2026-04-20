# /kanban --role

当前 worktree 自注册入口。在 cd 进某个 worktree 后,就地声明角色与职责,写入 kanban。

## 命令形态

```bash
/kanban --role developer "负责前端模块的 RBAC 实现"
/kanban --role reviewer
/kanban --role test "本轮只跑 boundary 和 security"
/kanban --role integrator
```

- `<role>` 必填位置参数:`developer` / `reviewer` / `test` / `integrator`
- `<context>` 可选:对应 `worktree.<name>.action`,即这个 worktree 要做什么

## 执行流程

### 1. 解析 role

**合法值**:直接进入下一步。

**非法值**:不硬拒绝,用 AskUserQuestion 追问:

```
角色 `dev` 不存在(你是想选 developer 吗?)。请选择一个合法角色:
(a) developer  — 实现分配的任务
(b) reviewer   — 审查 developer 交付
(c) test       — 全面测试
(d) integrator — 合并分支,产出 release candidate
(e) 取消本次注册
```

- 有高置信前缀/编辑距离匹配时,在话术里点名猜测
- 用户选 (e) → 中止,kanban 不被修改

### 2. 定位任务

`worktreeName = basename(pwd)`,复用 SKILL.md 中的 **uuid 解析公共流程**:

1. 用户通过参数提供 uuid → 直接使用(支持短前缀 ≥6)
2. 未提供 uuid → 按"uuid 解析公共流程"中的活跃任务筛选与候选逻辑执行
3. 已注册保护:若 `task.worktree[worktreeName]` 在某任务中已存在 → 走冲突处理(见步骤 4)

> 不在本文档内重复 uuid 解析细节,以 SKILL.md 的"uuid 解析公共流程"为准。

### 3. 采集 action

**有 `<context>`**:直接作为 action 写入,不追问。

**无 `<context>`**:AskUserQuestion,提供 plan 推断建议与默认 action:

```
当前 worktree 尚未明确职责。请选择:
(a) 重构命令解析器                  (来自 plan)
(b) 实现 RBAC 中间件                (来自 plan)
(c) 使用默认描述:独立完成 plan 中分配的全部任务(全栈开发,含测试)
(d) 其他(请说明)
```

各角色默认 action:

| 角色          | 默认 action                                                          |
| ------------- | -------------------------------------------------------------------- |
| `developer`   | 独立完成 plan 中分配的全部任务(全栈开发,含测试)                     |
| `reviewer`    | 审查所有 developer 的交付,确保代码质量与 plan 一致                  |
| `test`        | 执行全面测试(security / boundary / performance / integration)        |
| `integrator`  | 合并所有 feature 分支到主干,解决冲突,产出 release candidate         |

- 选项 (a)(b) 由 plan.md 内容推断生成
- 选 (d) 后接一轮自由文本输入
- 用户放弃或输入空 → 中止注册,kanban 不被修改
- **action 不允许为空或占位符**

### 4. 冲突处理

**已有条目是同角色**:幂等处理,仅更新 action(若提供了新 context),其他字段不变:
```
⚠️  worktree dev-serve 已注册为 developer,本次刷新了 action。
```

**已有条目是不同角色**:拒绝操作:
```
❌ worktree dev-serve 已注册为 reviewer,跨角色切换请走:
   /kanban --update <uuid> worktree.dev-serve.role=developer
```

### 5. 写入

`withKanbanLock` 一次性写入:

| 字段         | 值                        |
| ------------ | ------------------------- |
| `role`       | 来自参数                  |
| `action`     | `<context>` 或追问结果    |
| `status`     | `"idle"`                  |
| `attempt`    | `0`                       |
| `report`     | `null`                    |
| `review`     | `null`                    |
| `test`       | `null`                    |
| `error`      | `null`                    |
| `blocked_on` | `null`                    |

若任务 `status == "draft"`,注册后**不自动提升**到 planned,保持 draft。

### 6. 工作准备

注册完成后不自动进入工作状态,而是根据角色扫描当前任务状态,报告就绪情况并给出下一步建议。Agent 只报告状态和建议,由人决定是否执行。

#### developer

1. 读 plan.md,找到与 action 匹配的节
2. 检查 `blocked_on` 字段:
   - 为空 → `✅ 可以开工,建议:读 plan → 开发 → 提交报告`
   - 有值 → `⚠️ 被 <worktree> 阻塞,需等待其完成后方可开工`

#### reviewer

1. 扫描当前任务下所有 worktree,找 `status == "waiting_review"` 的条目
2. 有待审项 → 列出清单:`📝 待审: dev-serve (重构命令解析器), dev-api (RBAC 中间件)`
3. 无待审项 → `ℹ️ 当前无待审任务,等待 developer 提交`

#### test

1. 检查当前任务下所有 developer worktree 是否已 `review_approved`
2. 全部通过 → `✅ 所有 developer 交付已通过审查,可以开始测试`
3. 有未完成项 → `⚠️ 以下 worktree 尚未通过审查: dev-serve, dev-api`

#### integrator

1. 检查当前任务下所有 worktree 是否已测试通过(对应角色的 test 流程完成)
2. 全部就绪 → `✅ 所有分支已就绪,可以开始合并`
3. 有未完成项 → `⚠️ 以下 worktree 尚未完成测试: dev-serve, dev-api`

#### 通用输出格式

```
✅ <worktree> 已注册 [<role>]
Task:   <short-uuid> (<description>)
Action: <action>
Status: idle

<工作准备报告>

Plan 对应节: ## <匹配节标题>    (若 plan.md 存在)
```

## 与 `--update` 的关系

`--role` 是**首次注册**的快捷入口,只操作当前 cwd 对应的 worktree 条目。注册完成后的任何字段修改(换 action、换 role)都走 `--update`。

## 实现脚本

```bash
bun run ~/.claude/skills/kanban/scripts/role.ts \
  --worktree <name> \
  --role <role> \
  --action <action> \
  --uuid <uuid>
```

Agent 层负责交互采集(role 校验、action 追问、任务定位),脚本只接收已决策的参数并执行写入。
