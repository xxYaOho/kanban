# Replica BlenderHunt Benchmark Instructions

本目录是 `/kanban` benchmark 的主测试项目。目标不是维护真实 BlenderHunt,而是在每次 benchmark 中按同一份 PRD 做 1:1 复刻,交付一个可运行的 marketplace 前台体验,用来比较不同 `/kanban` 流程的效率和交付质量。

## Source Of Truth

开始前必须读取:

- `PRD.md`: 产品需求唯一真源。
- `DESIGN.md`: 视觉系统和页面气质参考。
- `token.css`: 设计 token 参考。
- `theme.css`: Tailwind/theme token 参考。

如果 PRD 和设计文档冲突,以 PRD 的功能范围为准,以 DESIGN 的视觉语言为准。不要把对话中的临时描述当作需求真源。

## Benchmark Goal

每次运行都交付一个可观察、可运行、可比较的 BlenderHunt 1:1 复刻版本。

必须覆盖:

- 首页 1:1 复刻。
- 商品详情页 1:1 复刻。
- 添加购物单流程。
- 购物单状态查看和修改。
- 原站设计资源采集和保存。
- 最终可运行应用。
- 可复查的验证记录。

## Product Scope

实现一个前台 marketplace replica,不是后台管理系统。设计资源可以从原站公共页面获取,但代码必须由 benchmark agent 自己完成。

必须保留 BlenderHunt 的核心产品信号:

- Indie marketplace for Blender creators。
- 黑色终端式视觉语言。
- 橙色 signal / CTA。
- 商品 catalog、category、price、creator、type。
- 详情页的购买决策信息。
- 购物单和 checkout 前的商业状态。

不得接入真实支付、真实登录、真实 BlenderHunt API 或真实用户账户。最终应用运行时不得依赖原站。

## Agent Responsibilities

### Owner

- 创建 thread 和 multi-plan。
- 分配 developer/tester 席位,默认至少创建:
  - `dev-assets`: 原站参考、截图、公开资源、fixture。
  - `dev-api`: 本地 catalog/product API 或 service contract。
  - `dev-frontend`: 首页、详情页、视觉复刻。
  - `dev-cart`: 购物单状态和交互。
  - `dev-test`: 测试和 smoke harness。
- 确认每个席位都读取 PRD 和 DESIGN。
- 记录 benchmark run 的开始和结束时间。
- 收尾时复制 app、kanban artifact、验证证据和截图。
- 填写最终 result。

### Developer

- 按 PRD 实现产品行为,不要只做静态截图。
- 每次 attempt 必须记录开始和结束时间。
- 完成后写 dev report 和 self-review。
- self-review 必须说明视觉还原、核心交互、购物单状态和验证结果。
- 不得把未实现的交互写成已完成。

### Dev Assets

- 访问原站公共页面并保存参考资料。
- 至少保存首页、一个详情页和购物单相关路径的截图或页面观察记录。
- 建立稳定 fixture: products、categories、creators、prices、media。
- 资源可以来自原站公共可访问内容,但必须落盘到本 run artifact。
- 不得要求最终 app 在运行时访问原站。

### Dev API

- 建立本地 catalog/product data contract。
- 提供 product list、product detail、category/filter 所需数据。
- 处理 missing product、empty list 等边界。
- 与 frontend/cart 使用同一份稳定 fixture。

### Dev Frontend

- 实现首页和详情页。
- 尽量 1:1 对齐原站布局、密度、色彩、字体、CTA、商品卡和信息层级。
- 使用 `DESIGN.md`、`token.css`、`theme.css` 和 dev-assets 捕获资料。
- 不得把 generic marketplace UI 当成复刻结果。

### Dev Cart

- 实现添加购物单、购物单查看、数量修改、移除、subtotal/total。
- 同一商品重复添加时必须更新已有 cart line。
- checkout 可以是 disabled/simulated,但状态和文案必须清楚。

### Dev Test

- 建立可重复 smoke 或自动化验证。
- 覆盖首页、详情页、添加购物单、数量修改、移除、空购物单。
- 保存测试输出和浏览器截图。

### Tester

- 只按外部行为验收,不按实现细节验收。
- 至少验证首页、详情页、添加购物单、购物单修改和空状态。
- 对比原站截图和 replica 截图,检查 1:1 复刻程度。
- 保存验证命令、浏览器路径、截图或 smoke 记录。
- 发现问题时写 issue,不要只在对话里说明。

### Reviewer

Reviewer 只在流程要求或 owner 指定时使用。审查重点:

- 是否偏离 PRD。
- 是否误把视觉 token 当完整产品。
- 是否达不到 1:1 复刻要求。
- 是否缺少可运行入口。
- 是否缺少购物单状态或详情页路径。
- 是否存在明显视觉/交互断裂。

### Integrator

Integrator 只在多 developer 合并复杂、冲突需要语义判断或 owner 明确升级时使用。

## Timing Requirement

每个关键步骤开始和结束都必须打点。使用本机时间:

```bash
date +%Y-%m-%dT%H:%M:%S%z
```

必须记录:

- 创建 benchmark run 目录。
- 创建 `/kanban` thread。
- 创建 plan 和 multi-plan。
- 注册 owner/developer/tester。
- dev-assets 开始和结束资源采集。
- dev-api 开始和结束本地 API/data contract。
- dev-frontend 开始和结束页面实现。
- dev-cart 开始和结束购物单实现。
- dev-test 开始和结束验证 harness。
- developer 开始和结束实现。
- developer self-review 开始和结束。
- tester 开始和结束验收。
- issue loop 开始和结束,如有。
- owner closeout 开始和结束。
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
- 首页和详情页有原站/replica 对比截图。
- 应用能从记录的命令启动。
- 至少一个桌面视口完成截图或 smoke。
- 购物单状态不是假文本,必须能响应添加、数量修改或移除。
- 产品数据稳定,不同 run 面对同一组商品和分类。
- 前后端/API/cart 席位边界清楚,artifact 可回看。
- result 中写明未完成项和已知限制。

## Do Not

- 不要把 benchmark 写成错误注入测试。
- 不要把 PRD 改成实现计划。
- 不要只实现静态首页。
- 不要使用真实支付或真实登录。
- 不要让最终 app 运行时依赖真实 BlenderHunt。
- 不要复制原站私有源码。
- 不要把未验证的页面路径写为完成。
