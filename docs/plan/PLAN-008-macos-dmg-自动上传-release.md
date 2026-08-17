---
id: PLAN-008
title: macOS DMG 自动上传 GitHub Release
status: completed
source: 发布流程改进
topics: [macos, release, ci, distribution]
created: 2026-08-17
updated: 2026-08-17
---

# PLAN-008 macOS DMG 自动上传 GitHub Release

## 目标

在日期 RC tag 推送后，macOS arm64 与 x64 CI 在完成 DMG 构建和现有架构、Info.plist 校验后，自动附加各自 DMG 到该 tag 对应的正式 GitHub Release。

## 开发前知识检查
- [x] 已运行 context：`release-build`，主文档为 `docs/guide/index.md`
- [x] 已阅读分类索引：`docs/index.md`、`docs/technology/index.md`、`docs/guide/index.md`
- [x] 已阅读具体内容文档：README、ADR-0005、WORK-004-05
- [x] 已记录代码图谱结果：`.github/workflows/ci.yml` 的 macOS 矩阵在 DMG 校验后上传 Artifact；`scripts/release.mjs` 先推 tag 再创建 Release
- [x] 已确认框架优先方案：复用 GitHub Actions runner 已有的 `gh` CLI 和 `GITHUB_TOKEN`，不引入 Action 或第三方依赖

### CLI 推荐索引
- `docs/guide/index.md`

### 已阅读内容文档
- `README.md`
- `docs/adr/0005-macos-distribution.md`
- `docs/plan/WORK-004-05-docs-gatekeeper-release.md`

### 代码图谱结果
- macOS arm64/x64 在同一 matrix 中完成构建与 DMG 内容校验，随后上传 Artifact。
- Windows 发布脚本推送 tag 后才创建 GitHub Release；macOS 上传必须等待同名 Release 出现。

### 框架能力与结论
- 结论：使用 GitHub Actions job 的 `contents: write` 权限和预装 `gh release upload`；仅匹配日期 RC tag，上传步骤重试等待 Release 创建完成。

## 实施工单
- WORK-008-01：更新 CI、发布脚本与分发文档；允许 `.github/workflows/ci.yml`、`scripts/release.mjs`、README、ADR-0005、PLAN-008、plan-index；验证 YAML、脚本语法、文档链接；非日期 RC tag、Release 未创建或 DMG 校验失败时停止。

## 测试与验证
- [x] 已运行要求的测试
- 测试命令：`bash -n`（Release 上传脚本）、`node --check scripts/release.mjs`、`python tools/project_docs.py validate`、`python tools/project_docs.py index check`、PyYAML 解析、`git diff --check`
- 测试结果：全部通过。上传步骤只会在日期 RC tag push 时运行；每个矩阵 job 等待同名 Release 最多 5 分钟，发现后以 `--clobber` 上传已校验的本架构 DMG。

## 文档同步
- [x] 已更新来源 PRD 或 BUG（不适用：发布流程改进）
- [x] 已更新受影响项目文档（README、ADR-0005）
- [x] 已更新相关索引（plan-index）

## 收口检查
- [x] 工单回执完整（本计划记录实施与验证）
- [x] 实施步骤全部完成
- [x] 测试通过并记录结果
- [x] 来源文档状态已更新（不适用）
- [x] 受影响文档已更新
- [x] 索引已同步
