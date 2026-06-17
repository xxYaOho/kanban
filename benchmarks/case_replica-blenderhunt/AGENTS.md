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
- `templates/`: 每次 run 的固定输出模板。
- `scripts/validate-run.ts`: run artifact 校验脚本。

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

## 稳定输出合同

每次 run 必须按固定路径输出结果,避免后续比较时重新猜测文件名或口径。

```text
runs/<YYYYMMDD_HHMM>-<flow>/
  task-card.md
  timeline.md
  result.md
  metrics.json
  artifacts/
    app/
    source-reference/
      screenshots/
        home-original-1280x2744.png
        detail-original-1280x1200.png
    kanban/
    verification/
      logs/
    screenshots/
      home-replica-1280x2744.png
      detail-replica-1280x1200.png
      cart-replica-1280x1200.png
    visual-comparison/
      home-diff-1280x2744.png
      home-side-by-side-1280x2744.png
      home-metrics-1280x2744.json
```

允许额外输出文件,但上述路径和文件名必须稳定。若某项无法生成,仍创建对应记录并在 `result.md` 与 `metrics.json` 中写明原因。

## 量化指标

每次 run 必须在 `metrics.json` 写入同一组字段,不要删除字段。模板中的 `0` / `false` / 空字符串是待填写默认值;确实无法判断的可空字段使用 `null`。

```json
{
  "schema_version": 1,
  "case": "replica-blenderhunt",
  "run_id": "20260617_1100-kanban-dev",
  "kanban_version": "v0.2.0",
  "started_at": "2026-06-17T11:13:42+0800",
  "finished_at": "2026-06-17T12:08:28+0800",
  "duration_seconds": 3286,
  "workflow": {
    "flow": "multi-plan",
    "developer_count": 2,
    "tester_attempts": 1,
    "reviewer_gate_used": false,
    "issue_opened": 0,
    "issue_resolved": 0,
    "self_review_count": 2,
    "review_report_count": 0
  },
  "product": {
    "homepage": true,
    "detail_page": true,
    "cart": true,
    "search_or_filter": true,
    "product_count": 13,
    "category_count": 8,
    "cart_operations_passed": true
  },
  "verification": {
    "install_passed": true,
    "typecheck_passed": null,
    "test_passed": true,
    "build_passed": true,
    "smoke_passed": true,
    "start_command": "node runs/.../artifacts/app/server.mjs 4173"
  },
  "visual": {
    "viewport": "1280x2744",
    "original": "artifacts/source-reference/screenshots/home-original-1280x2744.png",
    "replica": "artifacts/screenshots/home-replica-1280x2744.png",
    "diff": "artifacts/visual-comparison/home-diff-1280x2744.png",
    "side_by_side": "artifacts/visual-comparison/home-side-by-side-1280x2744.png",
    "rmse": "16311.1 (0.248892)",
    "mae": "8355.47 (0.127496)",
    "absolute_error_pixels": "3.06143e+06 (0.871626)",
    "psnr": null,
    "ssim": null
  },
  "artifact_counts": {
    "kanban_markdown": 14,
    "screenshots": 11,
    "verification_logs": 4
  },
  "known_limits": []
}
```

### 指标口径

- 时间使用本机命令 `date +%Y-%m-%dT%H:%M:%S%z`。
- `duration_seconds` 按 `started_at` 到 `finished_at` 计算,不要手填估算值。
- 视觉对比默认使用 homepage `1280x2744`。如浏览器或原站导致高度不同,必须重新按同一 viewport 截图,不要后期拉伸图片。
- ImageMagick 至少输出 RMSE、MAE、AE。PSNR、SSIM 若当前工具链无法稳定输出,填 `null`。
- `review_report_count` 只统计独立 reviewer 报告; developer 自己调用 subagent 后形成的记录计入 `self_review_count` 或 dev report 修正记录。
- `issue_opened` / `issue_resolved` 统计 kanban issue artifact,不要只统计对话中提到的问题。
- `artifact_counts` 统计最终 run artifact 内的文件,不统计源仓库 `.git`。

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
  metrics.json
  artifacts/
    app/
    source-reference/
    kanban/
    verification/
    screenshots/
    visual-comparison/
```

创建 run 时先复制模板:

```bash
mkdir -p runs/<YYYYMMDD_HHMM>-<flow>
cp templates/task-card.md templates/timeline.md templates/result.md templates/metrics.json runs/<YYYYMMDD_HHMM>-<flow>/
```

收尾时运行校验:

```bash
bun run scripts/validate-run.ts runs/<YYYYMMDD_HHMM>-<flow>
```

校验失败时,不要把 run 标记为可比较;在 `result.md` 和 `metrics.json.known_limits` 中记录缺失项。

## 完成标准

一个 run 只有在以下条件满足时才算可比较:

- 首页、详情页、购物单流程都可操作。
- 首页和详情页有原站/复刻结果对比截图。
- 应用能从记录的命令启动。
- 至少一个桌面视口完成截图或 smoke。
- 购物单状态不是假文本,必须能响应添加、数量修改或移除。
- 产品数据稳定,不同 run 面对同一组商品和分类。
- result 中写明未完成项和已知限制。
- `metrics.json` 存在且字段完整。
- homepage 原站/复刻截图按 `1280x2744` 完成 ImageMagick 对比。
- `bun run scripts/validate-run.ts <run-dir>` 通过。
