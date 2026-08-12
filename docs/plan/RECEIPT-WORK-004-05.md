---
id: RECEIPT-WORK-004-05
work: WORK-004-05
status: completed
created: 2026-08-12
updated: 2026-08-12
---

# RECEIPT-WORK-004-05

## 范围说明

WORK-004-05「发布文档与 Gatekeeper 指南」（PLAN-004 最后一批，文档收口）：README 更新（版本 v0.3.0、macOS 支持章节、macOS 构建方式、未签名分发与 Pre-release 流程）；新增 Gatekeeper 指南与真机验收记录模板；同步 guide / test 索引。纯文档工单：未改生产代码、未改 `.github/workflows/ci.yml`、未改任何已收口回执。

## Changed Files

**新增（3）**

- `docs/guide/macos-gatekeeper.md` — macOS Gatekeeper 使用指南
- `docs/guide/macos-device-verification.md` — 真机验收记录模板（待回填）
- `docs/plan/RECEIPT-WORK-004-05.md` — 本回执

**修改（3）**

- `README.md` — 版本行 v0.3.0 + 「macOS 支持」章节 + 「构建 macOS 发布版」小节 + 「macOS Pre-release（手动流程）」小节 + 项目结构树补 `tauri.macos.conf.json`
- `docs/guide/index.md` — 新增两行（Gatekeeper 指南、真机验收记录）
- `docs/test/test-index.md` — 新增一行（macOS 真机验收记录）

## 内容清单

### README.md

- 版本行：`v0.2.0 (2026.08)` → `v0.3.0 (2026.08)`
- 新增「macOS 支持」章节（功能之后、快速开始之前）：版本 0.3.0、双架构（Apple Silicon arm64 / Intel x64 独立 DMG）、最低 macOS 12 Monterey、支持格式 JPG/JPEG、PNG、WebP、BMP、Finder 双击打开/多文件/冷启动 `~` 行为、Cmd 快捷键、设置页只读、安全路径；链接 Gatekeeper 指南与真机验收记录
- 「构建发布版」下新增「构建 macOS 发布版（在 macOS 上执行）」：`npx tauri build` 自动合并 `src-tauri/tauri.macos.conf.json`（identifier `com.cq30.piccarft`、DMG target、文件关联 UTI、最低 macOS 12）；产物 `src-tauri/target/release/bundle/dmg/`，CI 重命名 `PicCraft_0.3.0_arm64.dmg` / `PicCraft_0.3.0_x64.dmg`，Artifact `piccarft-dmg-arm64` / `piccarft-dmg-x64`
- 「一键发布」下新增「macOS Pre-release（手动流程）」：macOS 不走 `release.mjs`；真机清单确认 → 下载两个 DMG Artifact → 手动创建 Pre-release `v0.3.0` 关联两个 DMG → 不自动发布（与 PRD-002 / ADR-0005 一致）

### docs/guide/macos-gatekeeper.md（关键内容摘录）

- 原因：未签名 + 未公证（ADR-0005）→ Gatekeeper 拦截（提示「无法验证开发者」/「已损坏，无法打开」）；**唯一受支持方式**为 Finder 右键 → 打开
- 首次打开 4 步：挂载 DMG → 应用程序中右键 PicCraft → 打开 → 弹窗确认
- 设置 Finder 默认应用：与设置页教程逐条一致（右键图片 → 显示简介 → 打开方式 → 选择 PicCraft → 全部更改）；支持格式 JPG/JPEG、PNG、WebP、BMP
- 常见问题：DMG 挂载/退出、卸载、提示「已损坏」说明（不表示文件损坏）
- **全篇无任何系统安全降级命令**（grep 校验见「验证与收尾」）

### docs/guide/macos-device-verification.md

- 验收环境：验收人/日期、机型、芯片（Apple Silicon / Intel / **未知**）、macOS 版本、验收 DMG、是否按 Gatekeeper 指南打开；芯片不确定记录「未知」
- 验收清单 12 项（全部取自 PRD-002 验收标准）：Finder 双击打开并全屏定位、多文件只按第一张目录浏览、冷启动 `~`、Cmd+S / Cmd+Shift+S / Cmd+A / Cmd+滚轮、设置页只读无假勾选、安全路径禁止项（/System、/Library、/private、~/Library）与允许项（用户目录、/Applications、用户临时目录）、批量/单图核心功能、架构覆盖标注
- 结论区：整体结论（通过/不通过）、未通过项、架构覆盖说明（真机验证 / 仅自动化验证）、发现的问题、备注

## 一致性核对

| 核对项 | 结果 |
|---|---|
| README 版本与 package.json / Cargo.toml / tauri.conf.json / 设置页（About v0.3.0） | 通过，均 0.3.0 |
| 支持格式与 `SettingsView.tsx` FORMATS（jpg/jpeg/png/webp/bmp） | 通过，README / Gatekeeper 指南写 JPG/JPEG、PNG、WebP、BMP |
| Finder 默认应用教程与 `MacOSFileAssocSubTab` 4 步文案 | 通过，逐条一致（右键图片 → 显示简介 → 打开方式 → 全部更改） |
| Gatekeeper 指南不含降级命令词（工单验收词表） | 通过，grep 零命中 |
| 构建命令与产物路径对照 WORK-004-03 / WORK-004-04 实况 | 通过（tauri.macos.conf.json 自动合并、bundle/dmg、DMG 重命名与 Artifact 名与 RECEIPT-WORK-004-04 一致） |
| README 无 v0.2.0 残留 | 通过，grep 零命中 |

## 真机待验收项说明

- 本工单只交付验收**模板**，不产生、不编造真机结果；未覆盖架构一律标注「仅自动化验证」
- Pre-release 创建前置条件：真机验收清单通过（结论区回填），之后才可手动创建 `v0.3.0` Pre-release
- 现状（来自 RECEIPT-WORK-004-04）：arm64 DMG 已产出（约 6.0 MB）；x64 job 当时仍 queued，x64 真机验证状态未知 → 发布说明需按实况标注架构覆盖

## 验证与收尾

| 检查 | 结果 |
|---|---|
| `python tools/project_docs.py validate` | 通过（`{"broken_links": []}`） |
| `python tools/project_docs.py index check` | 索引健康 |
| Gatekeeper 指南 grep（工单验收词表，大小写不敏感） | 零命中 |
| 新增文档全量 grep（同上词表） | 零命中 |
| README `0.2.0` grep | 零命中（无残留） |

未提交、未推送、未关闭 PLAN；生产代码 / ci.yml / 已收口回执未改动。

## 未决项

- 真机验收结果待朋友回填（模板已就位，回填后供 Pre-release 决策）
- x64 架构 CI 产物与真机状态：RECEIPT-WORK-004-04 已列未决项，由该回执后续补录（本工单不受影响）
- plan-index 状态由 PLAN-004 收口方统一更新（既有惯例，本工单未动）
