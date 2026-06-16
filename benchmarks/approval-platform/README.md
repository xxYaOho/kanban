# Approval Platform Benchmark

本目录提供 `/kanban` 流程 benchmark 的任务卡和结果模板。它不属于 `skills/kanban` 运行时,只用于人工发起的真实流程对比。

benchmark 不要求故意制造错误。每次运行只记录理想完成路径、时间打点、交付物数量、Human 介入次数和最终审批平台是否可运行。

## 使用方式

1. 选择一个流程:
   - `current`: 当前旧流程。
   - `vnext-default`: `owner -> developer self-review loop -> tester -> owner closeout`。
   - `vnext-mixed`: owner 按需插入 reviewer gate 或 integrator。
2. 复制 `templates/` 到新的 run 目录:

```text
benchmarks/approval-platform/runs/<YYYYMMDD_HHMM>-<flow>/
```

3. 按 `task-card.md` 创建 `/kanban` thread 和 multi-plan。
4. 每个 Agent 在开始和结束关键步骤时,用本机时间写入 `timeline.md`:

```bash
date +%Y-%m-%dT%H:%M:%S%z
```

5. 流程结束后填写 `result.md`,并把可运行项目、kanban artifact 和最终验证输出放入 `artifacts/`。

## Run 目录结构

```text
runs/<YYYYMMDD_HHMM>-<flow>/
  task-card.md
  timeline.md
  result.md
  artifacts/
    app/
    kanban/
    verification/
```

`artifacts/app/` 保存最终可运行审批平台。  
`artifacts/kanban/` 保存 `plan.md`、report、self-review、test-report、owner closeout 等流程文档副本。  
`artifacts/verification/` 保存安装、启动、测试、截图或 smoke 输出。

## 固定任务

每次 benchmark 都实现同一个最小审批平台:

- 审批请求列表和详情。
- `approve`、`reject`、`reopen` 操作。
- 角色权限:
  - requester 不能审批自己的请求。
  - approver 可以 approve / reject pending 请求。
  - owner 可以 reopen rejected 请求。
- 审批状态:`pending | approved | rejected`。
- 每次状态变化写 audit log,记录 actor、action、previousStatus、nextStatus、createdAt。
- UI 的 disabled state 必须与业务权限一致。
- 提供可运行方式和至少一组自动化验证或可复查 smoke 记录。

## 对比指标

每次 run 记录:

- 总耗时。
- 各阶段耗时。
- Agent/Human 交互次数。
- `/kanban` thread 创建和 multi-plan 创建耗时。
- developer 完成耗时。
- self-review loop 耗时。
- tester 验收耗时。
- owner closeout 耗时。
- 产生的 artifact 数量。
- 最终应用是否可启动、可操作、可复查。

这些指标用于观察流程效率和恢复质量,不是为了证明某次输出绝对正确。

## 历史 run

`runs/20260616_1303-current-flow/` 是早期 smoke baseline,只记录单 Agent fixture 完成情况。它不是正式 `/kanban` benchmark,后续对比应使用 `templates/` 创建新的 run。
