---
id: RECEIPT-WORK-003-06
work: WORK-003-06
status: completed
created: 2026-08-11
updated: 2026-08-12
---

# RECEIPT-WORK-003-06

## 范围说明

WORK-003-06 允许修改 `docs/**`（索引、链接修复）与 `tools/project_docs.py`（仅缺陷修复，先复现）。本次实施：修复 2 个工具缺陷（status 错映射、index rebuild 破坏手工索引/无 frontmatter ADR）、补文档工具自动测试、catalog 增加 CI/构建/发布主题、README 与 audit/test/guide 索引同步。未触碰任何生产代码（`src/`、`src-tauri/`），未移动/删除存量文档，未重写既有文档内容。PLAN/PRD/WORK 最终状态与 ACCEPTANCE 留主代理。

## 缺陷复现（红）

### 缺陷 1：`status` 命令错映射到 validate

`tools/project_docs.py` 主流程 `handlers` 字典写死 `'status':cmd_validate`，`python tools/project_docs.py status` 输出的是 `{"broken_links": []}`（断裂链接检查结果），而非文档生命周期状态。

### 缺陷 2：`index rebuild` 破坏手工索引与无 frontmatter 文档

在**临时副本**（复制 docs+tools 后独立运行，未触碰真实仓库）复现 `index rebuild`：

- `docs/adr/index.md` 被清空为只剩 header：存量 ADR 文件命名 `0001-*.md`，glob `ADR-*.md` 匹配不到任何文件，生成行集为空，覆盖后 4 条手工行（手写中文摘要、状态列"已接受"）全部丢失
- `docs/plan/plan-index.md` 丢失 WORK-001-01~05 / WORK-002-01 / WORK-003-01~06 全部行（glob `PLAN-*.md` 不匹配 WORK 前缀）；且因 Windows glob 大小写不敏感把 `plan-index.md` 自身当文档生成 `| plan-index | [plan-index](plan-index.md) | - | unknown |`
- 无 frontmatter 文件（ADR-0001/0002/0003、PLAN-001、WORK-001-*、WORK-003-*）被解析为错误 ID（`0001-launch`）或文件名标题 + `unknown` 状态

## 最小修复（绿）

### 修复 1：`cmd_status` 真实生命周期状态输出

新增 `cmd_status`：扫描 `docs/plan`（PLAN/WORK）、`docs/prd`、`docs/adr` 全部文档，输出 frontmatter `status` 的真实值（`pending/implementing/completed/已接受/...`）；无 frontmatter 如实输出 `unknown`；跳过模板（`-000-`）、RECEIPT/ACCEPTANCE、索引自身。主流程映射 `'status':cmd_validate` → `'status':cmd_status`。

### 修复 2：`index rebuild` 对无 frontmatter ADR/手工索引安全

- **无 frontmatter fallback**：ID 按文件名解析（`PLAN-001-audit-fixes`→`PLAN-001`、`WORK-001-01-rust-backend-fixes`→`WORK-001-01`、`0001-launch-routing`→`0001`，原实现对数字命名 ADR 产出 `0001-launch` 错误 ID），标题取文件名，状态如实 `unknown`；排除索引文件自身被 glob 误匹配
- **手工索引保护**：重建前对比"现有索引行引用的文件集"与"生成行文件集"，现有行存在无法由重建集合重现的文件（WORK 行、归档链接、非前缀命名文档、手写行）→ **跳过该索引并打印原因，不覆盖**。生成格式索引（未来全 frontmatter + 生成行）仍正常更新（测试覆盖）

## Changed Files

| 文件 | 改动 |
|---|---|
| `tools/project_docs.py` | 缺陷修复 2 处：新增 `cmd_status`（真实生命周期状态输出）+ handlers 映射修正；`index rebuild` 增加无 frontmatter fallback 与手工索引保护（跳过不覆盖） |
| `tools/test_project_docs.py`（新增） | 文档工具自动测试 11 个（stdlib unittest，零依赖），monkeypatch `project_docs.root` 指向临时目录，绝不触碰真实 docs |
| `docs/catalog.json` | 新增 `release-build` 主题（别名：发布/构建/CI/流水线/打包/产物/workflow/GitHub Actions/tag/release/build/质量门禁），primary=guide，related=technology/test/audit |
| `README.md` | ①"输出目录持久化（localStorage）"→"（Tauri Store，tauri-plugin-store）"（实现实际走 `store.set("batchOutputDir",...)`，README 原描述过时）② 构建发布版章节补 `scripts/copy-dist.mjs` 自动探测 MSVC/SDK 说明 ③ 新增"质量门禁（CI）"章节（workflow 触发条件、门禁命令、版本锁定来源、本地等效验证命令）。版本 `v0.2.0 (2026.08)` 已由 WORK-003-02 同步，未动 |
| `docs/audit/audit-index.md` | 新增"PLAN-003 质量门禁跟进"行，状态"进行中"，摘要如实标注：前端/Rust 门禁已清零，CI 工作流本地验证通过，**远端未触发（未推送）** |
| `docs/test/test-index.md` | 补 WORK-003-03（Rust 测试安全 53 测试）、WORK-003-04（批量确认 80 测试）、WORK-003-05（CI 质量门禁）三行 |
| `docs/guide/index.md` | 补 CI 质量门禁工作流、文档工具与校验（`tools/test_project_docs.py`）两行 |
| `docs/plan/RECEIPT-WORK-003-06.md`（本回执） | — |

