---
id: PLAN-004
title: macOS 适配实施计划
status: implementing
source: PRD-002
topics: [macos, release, platform, finder, dmg, ci]
created: 2026-08-12
updated: 2026-08-12
---

# PLAN-004 macOS 适配实施计划

## 开发前知识检查

- [x] 已运行 context
- [x] 已阅读分类索引
- [x] 已阅读具体内容文档
- [x] 已记录代码图谱结果
- [x] 已确认框架优先方案

### CLI 推荐索引

- 主索引：`docs/prd/index.md`、`docs/technology/index.md`
- 相关索引：`docs/test/test-index.md`、`docs/design/index.md`
- 流程索引：`docs/plan/plan-index.md`

### 已阅读内容文档

- `CONTEXT.md` — 领域术语表、视图语义、启动路由（冷启动/双击参数）
- `docs/prd/PRD-001-v0.2-stable-release-baseline.md`、`docs/prd/PRD-002-macos-support.md`（本次新增）
- `docs/adr/0005-macos-distribution.md`、`docs/adr/0006-bundle-identifier-platform.md`（本次新增，已接受）
- `docs/adr/0001-launch-routing.md` — 启动参数路由既有决策（Windows 语义）
- `docs/plan/PLAN-003-stable-release-baseline.md` — 流程与门禁参考
- `docs/technology/index.md` — 技术栈（Tauri 2.11.2 / React 19 / Rust 1.97.1）

### 代码图谱结果

- 启动路由：`src-tauri/src/lib.rs` 解析 argv（`--browse <file>` / `--edit <file>` / 冷启动）→ 前端路由（浏览视图 / 单图编辑）；`tauri-plugin-single-instance` 已接入，当前只透传 argv，macOS 需要处理 `RunEvent::Opened { urls }` 并把 Finder 打开事件在单实例场景下转发到首个实例。
- 敏感路径：`src-tauri/src/image_ops.rs::is_sensitive_path` 当前为 Windows 字符串规则（`c:\windows`、`\appdata\` 等），macOS 需要平台化（`/System`、`/Library`、`/private`、`~/Library`）。
- 快捷键：`src/components/SingleTab.tsx` 保存快捷键当前只认 `ctrlKey`（Windows）；macOS 需 `metaKey`（Cmd）。
- 文案：`src/components/QueuePanel.tsx`（「在资源管理器中显示」）、`src/components/DirTree.tsx`（根节点文案）。
- 设置页：`src/views/SettingsView.tsx` 当前为 Windows 文件关联语义；macOS 改为只读格式说明 + Finder 教程。
- 打包：`src-tauri/tauri.conf.json` identifier `com.piccarft.app`；`src-tauri/icons/icon.icns` 已存在；无 macOS bundle 配置。
- CI：`.github/workflows/ci.yml` 仅 Windows job。

### 框架能力与结论

- Finder 打开事件：Tauri 2 通过 `tauri::RunEvent::Opened { urls }`（macOS 由 `RunEvent` 变体触发）；单实例场景由 `tauri-plugin-single-instance` 的事件参数接收转发，无需自研进程通信。
- 平台条件配置：Tauri 2 的 `tauri.conf.json` 支持 per-platform 覆盖（`tauri > bundle > target` 等可在 `tauri.macos.*` 或平台构建脚本注入）；`identifier` 平台化采用「默认 Windows 标识 + macOS 打包时注入」方案（见 ADR-0006）。
- UTI 声明：Tauri 2 打包器支持 `bundle > fileAssociations`（生成 `CFBundleDocumentTypes`），无需手写 plist。
- 安全路径：复用现有 `is_sensitive_path` seam 做平台分支，不新增框架。
- CI：GitHub Actions 官方 `macos-14`（Apple Silicon）与 `macos-13`（Intel）runner 均可构建双架构 DMG；未签名 DMG 无需额外步骤，产物用 `actions/upload-artifact` 保存。

## 来源

- [PRD-002 macOS 支持 v0.3.0](../prd/PRD-002-macos-support.md)
- [ADR-0005 macOS 平台适配与分发](../adr/0005-macos-distribution.md)
- [ADR-0006 应用标识平台化](../adr/0006-bundle-identifier-platform.md)

## 实施工单

| 工单 | 标题 | 摘要 | 依赖 |
|---|---|---|---|
| [WORK-004-01](WORK-004-01-rust-platform-paths-opened-event.md) | Rust 平台安全路径与 Finder 打开事件 | is_sensitive_path macOS 规则 + `RunEvent::Opened` 解析 + 单实例事件转发 | 无 |
| [WORK-004-02](WORK-004-02-frontend-platform-interaction.md) | 前端平台交互 | Cmd 快捷键 / 文案 / 根节点 / Finder 打开路由 / macOS 设置页 | WORK-004-01 |
| [WORK-004-03](WORK-004-03-tauri-macos-bundle-config.md) | Tauri macOS 打包配置 | identifier 平台化 + DMG target + UTI 文件关联 + 双架构产物 | 无 |
| [WORK-004-04](WORK-004-04-ci-macos-double-arch.md) | CI macOS 双架构构建 | arm64/x64 未签名 DMG Artifact，不发布 | WORK-004-01/02/03 |
| [WORK-004-05](WORK-004-05-docs-gatekeeper-release.md) | 发布文档与 Gatekeeper 指南 | README/设置页教程/真机记录/Pre-release 流程 | WORK-004-04 |

## 串并行安排（主代理调度）

- 第一批（并行）：WORK-004-01（Rust 基础）与 WORK-004-03（打包配置，互不依赖）
- 第二批（串行）：WORK-004-02（前端交互，依赖 01 的事件转发接口）
- 第三批（串行）：WORK-004-04（CI，依赖 01/02/03 的完整应用）
- 第四批（串行）：WORK-004-05（文档收口）
- 每批由独立子代理实施；主代理独立验收，验收不通过返工给子代理；子代理不提交、不推送、不关闭 PLAN。

## 停止条件

- 任一工单导致 `cargo build` 或 `pnpm build` 失败且无法在当日修复 → 停止，返回 PLAN 修正
- WORK-004-01 若发现 Tauri 2 的 `RunEvent::Opened` 与单实例插件转发组合不可行（框架能力与预期不符）→ 停止，先走 ADR 补充决策
- WORK-004-03 若 Tauri 2 不支持平台化 identifier 注入（ADR-0006 备选方案失效）→ 停止，汇报替代方案
- WORK-004-04 若 macOS runner 不可用或双架构构建受限 → 停止，汇报替代方案（如单架构 + 标注）

## 测试与验证

- [ ] 已运行要求的测试
- 测试命令：各 WORK 验证命令；总收口：`cd src-tauri && cargo test`、`pnpm lint`、`pnpm test`、`pnpm build`、`python tools/project_docs.py validate`、`python tools/project_docs.py index check`、macOS CI 双架构产物验证
- 测试结果：

## 文档同步

- [ ] 已更新来源 PRD 或 BUG
- [ ] 已更新受影响项目文档
- [ ] 已更新相关索引

## 收口检查

- [ ] 工单回执完整
- [ ] 实施步骤全部完成
- [ ] 测试通过并记录结果
- [ ] 来源文档状态已更新
- [ ] 受影响文档已更新
- [ ] 索引已同步
