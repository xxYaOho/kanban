# Replica BlenderHunt Benchmark Instructions

本目录是 `/kanban` benchmark 的主测试项目。目标不是维护真实 BlenderHunt,而是在每次 benchmark 中按同一份 PRD 复刻一个可运行的 marketplace 前台体验,用来比较不同 `/kanban` 流程的效率和交付质量。

## Source Of Truth

开始前必须读取:

- `PRD.md`: 产品需求唯一真源。
- `DESIGN.md`: 视觉系统和页面气质参考。
- `token.css`: 设计 token 参考。
- `theme.css`: Tailwind/theme token 参考。

如果 PRD 和设计文档冲突,以 PRD 的功能范围为准,以 DESIGN 的视觉语言为准。不要把对话中的临时描述当作需求真源。

## Benchmark Goal

每次运行都交付一个可观察、可运行、可比较的 BlenderHunt 复刻版本。

必须覆盖:

- 首页。
- 商品详情页。
- 添加购物单流程。
- 购物单状态查看和修改。
- 最终可运行应用。
- 可复查的验证记录。

## Product Scope

实现一个前台 marketplace replica,不是后台管理系统。

必须保留 BlenderHunt 的核心产品信号:

- Indie marketplace for Blender creators。
- 黑色终端式视觉语言。
- 橙色 signal / CTA。
- 商品 catalog、category、price、creator、type。
- 详情页的购买决策信息。
- 购物单和 checkout 前的商业状态。

不得接入真实支付、真实登录、真实 BlenderHunt API 或真实用户账户。

## Agent Responsibilities

### Owner

- 创建 thread 和 multi-plan。
- 分配 developer/tester 席位。
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

### Tester

- 只按外部行为验收,不按实现细节验收。
- 至少验证首页、详情页、添加购物单、购物单修改和空状态。
- 保存验证命令、浏览器路径、截图或 smoke 记录。
- 发现问题时写 issue,不要只在对话里说明。

### Reviewer

Reviewer 只在流程要求或 owner 指定时使用。审查重点:

- 是否偏离 PRD。
- 是否误把视觉 token 当完整产品。
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
    kanban/
    verification/
    screenshots/
```

## Quality Bar

一个 run 只有在以下条件满足时才算可比较:

- 首页、详情页、购物单流程都可操作。
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
- 不要把真实 BlenderHunt 内容批量抓取成依赖。
- 不要把未验证的页面路径写为完成。