未改动（确认未触碰）：`docs/adr/index.md`、`docs/plan/plan-index.md`、`docs/prd/index.md`、`docs/bug/*`（真实索引 md5 前后一致）；`src/`、`src-tauri/` 零改动。

## 自动测试覆盖（tools/test_project_docs.py，11 个）

| 用例 | 断言 |
|---|---|
| status 输出生命周期状态 | PLAN-001 completed / PLAN-002 unknown（无 frontmatter 如实）/ PRD 已接受 / ADR-0001 unknown；输出不含 `broken_links` |
| status 跳过模板/RECEIPT/ACCEPTANCE/索引自身 | 三类文件不在输出中 |
| rebuild 保护手工 ADR 索引 | 打印"跳过"提示，索引文件内容逐字节不变 |
| rebuild 保护手工 PLAN 索引（含 WORK 行） | 同上，WORK 行保留 |
| rebuild 正常更新生成格式索引 | 状态 draft 同步进索引（生成格式索引仍可重建） |
| rebuild 无 frontmatter fallback | `PLAN-999-x` 解析出 ID `PLAN-999`、状态 `unknown` |
| rebuild 空 ADR 索引 | 不崩溃 |
| validate 断链/全绿 | 断链返回 5 且列表非空；全绿返回 0 |
| context 命中 release-build | "发布 构建 CI"命中新主题返回 0 |
| context 低置信度 | 无命中返回 2 |

## 验证命令结果（收口）

| 命令 | 结果 |
|---|---|
| `python tools/project_docs.py validate` | `{"broken_links": []}`，退出码 0 |
| `python tools/project_docs.py index check` | 索引健康，退出码 0 |
| `python tools/project_docs.py status` | 真实生命周期 JSON（PLAN-003 implementing、WORK-002-01 completed、ADR-0004 已接受、无 frontmatter 如实 unknown），退出码 0 |
| `python tools/project_docs.py context "发布 构建 CI"` | `{"topic": "release-build", "primary": "docs/guide/index.md", ...}`，退出码 0 |
| `python tools/test_project_docs.py` | 11 tests OK（3 次重复稳定） |
| `python tools/project_docs.py index rebuild`（真实仓库） | 跳过 docs/adr/index.md 与 docs/plan/plan-index.md（手工索引），真实索引 md5 前后一致，未破坏 |
| 全子命令回归（完整临时副本：复制全部仓库文件排除 .git/node_modules/dist/target） | context/validate/status/index check/index rebuild/index compact/knowledge list/new prd 全部退出码 0；start PLAN-003=0；close PLAN-003=4（预期：收口检查未完成，行为正确） |
| README 链接 | validate 覆盖 `../../.github/workflows/ci.yml`、`../../tools/project_docs.py`、`../../README.md` 均存在，零断链 |

## 通过标准核对（WORK-003-06）

- [x] `validate` 输出 `broken_links: []`
- [x] `index check` 输出"索引健康"
- [x] PRD-001 / ADR-0004 / PLAN-003 / WORK-003-01~06 均在各索引中有行（既有手工索引已有，本次未破坏并补充 test/guide/audit 关联行）
- [x] 工具缺陷有复现（临时副本红）与修复记录（本回执 + `tools/test_project_docs.py` 回归）

## 风险与未决项

