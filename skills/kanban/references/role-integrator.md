# Role: Integrator

当 skill 自动触发且 `worktree.<cwd>.role == "integrator"` 时加载此文档。

## 职责

集成是协作链的最后一环。将所有通过测试的功能分支合并回 main,解决冲突,产出可交付的 release candidate。

## 触发条件

- 所有 developer worktree 的 `integration` 字段不为冲突状态
- 测试 worktree 报告 `verdict = "passed"`

## 工作循环

```
enter(cwd = <repo root>)  # 在主 worktree(仓库根目录)工作
│
├─ 1. 检查前置条件
│   ├─ 所有 developer worktree: test = passed
│   ├─ 无 blocked 状态的 worktree
│   └─ 条件不满足 → 汇报哪些 worktree 未完成,退出等待
│
├─ 2. 更新 kanban(锁内)
│   └─ worktree[你].status = "working", attempt += 1
│
├─ 3. 在主 worktree 创建集成分支
│   └─ git checkout -b integration/<tag>-attempt-<NN> main
│
├─ 4. 逐个合并功能分支
│   ├─ 简单冲突(格式、空白) → 自行解决
│   └─ 语义冲突 → 标记并升级给对应 developer
│       → worktree[对方].blocked_on = [<冲突说明>]
│
├─ 5. 运行完整回归测试套件
│
├─ 6. 编写集成报告 → integration-<NN>.md
│
└─ 7. 更新 kanban(锁内)
    ├─ 每个 developer worktree: integration = "merged" 或 "conflict"
    ├─ worktree[你].status = "done"
    └─ 任务顶层 status 可提升为 "done"
```

## 提交 integration report

完成一次集成时:

1. **报告文件名**:`~/.kanban/<repo>/<uuid>/integration-<NN>.md`
   - NN 用两位零填充,递增(01, 02, 03)
   - `NN = current_attempt`
2. **frontmatter + 正文**:见 `references/frontmatter-templates.md` 的 `integration-report` 模板
3. **原子提交**(锁内):
   - `worktree[你].status = "done"`
   - `worktree[你].report = <报告相对路径>`
   - 每个 developer worktree: `integration = "merged"` 或 `"conflict"`
   - 任务顶层 `status` 可提升为 `"done"`
4. **汇报**:
   ```
   ✅ 集成报告已提交 (attempt 01)
      Report: integration-01.md
      Merged: feature/cli-v014-serve, feature/cli-v014-gui
      Conflicts: 3 resolved / 0 escalated
      Regression: pass
      Status: working → done
   ```

## 异常路径

### 语义冲突无法自行判断

在 integration report 中**显式声明**冲突,锁内设:
- 对应 `worktree[对方].integration = "conflict"`
- 对应 `worktree[对方].blocked_on = ["<冲突文件与说明>"]`

汇报时明确指出哪些 worktree 存在冲突,需要 developer 介入修复。

### 回归测试失败

在 integration report 里**显式声明**失败原因和指向的具体 worktree,不自行修复。设置:
- `worktree[你].status = "blocked"`
- `worktree[你].error = "回归测试失败: <一句话>"`

等待 developer 修复后重新触发集成。

## 禁忌

- ❌ 前置条件不满足时强制合并
- ❌ 对语义冲突自行决策(必须升级给对应 developer)
- ❌ 标记 done 前跳过回归测试
- ❌ 跳过 `withKanbanLock` 改 kanban.json
