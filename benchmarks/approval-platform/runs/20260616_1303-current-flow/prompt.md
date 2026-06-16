# Prompt

实现一个最小审批平台,用于 `/kanban` vNext benchmark 的 current-flow 基线。

要求:

- 支持审批请求状态 `pending | approved | rejected`。
- requester 不能审批自己的请求。
- approver 可以 approve / reject pending 请求。
- owner 可以 reopen rejected 请求。
- 每次状态变化必须写 audit log,包含 actor、action、previousStatus、nextStatus。
- UI view-model 必须根据后端权限规则给出 approve / reject / reopen 的 disabled state。
- 提供自动测试覆盖核心业务规则。

本 run 不模拟完整多 Agent 流程,只记录当前单 Agent 完成审批平台 fixture 的质量、耗时、测试结果和发现情况。
