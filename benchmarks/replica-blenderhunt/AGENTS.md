# Replica BlenderHunt Benchmark Instructions

本目录是 `/kanban` benchmark 的主测试项目。目标不是维护真实 BlenderHunt,而是在每次 benchmark 中按同一份 PRD 做一比一复刻,交付一个可运行的 marketplace 前台体验,用来比较不同 `/kanban` 流程的效率和交付质量。

## Source Of Truth

开始前必须读取:

- `PRD.md`: 产品需求唯一真源。
- `DESIGN.md`: 视觉系统和页面气质参考。
- `token.css`: 设计 token 参考。
- `theme.css`: Tailwind/theme token 参考。

如果 PRD 和设计文档冲突,以 PRD 的功能范围为准,以 DESIGN 的视觉语言为准。不要把对话中的临时描述当作需求真源。

## Benchmark Goal

每次运行都交付一个可观察、可运行、可比较的 BlenderHunt 一比一复刻版本。

必须覆盖:

- 首页一比一复刻。
- 商品详情页一比一复刻。
- 添加购物单流程。
- 购物单状态查看和修改。
- 原站设计资源采集和保存。
- 最终可运行应用。
- 可复查的验证记录。

## Product Scope

实现一个前台 marketplace 一比一复刻,不是后台管理系统。设计资源可以从原站公共页面获取,但代码必须由 benchmark agent 自己完成。

必须保留 BlenderHunt 的核心产品信号:

- Indie marketplace for Blender creators。
- 黑色终端式视觉语言。
- 橙色 signal / CTA。
- 商品 catalog、category、price、creator、type。
- 详情页的购买决策信息。
- 购物单和 checkout 前的商业状态。

不得接入真实支付、真实登录、真实 BlenderHunt API 或真实用户账户。最终应用运行时不得依赖原站。

## Timing Requirement

每个关键步骤开始和结束都必须打点。使用本机时间:

```bash
date +%Y-%m-%dT%H:%M:%S%z
```

必须记录:

- 创建 benchmark run 目录。
- 创建 `/kanban` thread。
- 创建 plan。
- 创建 multi-plan,如果本轮使用 multi-plan。
- 注册或承接席位。
- 原站参考资料采集。
- 产品实现。
- self-review。
- 验收。
- issue loop 开始和结束,如有。
- closeout。
- 最终 app smoke 开始和结束。

不要事后凭记忆估算时间。

## Artifact Requirement

每次 benchmark run 必须保留:

- 可运行 app 源码。
- 原站参考资料:截图、公开资源、页面观察记录、fixture 来源说明。
- kanban artifact 副本: plan、reports、self-review、test-report、closeout。
- 验证输出: test log、smoke log、浏览器截图或录屏。
- 时间线。
- 最终结果记录。

建议结构:

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

## Quality Bar

一个 run 只有在以下条件满足时才算可比较:

- 首页、详情页、购物单流程都可操作。
- 首页和详情页有原站/复刻结果对比截图。
- 应用能从记录的命令启动。
- 至少一个桌面视口完成截图或 smoke。
- 购物单状态不是假文本,必须能响应添加、数量修改或移除。
- 产品数据稳定,不同 run 面对同一组商品和分类。
- result 中写明未完成项和已知限制。

## Do Not

- 不要把 benchmark 写成错误注入测试。
- 不要把 PRD 改成实现计划。
- 不要只实现静态首页。
- 不要使用真实支付或真实登录。
- 不要让最终 app 运行时依赖真实 BlenderHunt。
- 不要复制原站私有源码。
- 不要把未验证的页面路径写为完成。
