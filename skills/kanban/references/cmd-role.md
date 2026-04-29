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
3. 已注册保护:若已有条目的 `cwd === worktreeName`（或 key === worktreeName 作为兼容旧数据回退）→ 走冲突处理(见步骤 4)

> 不在本文档内重复 uuid 解析细节,以 SKILL.md 的"uuid 解析公共流程"为准。

### 2.5 席位匹配（仅当无条目匹配当前 cwd 时）

当前 worktree 的 cwd 尚未在任务中注册时，检查是否有可认领的预分配席位。认领后 key 保持预分配名称不变，`cwd` 字段记录当前目录名。

**读取空置席位**：调用 `query.ts --uuid <uuid>`，从输出的 JSON 块中获取 `idleStations[<role>]`。

**扫描条件**（`query.ts` 内部实现）：遍历 `task.worktree`，筛选满足以下全部条件的条目：
- `role` === 用户传入的 `<role>`
- `status` === `"idle"`
- `attempt` === `0`

**分支处理**：

**无空置席位** → 跳过本步骤，进入步骤 3（正常创建新条目）。

**有 1 个空置席位** → AskUserQuestion：

```
检测到预分配席位 "<stationName>" (<role> — <action>)，是否认领？
(a) 认领该席位
(b) 不认领，创建独立的新角色
```

- 用户选 (a) → 脚本传 `--claim-from <stationName>`，继续步骤 3 采集 action（预分配的 action 作为默认建议）
- 用户选 (b) → 不传 `--claim-from`，继续步骤 3

**有 2 个空置席位** → AskUserQuestion：

```
当前任务有以下空置的 <role> 席位：
(a) <stationName1> — <action1>
(b) <stationName2> — <action2>
(c) 不认领，创建独立的新角色
```

**有 3 个及以上空置席位** → 按优先级展示前 3，注明总数：

```
当前任务有 <N> 个空置的 <role> 席位，展示优先级前 3：
(a) <stationName1> — <action1>
(b) <stationName2> — <action2>
(c) <stationName3> — <action3>
(d) 不认领，创建独立的新角色
```

席位按 `task.worktree` 中的顺序排列（`--new` 创建时先定义的优先级更高），Agent 层按 `idleStations` 数组原序读取即可。

- 用户选某个席位 → 脚本传对应的 `--claim-from`
- 用户选"不认领" → 不传 `--claim-from`，正常创建

**名称相同时的处理**：若 `worktreeName` 恰好等于某个预分配席位名，无需认领——直接走正常的"同角色幂等"路径即可，不传 `--claim-from`。

**认领时的 action 处理**：
- 若用户在命令中提供了 `<context>`（如 `/kanban --role developer "负责音频模块"`），使用用户提供的 action
- 若未提供 `<context>`，将预分配席位的原始 action 作为默认建议呈现在步骤 3 的 AskUserQuestion 中

**认领失败恢复**：若 `role.ts` 返回席位不存在/已被认领的错误（TOCTOU 竞争导致），Agent 不应将错误原样展示给用户。应重新调用 `query.ts` 获取最新的空置席位列表：
- 仍有同角色空置席位 → 重新展示候选（同样最多展示前 3）："刚才选择的席位已被其他 Agent 认领，以下是当前可用的席位：..."
- 无空置席位 → 回退到正常创建流程："所有预分配席位已被认领，将为当前 worktree 创建新的角色条目。"

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

**已有条目是同角色**(通过 cwd 匹配):幂等处理,更新 action 和 cwd:
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
| `cwd`        | `basename(pwd)`           |
| `status`     | `"idle"`                  |
| `attempt`    | `0`                       |
| `report`     | `null`                    |
| `review`     | `null`                    |
| `test`       | `null`                    |
| `error`      | `null`                    |
| `blocked_on` | `null`                    |

若任务 `status == "draft"`,注册后**不自动提升**到 planned,保持 draft。

若 role=developer 且 task.status ∈ {planned, in_progress} 且 blocked_on 为空,注册时自动将 worktree.status 设为 `"working"`、attempt 设为 `1`。若此时 task.status 为 `"planned"`,同步提升为 `"in_progress"`。

### 6. 角色自然承接动作

注册完成后,根据角色自动执行下一步。Agent 主动推进,无需 Human 额外指令。

#### developer

自动领取判断(脚本层完成,Agent 层读取输出):

1. 读 plan.md,找到与 action 匹配的节
2. 脚本自动检查条件:
   - task.status ∈ {planned, in_progress} 且 blocked_on 为空 → **自动 working + attempt+1**,task.status 从 planned 提升为 in_progress(若适用)
   - task.status == "draft" → 保持 idle,报告"任务尚在 draft,需先提升到 planned"
   - blocked_on 有值 → 保持 idle,报告阻塞项
3. Agent 根据脚本输出(`autoStarted` / `autoStartReason`)生成报告

#### reviewer

扫描当前任务下所有 worktree,找 `status == "waiting_review"` 的条目:
1. 有待审项 → 列出清单:
   ```
   📝 待审: dev-serve (重构命令解析器), dev-api (RBAC 中间件)
   建议: 选择一个待审项,开始 review 流程
   ```
2. 无待审项 → 保持在 idle:
   ```
   ℹ️ 当前无待审任务,等待 developer 提交
   ```

#### test

检查当前任务下所有 developer worktree 的审查状态:
1. 全部 `review_approved` → `✅ 所有 developer 交付已通过审查,可以开始测试`
2. 有未完成项 → `⚠️ 以下 worktree 尚未通过审查: dev-serve, dev-api`

#### integrator

检查当前任务下所有 worktree 的测试完成状态:
1. 全部就绪 → `✅ 所有分支已就绪,可以开始合并`
2. 有未完成项 → `⚠️ 以下 worktree 尚未完成测试: dev-serve, dev-api`

#### 认领席位时的输出格式

```
✅ <worktree> 已注册 [<role>]（认领自预分配席位 <presetName>）
Task: <short-uuid> (<description>)
Action: <action>
Status: <idle 或 working>

<角色自然承接报告>

Plan 对应节: ## <匹配节标题> (若 plan.md 存在)
```

#### 通用输出格式

```
✅ <worktree> 已注册 [<role>]
Task:   <short-uuid> (<description>)
Action: <action>
Status: <idle 或 working>

<角色自然承接报告>

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
  --uuid <uuid> \
  [--claim-from <presetName>]
```

`--claim-from` 仅当用户在步骤 2.5 选择了认领预分配席位时才传入。

Agent 层负责交互采集(role 校验、action 追问、任务定位),脚本只接收已决策的参数并执行写入。

> **stableKey**：`role.ts` stdout 包含 `stableKey` 字段。认领席位后 Agent 应使用 stableKey
> 作为后续 `agent-write.ts --worktree <stableKey>` 的参数，而非 `basename(pwd)`。
> Path B 自动触发时，SKILL.md 已指示记录 stable key，同理。
