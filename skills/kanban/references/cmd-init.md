# /kanban --init

初始化 `~/.kanban/` 数据层。只应在首次部署或彻底重置时运行。

## 前置检查

1. **Bun 可用性**:`which bun` 必须返回路径。缺失则输出并中止:
   ```
   ❌ Bun 未安装。请先执行:
      curl -fsSL https://bun.sh/install | bash
   然后重新运行 /kanban --init
   ```
2. **依赖就位**:检测 `skills/kanban/node_modules/` 是否存在。
   - 已就位 → 跳过安装
   - 未就位 → 依次尝试:
     ```
     which bun → bun install (在 skills/kanban/ 下)
     which npm → npm install  (在 skills/kanban/ 下)
     两者都没有 → 报错中止:
       ❌ 未检测到 bun 或 npm，无法安装 skill 依赖。
       请先安装其中一个：
         Bun:  curl -fsSL https://bun.sh/install | bash
         npm:  随 Node.js 附带，https://nodejs.org
       安装后重新运行 /kanban --init
     ```
   - npm 安装成功但 Bun 不存在时追加警告:
     ```
     ⚠️  依赖已通过 npm 安装，但脚本运行需要 Bun。
     请安装 Bun 后再使用 /kanban 其他命令：
       curl -fsSL https://bun.sh/install | bash
     ```

## 目录已存在时的处理

运行脚本后，根据退出码决定 Agent 层行为:

### exit 0: 数据层正常,无需操作
直接汇报"已存在,跳过"。

### exit 3: 检测到旧格式,需要迁移
脚本 stdout 会输出 JSON `{ needsMigration: true, items: [...] }`,列出需要迁移的项。
用 AskUserQuestion 提供选项:
- **(a) 迁移** — 保留数据,升级格式。传 `--migrate` 给脚本
- **(b) 重置** — 备份后删除重建(要求用户**再次**输入 `CONFIRM RESET` 才执行)。传 `--reset` 给脚本
- **(c) 取消**(默认) — 直接退出

### exit 2: 目录已存在且格式正常
用 AskUserQuestion 提供选项:
- **(a) 跳过** — 什么都不做,传 `--skip` 给脚本
- **(b) 重置** — 备份后删除重建(要求用户**再次**输入 `CONFIRM RESET` 才执行)。传 `--reset` 给脚本
- **(c) 取消**(默认) — 直接退出

## 执行步骤

1. `mkdir -p ~/.kanban/{.locks,archive}`
2. 写入 `~/.kanban/kanban.json` = `{}`(从 `assets/kanban-template.json` 拷贝)
3. 写入 `~/.kanban/README.md`(内容:目录说明 + `.locks/` 禁改警告)

## 实现脚本

```bash
bun run ~/.claude/skills/kanban/scripts/init.ts [--reset|--skip|--migrate]
```

脚本内部做 Bun 版本检查 + 依赖检查 + 目录存在性检查 + 迁移检测。AskUserQuestion 由 Agent 层承担,脚本只接收已决策的参数。

## 汇报模板

**成功**:
```
✅ Kanban 已初始化
   数据根: ~/.kanban/
   依赖就位: proper-lockfile
下一步:
  /kanban --new          # 从对话创建任务
  /kanban --new --draft  # 先占个草案
```

**迁移成功**:
```
✅ 数据层迁移完成
   kanban.jsonc → kanban.json
   wave/<repo>/ → <repo>/
   已清理: package.json, bun.lock, node_modules/
   任务路径已更新
```

**跳过**:
```
⚠️  ~/.kanban/ 已存在,未做任何改动
   如需重置,运行 /kanban --init 并选择重置
```

**失败**(Bun 缺失):
```
❌ Bun 未安装,已中止
```