- **手工索引与 rebuild 的取舍**：ADR/PLAN 索引当前为手工维护格式（中文状态列、手写摘要、WORK 行、emoji），rebuild 现在对它们一律跳过（安全优先）。若希望未来让 rebuild 接管，需先把索引行迁移为生成格式（ID/状态列英文、摘要取自 frontmatter）——超出本工单范围，未做。
- **`status` 对无 frontmatter 文档显示 `unknown`**：存量 ADR-0001/0002/0003、WORK-001-*、WORK-003-* 均无 frontmatter，status 如实报 unknown；补 frontmatter 属存量文档内容改动，未越权。
- **CI 远端未触发**：本工单未提交、未推送，`.github/workflows/ci.yml`（WORK-003-05）远端从未运行；audit-index 与 RECEIPT 均如实标注"远端未触发"，未声称 CI 全绿。
- **`tools/project_docs.py` 一处存量死代码**（`index.add_subparsers if False else None` 一行，其后有正确构建）未清理——超出缺陷修复范围，仅提示。

## 审计补正段（PLAN-003 审计，2026-08-11）

本次补正修复 4 处工具缺陷（TDD：先加失败测试再实现，`tools/test_project_docs.py` 11 → **17 个用例全绿**）：

1. **`checked` 缺章节必须为 False**：原实现对不存在的章节返回 `True`（`''` 中无 `- [ ]`），`start`/`close` 会在文档缺少"开发前知识检查"/"收口检查"章节时误放行；改为章节不在文档中直接返回 `False`。
2. **`validate` 跳过外链**：原实现对 `https://`、`mailto:` 等外链按相对路径解析而误报断链（CI 门禁会误红）；增加协议前缀（http/https/mailto/ftp/data）跳过。
3. **`index compact` 归档链接重写**：归档行写入 `<kind>/archive/<year>.md` 后原相对文档链接失效，新增 `_rewrite_archive_row` 把相对链接加 `../` 前缀（外链与已相对链接不改）。
4. **`cmd_new` 缺标题友好报错**：原实现 `slug(None)` 抛 `TypeError` 崩溃；改为提示"缺少标题：new {kind} 需要提供标题参数"并返回 1、不创建文档；同时补 `path.parent.mkdir`（plan 分支在 `docs/plan/` 不存在时写文件会 `FileNotFoundError`，测试暴露）。
- 未提交、未推送、未 tag、未发布、未关闭 PLAN；PLAN/PRD/WORK 最终状态与 ACCEPTANCE 由主代理收口。

## 返工段（CI 第三次失败修复：cp1252 中文输出崩溃，2026-08-12）

### 远端失败根因

GitHub Actions Windows runner 的 Python 3.12 stdout 默认编码为 **cp1252**（英文系统 ANSI 代码页），`project_docs.py` 的中文输出（如 `index check` 成功路径 `print('索引健康')`）在 cp1252 下抛 `UnicodeEncodeError: 'charmap' codec can't encode characters in position 0-3`。本地中文 Windows（cp936）能编码中文，从未暴露；CI 英文系统是首个无中文 locale 的运行点（Run 31538982613：Rust 已全绿，唯独「文档索引检查」失败）。

### 修复内容（`tools/project_docs.py` + `tools/test_project_docs.py`，委派范围内）

1. **新增 `_force_utf8_stdio()`**：遍历 `sys.stdout`/`sys.stderr`，对非 UTF-8 编码流 `reconfigure(encoding='utf-8', errors='replace')`，带 `getattr`/`encoding` 防御与异常吞掉；`main()` 顶部首行调用。不改变任何子命令行为、输出内容、退出码。
2. **新增测试 1 个**：`TestCliEncoding.test_index_check_survives_cp1252_stdio` —— subprocess 运行真实脚本，env 注入 `PYTHONIOENCODING=cp1252`，断言 returncode==0、stderr 无 `Traceback`、stdout 含「索引健康」。

### TDD 证据

- **RED（本地复现）**：修复前 `PYTHONIOENCODING=cp1252 python tools/project_docs.py index check` → `UnicodeEncodeError`（与远端 CI 完全一致）；新增测试 FAILED。
- **GREEN**：实现后同命令退出码 0 输出「索引健康」；`python tools/test_project_docs.py` **18 个全绿**（17 → +1）。
- **cp1252 强制回归**：`index check` / `validate` / `status` / `context 发布` 在 `PYTHONIOENCODING=cp1252` 下全部退出码 0。
- **远端验证**：Run 31539579969 全部步骤通过（含文档链接校验、文档索引检查）。

### 未决项

- 新测试断言 `index check` returncode==0；若未来 docs 索引超长触发「建议压缩」返回 2 会误报，当前仓库健康，属预期内。
- 未提交、未推送、未关闭 PLAN；仅改动 `tools/project_docs.py` 与本回执返工段。
