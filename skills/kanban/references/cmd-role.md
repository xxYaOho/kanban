# /kanban --role

当前 worktree 自注册入口。在 cd 进某个 worktree 后,就地声明角色与职责,写入 kanban。

## 命令形态

```bash
/kanban --role developer "负责前端模块的 RBAC 实现"
/kanban --role reviewer
/kanban --role test "本轮只跑 boundary 和 security"
```

- `<role>` 必填位置参数:`developer` / `reviewer` / `test`
- `<context>` 可选:对应 `worktree.<name>.action`,即这个 worktree 要做什么

## 执行流程

### 1. 解析 role

**合法值**:直接进入下一步。

**非法值**:不硬拒绝,用 AskUserQuestion 追问:

```
角色 `dev` 不存在(你是想选 developer 吗?)。请选择一个合法角色:
(a) developer — 实现分配的任务
(b) reviewer  — 审查 developer 交付
(c) test      — 全面测试
(d) 取消本次注册
```

- 有高置信前缀/编辑距离匹配时,在话术里点名猜测
- 用户选 (d) → 中止,kanban 不被修改

### 2. 定位任务

`worktreeName = basename(pwd)`,按优先级:

1. **已注册保护**:若 `task.worktree[worktreeName]` 在某任务中已存在 → 走冲突处理(见下)
2. **唯一活跃任务**:`status ∈ { planned, in_progress, draft }` 中恰好只有一个 → 直接使用
3. **多个活跃任务**:AskUserQuestion 列出 `<short-uuid> — <description>` 让用户选(draft 任务也出现在候选里)
4. **无活跃任务**:报错并提示:
   ```
   ❌ 没有活跃任务。请先:
     /kanban --new          # 创建任务
     /kanban --update <uuid> status=planned  # 激活草案
   ```

### 3. 采集 action

**有 `<context>`**:直接作为 action 写入,不追问。

**无 `<context>`**:AskUserQuestion,基于 plan.md 内容推荐 2~3 个可能的 action:

```
当前 worktree 尚未明确职责。根据 plan 推测,可能是:
(a) 重构命令解析器
(b) 实现 RBAC 中间件
(c) 其他(请说明)
```

选 (c) 后接一轮自由文本输入。用户放弃或输入空 → 中止注册,kanban 不被修改。**action 不允许为空或占位符**。

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

### 6. 注册后行为

注册完成后**不自动进入工作状态**。打印确认信息后提示下一步:

```
✅ dev-serve 已注册 [developer]
Task:   019d9b9f (CLI v0.14 优化)
Action: 重构命令解析器
Status: idle

下一步:重新启动 Claude(或在当前会话继续),auto-trigger 将自动识别身份并进入工作模式。
```

若 plan.md 存在,附上 outline 的第一个匹配节标题作为定位提示:
```
Plan 对应节: ## 命令解析器重构
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
