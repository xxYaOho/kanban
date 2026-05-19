# Role: Integrator

当 skill 自动触发且当前 cwd 匹配 `task.integrator.<name>.cwd` 或条目 key 时加载此文档。

## 职责

集成是协作链的最后一环。将所有通过测试的功能分支合并回 main,解决冲突,产出可交付的 release candidate。

## 触发条件

- 所有 developer 条目已由 test 置为 `done`
- 测试报告 `verdict = "pass"`

## 工作循环

```
enter(cwd = <repo root>)  # 在主 worktree(仓库根目录)工作
│
├─ 1. 检查前置条件
│   ├─ 所有 developer 条目已完成
│   ├─ 无 blocked 状态的条目
│   └─ 条件不满足 → 汇报哪些条目未完成,退出等待
│
├─ 2. 更新 kanban
│   └─ bun run agent-write.ts --thread <uuid> --worktree <你> --set status=working --set attempt=<current+1>
│
├─ 3. 在主 worktree 创建集成分支
│   └─ git checkout -b integration/<tag>-attempt-<NN> main
│
├─ 4. 逐个合并功能分支
│   ├─ 简单冲突(格式、空白) → 自行解决
│   └─ 语义冲突 → 标记并升级给对应 developer
│       → 对方 developer 条目 blocked_on = [<冲突说明>]
│
├─ 5. 运行完整回归测试套件
│
├─ 6. 编写集成报告 → integration-<NN>.md
│
└─ 7. 更新 kanban(锁内)
    ├─ integrator.<你>.merged / conflicts 记录合并结果
    ├─ integrator.<你>.status = "done"
    └─ 任务顶层 status 可提升为 "done"
```

## 提交 integration report

完成一次集成时:

1. **报告文件名**:`~/.kanban/<repo>/<uuid>/integration-<NN>.md`
   - NN 用两位零填充,递增(01, 02, 03)
   - `NN = current_attempt`
2. **frontmatter + 正文**:先读 `references/frontmatter-templates.md` 的 `integration-report` 模板；实际写文件优先使用 `assets/report-skeletons/integration-report.md`
3. **原子提交**(按顺序执行):
   - 自己:
     ```bash
     bun run $SCRIPTS/agent-write.ts \
       --thread <uuid> \
       --worktree <自己> \
       --set status=done \
       --set report=~/.kanban/<repo>/<uuid>/integration-<NN>.md
     ```
   - 若需要记录合并分支或冲突,更新 integrator 自身:
     ```bash
     bun run $SCRIPTS/agent-write.ts \
       --thread <uuid> --worktree <自己> \
       --set merged='["feature/dev-a"]' \
       --set conflicts='[]'
     ```
   - 任务收尾:
     ```bash
     bun run $SCRIPTS/update-task.ts \
       <uuid> set:status=done
     ```
4. **汇报**:
   ```
   ✅ 集成报告已提交 (attempt 01)
      Report: integration-01.md
      Merged: feature/cli-v014-serve, feature/cli-v014-gui
      Conflicts: 3 resolved / 0 escalated
      Regression: pass
      Status: working → done
   ```

## MANDATORY COMPLETION CHECKLIST

---

在对话中报告 integration `done` 之前，**必须**完成以下全部步骤：

1. **验证前置条件**：所有 developer worktree test 通过，无 blocked 状态
2. **创建集成分支并合并**：`git checkout -b integration/<tag>-attempt-<NN> main`，逐个合并功能分支
3. **运行完整回归测试套件**
4. **写 integration report 文件到磁盘**：`~/.kanban/<repo>/<uuid>/integration-<NN>.md`，模板见 `references/frontmatter-templates.md` 的 `integration-report` 模板
5. **原子更新 kanban 状态**（按上方命令执行：更新自身 done / merged / conflicts，更新任务顶层 done）

> 不写 integration report = 集成未发生。所有证据必须在文件系统中。

## 异常路径

### 语义冲突无法自行判断

在 integration report 中**显式声明**冲突,执行:
- ```bash
  bun run $SCRIPTS/agent-write.ts \
    --thread <uuid> \
    --worktree <对方> \
    --set integration=conflict \
    --set blocked_on=<冲突文件与说明>
  ```

汇报时明确指出哪些 worktree 存在冲突,需要 developer 介入修复。

### 回归测试失败

在 integration report 里**显式声明**失败原因和指向的具体 worktree,不自行修复。执行:
- ```bash
  bun run $SCRIPTS/agent-write.ts \
    --thread <uuid> \
    --worktree <你> \
    --set status=blocked \
    --set error=回归测试失败: <一句话>
  ```

等待 developer 修复后重新触发集成。

## 禁忌

- ❌ 前置条件不满足时强制合并
- ❌ 对语义冲突自行决策(必须升级给对应 developer)
- ❌ 标记 done 前跳过回归测试
- ❌ 跳过 `withKanbanLock` 改 kanban.json
