# /kanban --init

初始化 `~/.kanban/` 数据层。只应在首次部署或彻底重置时运行。

## 前置检查

1. **Bun 可用性**:`which bun` 必须返回路径。缺失则输出并中止:
   ```
   ❌ Bun 未安装。请先执行:
      curl -fsSL https://bun.sh/install | bash
   然后重新运行 /kanban --init
   ```
2. **目录已存在**:若 `~/.kanban/` 已存在,用 AskUserQuestion 提供三选项:
   - **(a) 跳过** — 什么都不做,汇报"已存在"
   - **(b) 重置** — `rm -rf ~/.kanban/` 后重建(要求用户**再次**输入 `CONFIRM RESET` 才执行)
   - **(c) 取消**(默认) — 直接退出

## 执行步骤

1. `mkdir -p ~/.kanban/{.locks,wave,archive}`
2. 写入 `~/.kanban/kanban.jsonc` = `{}`(从 `assets/kanban-template.jsonc` 拷贝)
3. 写入 `~/.kanban/package.json`:
   ```json
   {
     "name": "kanban-data",
     "private": true,
     "type": "module",
     "dependencies": {
       "proper-lockfile": "^4.1.2",
       "jsonc-parser": "^3.3.1"
     }
   }
   ```
4. `cd ~/.kanban && bun install` — 必须成功,失败则汇报并中止
5. 写入 `~/.kanban/README.md`(内容:目录说明 + `.locks/` 禁改警告 + 恢复指南)

## 实现脚本

```bash
bun run ~/.claude/skills/kanban/scripts/init.ts
```

脚本内部做 Bun 检查 + 目录存在性检查 + 其余步骤。AskUserQuestion 由 Agent 层承担,脚本只接收已决策的参数(`--reset` / `--skip`)。

## 汇报模板

**成功**:
```
✅ Kanban 已初始化
   数据根: ~/.kanban/
   依赖就位: proper-lockfile, jsonc-parser
下一步:
  /kanban --new          # 从对话创建任务
  /kanban --new --draft  # 先占个草案
```

**跳过**:
```
⚠️  ~/.kanban/ 已存在,未做任何改动
   如需重置,运行 /kanban --init 并选择 (b)
```

**失败**(Bun 缺失):
```
❌ Bun 未安装,已中止
```
