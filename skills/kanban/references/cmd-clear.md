# `/kanban --clear [<uuid>]`

归档终态任务:移动 thread 目录至 `archive/`、更新 `archive/index.json`、从 `kanban.json` 移除条目、清理空 repo 目录。

## 流程

### 1. 扫描候选

Agent 运行 `bun run clear.ts [<uuid>]`,stdout 输出 JSON:

```json
{
  "candidates": [
    {
      "id": "e3384cac-a86f-4a0f-a2de-e6000fc3daea",
      "short": "e3384cac",
      "repo": "wave",
      "description": "移除 Style Dictionary + Pipeline 重构",
      "status": "done"
    }
  ],
  "dryRun": true
}
```

- `candidates` 为空:提示"无待归档任务"
- 非终态任务:stdout 报错"任务还在进行中，无法归档"

### 2. 用户确认

Agent 展示候选清单,文本确认后执行。

### 3. 执行归档

Agent 运行 `bun run clear.ts --commit [<uuid>]`,stdout:

```json
{ "ok": true, "archived": ["e3384cac"] }
```

## 归档内容

`archive/<uuid>/` 下包含:

- `task.json` — 完整任务数据 (`{uuid: Task}`,与 kanban.json 条目格式一致)
- 原始任务目录下的所有文件 (plan.md, report-*.md, review-*.md 等)

## 边界

| 场景 | 行为 |
|------|------|
| 非终态 | `exit 1` + "任务还在进行中，无法归档" |
| 源目录不存在 | 跳过,仅清理 kanban.json |
| 目标已存在 | 跳过,提示已归档 |
| 空 repo 目录 | 归档后自动删除 |
