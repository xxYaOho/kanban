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
- worktree:`worktree.<name>.role` / `worktree.<name>.action`
- 新增/删除整个 `worktree.<name>` 条目(仅当 `status ∈ { draft, planned }`;`in_progress` 及之后不允许结构性改动)

**拒绝改**(Agent 领域,由角色 Agent 工作中自动写):
- `worktree.<name>.status / review / test / report / attempt / error / blocked_on`
- `created` / `updated`(系统维护)

**越权拒绝话术**:
```
❌ 字段 `worktree.dev-serve.status` 属于 Agent 自主字段,/kanban --update 不允许修改。
   如需强制重置:
   (a) 让该 worktree 的 Agent 重新运行并自检(推荐)
   (b) 人工直接编辑 ~/.kanban/kanban.jsonc(会破坏一致性,自行承担)
```

## 交互式流程

1. **定位任务**:读取 kanban,按 UUID(或短前缀)找到任务,回显当前人工字段(status / description / plan / draft / repo / 所有 worktree 的 role+action)
2. **问改哪些**(AskUserQuestion 多选):
   - status
   - description
   - plan(plan.md 路径)
   - draft(原始需求草稿路径,可选)
   - repo
   - worktree.\<name\>.role(按现有 worktree 展开)
   - worktree.\<name\>.action
   - 新增 worktree 条目
   - 删除 worktree 条目
   - 完成(保存并退出)
3. **对每个选中项采集新值**:
   - `status` → 枚举选(draft / planned / in_progress / done / archived / aborted)
   - `description` → 文本输入(附当前值作默认)
   - `plan` → 文本输入,输入后脚本校验文件存在
   - `draft` → 文本输入(路径,不校验文件是否存在;输入空字符串则清除为 null)
   - `worktree.<name>.role` → 枚举(developer / reviewer / test)
   - `worktree.<name>.action` → 文本输入
   - **新增 worktree**:依次问 `name`(非空、不重名)/ `role`(枚举)/ `action`(非空)
   - **删除 worktree**:从现有列表多选
4. **diff 展示 + 二次确认**:
   ```
   以下改动将提交,确认?
     status:               draft → planned
     description:          "CLI v0.14 优化(草案)" → "CLI v0.14 优化"
     draft:                null → "~/docs/requirements-v1.md"
     + worktree.dev-serve: { role: developer, action: "重构命令解析器" }
     - worktree.obsolete
   ```
   用户选 `确认` / `取消` / `回到修改`。
5. **写入**:`withKanbanLock` 原子提交,刷新 `updated`
6. **`status → planned` 的提升校验**(在锁内,写前):
   - `plan` 文件存在且非空字节
   - `worktree` 至少一个条目
   - 每个 worktree 有 `role ∈ {developer,reviewer,test}` 和非空 `action`
   不满足则拒绝写入,列出缺失项:
   ```
   ❌ 无法提升 status → planned,缺失以下项:
     - plan 文件为空: ~/.kanban/wave/wave/019d9b9f.../plan.md
     - worktree.dev-serve.action 未填写
   ```

## 快捷形态

```
/kanban --update 019d9b9f description="CLI v0.14 优化" status=planned
/kanban --update 019d9b9f draft="~/docs/requirements-v1.md"
/kanban --update 019d9b9f worktree.dev-serve.role=developer worktree.dev-serve.action="重构命令解析器"
/kanban --update 019d9b9f +worktree.review='{"role":"reviewer","action":"统一 review"}'
/kanban --update 019d9b9f -worktree.obsolete
```

**语法规则**:
- `<path>=<value>`:设置(path 在白名单)
- `+<worktree-path>=<json>`:新增 worktree 条目(value 是 JSON 对象)
- `-<worktree-path>`:删除 worktree 条目
- value 有空格时用引号;JSON 用单引号包外层
- 多个操作**原子提交**,任一非法则全部不生效

## 实现脚本

```bash
bun run ~/.claude/skills/kanban/scripts/update-task.ts <uuid> <op>...
```

`<op>` 格式:
- `set:<path>=<value>`
- `add-worktree:<name>:<json>`
- `del-worktree:<name>`

Agent 负责把交互式选择翻译成这些 op,再调脚本。

## 撤销

**不支持**。每次提交前的 diff + 二次确认已足够防误操作。如需恢复历史,建议 `cd ~/.kanban && git init` 用 git 管理状态文件。

## 汇报模板

```
✅ 任务 019d9b9f 已更新
变更:
  status:               draft → planned
  + worktree.dev-serve: { role: developer, action: "..." }
当前 status: planned,可以在 dev-serve worktree 启动 Claude。
```
