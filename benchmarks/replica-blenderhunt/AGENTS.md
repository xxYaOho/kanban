# Replica BlenderHunt Benchmark

本目录是 `/kanban` benchmark 的主测试项目。目标是在每次 benchmark 中按同一份 PRD 做 BlenderHunt 一比一复刻,并留下可运行、可复查、可比较的结果。

## 目标

- 按 `PRD.md` 交付 BlenderHunt 一比一复刻。
- 覆盖首页、商品详情、添加购物单、购物单查看和修改。
- 原站公共设计资源可以采集,但代码必须由 agent 自己完成。
- 最终结果必须可启动、可操作、可验证。

## 必读

- `PRD.md`: 产品需求唯一真源。
- `DESIGN.md`: 视觉参考。
- `token.css` / `theme.css`: 设计 token 参考。

如果文档冲突,功能范围以 `PRD.md` 为准,视觉方向以 `DESIGN.md` 为准。

## 约束

- 不接入真实支付、真实登录、真实 BlenderHunt API 或真实用户账户。
- 最终应用运行时不得依赖原站。
- 不复制原站私有源码。
- 不把静态截图当作产品实现。
- 不把 PRD 改成实现计划。

## 交付

每次 run 必须保留:

- 可运行应用源码和启动命令。
- 原站参考资料:截图、公开资源、页面观察记录、fixture 来源说明。
- kanban artifact 副本: plan、reports、self-review、test-report、closeout。
- 验证输出: test log、smoke log、浏览器截图或录屏。
- 时间线。
- 最终结果记录。

## 时间打点

关键步骤开始和结束必须记录本机时间:

```bash
date +%Y-%m-%dT%H:%M:%S%z
```

至少记录:

- 创建 run。
- 创建 thread / plan / multi-plan。
- 原站参考资料采集。
- 产品实现。
- self-review。
- 验收。
- closeout。
- 最终 smoke。

不要事后凭记忆估算时间。

## 建议结构

```text
runs/<YYYYMMDD_HHMM>-<flow>/
  task-card.md
  timeline.md
  result.md
  artifacts/
    app/
    source-reference/
    kanban/
    verification/
    screenshots/
```

## 完成标准

一个 run 只有在以下条件满足时才算可比较:

- 首页、详情页、购物单流程都可操作。
- 首页和详情页有原站/复刻结果对比截图。
- 应用能从记录的命令启动。
- 至少一个桌面视口完成截图或 smoke。
- 购物单状态不是假文本,必须能响应添加、数量修改或移除。
- 产品数据稳定,不同 run 面对同一组商品和分类。
- result 中写明未完成项和已知限制。
