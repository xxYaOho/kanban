# Approval Platform Benchmark

本目录定义 `/kanban` vNext 的外部 benchmark。它不属于 `skills/kanban` 运行时,只在需要评估协议设计时使用。

## 用途

这个 benchmark 用来比较三种流程:

```text
A. 旧流程: developer -> reviewer -> tester -> integrator
B. vNext 默认流: owner -> developer self-review loop -> tester -> owner closeout
C. vNext 混合流: owner 按风险插入 reviewer gate / integrator
```

目标不是构建完整产品,而是用一个足够综合的小项目测试协议质量。

## 项目范围

最小审批平台包含:

- 前端:审批列表、审批详情、approve / reject / reopen 操作。
- 后端:审批 API、角色权限、状态机。
- Shared contract:状态枚举、API 类型、请求/响应 schema。
- Audit:记录审批历史。
- 测试:unit、API integration、轻量端到端 smoke。

建议席位:

- `owner`:写 plan、拆分 brief、定义验收标准、决定 optional gate。
- `dev-api`:实现 API、权限、状态机。
- `dev-web`:实现列表、详情和操作流。
- `dev-audit`:实现 audit log。
- `tester`:建立测试用例并验收。
- `reviewer`:只在流程 A 或流程 C 的 gate 中使用。
- `integrator`:只在流程 A 或流程 C 的复杂集成中使用。

## 业务规则

用于 benchmark 的业务规则应保持小而明确:

- 请求初始状态为 `pending`。
- approver 可以 `approve` 或 `reject` pending 请求。
- owner 可以 `reopen` rejected 请求。
- requester 不能 approve 自己的请求。
- 每次状态变化必须写 audit log。
- UI disabled state 必须与后端权限一致。

## 固定场景

为了比较 A/B/C 三种流程,同一轮 benchmark 必须使用同一组 scenario seed 和 injected risk set。不能让不同流程面对不同风险。

默认 seed:

```text
approval-platform-v1
```

## 注入风险

每次 benchmark 从下列风险中选择固定集合,并在 A/B/C 三种流程中保持一致。每个风险必须标注 severity 和 expected detection stage。

- shared 状态枚举不一致。
- 前端字段名与 API 返回字段不一致。
- 后端权限校验漏掉 requester 自审。
- audit log 缺少 previous state 或 actor。
- reopen 业务规则在 web / api / audit 中理解不一致。
- 多 developer 同时修改 shared contract。
- tester pass 后 owner merge 引入冲突或回归。
- owner closeout 缺少合并依据或最终验证证据。
- 主工作区 dirty 时 owner 仍尝试 merge。
- 合并需要语义修复,但流程没有升级 integrator。

推荐 severity:

- Critical: 权限绕过、数据损坏、无法恢复的主线破坏。
- High: 状态机错误、API/UI contract 断裂、测试遗漏导致核心流程失败。
- Medium: audit 证据不完整、closeout 记录不足、非核心回归。

## 评分指标

每次运行记录:

- injected high-risk 总数。
- injected medium-risk 总数。
- 高风险缺陷在 tester 前被发现的数量。
- tester 发现的高风险缺陷数量。
- owner / integrator 阶段才发现的缺陷数量。
- plan 偏离是否被发现。
- shared contract 冲突是否被发现。
- false approve / false pass 数量。
- Human 介入次数。
- 总轮次。
- artifact 数量。
- 是否能从文件系统恢复完整过程。

## 输出结构

每次 benchmark 建议创建:

```text
benchmarks/approval-platform/runs/<YYYYMMDD-HHMM>-<flow>/
  prompt.md
  injected-risks.md
  expected-findings.md
  observed-findings.md
  scorecard.md
  artifacts/
```

`artifacts/` 可收集运行中产生的 plan、report、self-review、review、test-report、closeout 或 integration report 副本。

## `injected-risks.md`

每个风险使用同一格式:

```md
## R1: requester can approve own request

- Severity: Critical
- Expected detection stage: developer self-review | reviewer gate | tester | owner closeout | integrator
- Affected seats: dev-api, dev-web, tester
- Expected evidence: test failure or review finding
```

## 成功判断

vNext 默认流可以接受的条件:

- 比旧流程少默认席位和 artifact。
- developer self-review 有真实反馈和修正记录。
- tester 仍能发现端到端行为问题。
- owner closeout 能恢复合并依据和最终验证。
- 高风险缺陷发现率没有明显下降。比较时使用同一风险分母。
- owner merge 不在 main 上引入未记录冲突或 dirty worktree 风险。

如果 vNext 默认流漏掉跨席位 contract 或高风险权限问题,则需要启用流程 C:由 owner 按风险插入 reviewer gate 或 integrator。
