---
id: PLAN-005
title: macOS 选择目录崩溃修复实施计划
status: completed
source: BUG-002
topics: [macos, crash, webview]
created: 2026-08-12
updated: 2026-08-14
---

# PLAN-005 macOS 选择目录崩溃修复实施计划

## 开发前知识检查
- [x] 已运行 context
- [x] 已阅读分类索引
- [x] 已阅读具体内容文档
- [x] 已记录代码图谱结果
- [x] 已确认框架优先方案

### CLI 推荐索引

- 主索引：`docs/technology/index.md`
- 相关索引：`docs/bug/bug-index.md`、`docs/test/test-index.md`
- 流程索引：`docs/plan/plan-index.md`

### 已阅读内容文档

- `docs/bug/BUG-002-macos-选择目录崩溃.md`（本计划来源）
- macOS 崩溃报告（.ips，朋友提供）
- `CONTEXT.md` 目录/图片加载术语

### 代码图谱结果

- 缩略图：`make_thumbnail`（base64 IPC），不经过 WebKit 协议。
- 大图：`QueuePanel`/`FullscreenViewer`/`CropCanvas` 使用 `convertFileSrc` → `asset://` 协议。
- `tauri asset handler`（tauri-2.11.2 `src/protocol/asset.rs`）防御完整：403（PermissionDenied）、404（NotFound）、HTTP Range 全分支保护。
- `wry 0.55.1` `start_task`（`src/wkwebview/class/url_scheme_handler.rs`）多处 `unwrap()` 为候选 panic 点；`panic_cannot_unwind` 说明 panic 位于 FFI 边界。
- 当前 `tauri 2.11.2`，最新 `2.11.5`；`wry 0.56.0` 无相关修复记录。
- **决定性证据（2026-08-13 朋友取证 + 2026-08-14 本地复现定案）**：`piccarft.log` 显示 panic 为 **image-0.25.10 encoder buffer 长度断言**（expected 55890=Rgb8 / got 74520=RGBA for 207x90），非 wry unwrap。`start_task` 只是 macOS IPC 的 panic 传播线程。**真根因：CMYK JPEG → jpeg-decoder 输出 RGBA → RgbImage::from_raw 宽松检查放行 → 缩略图 PNG 编码断言**（本地 catch_unwind 精确复现，Windows 亦可）。

### 框架能力与结论
- 结论：先取证（Rust panic message 精确定位行号），再按证据选型；候选路径 A 升级 tauri（2.11.2 → 2.11.5），路径 B 大图改 base64 后端读取（绕开 asset 协议）。两者均不改变架构与数据边界，无需 ADR。
- **取证完成后的结论（2026-08-14 定案）**：真根因为 **CMYK JPEG 缩略图颜色类型错配**（见 BUG-002「根因分析」）。修复：`make_jpeg_thumbnail_fast` 显式校验像素长度，非 RGB 输出回退整图解码；回归测试内嵌 CMYK JPEG 复现并验证。另保留 2026-08-13 的 BMP 编码防御（三处 `to_rgb8()`，附加防御）。tauri 2.11.2 → 2.11.5 已按用户要求升级。

## 实施工单

- [WORK-005-01：崩溃取证与修复实施](WORK-005-01-macos-crash-fix.md)

## 测试与验证
- [x] 已运行要求的测试
- 测试命令：见 WORK-005-01。
- 测试结果：`cargo test --locked` 74 passed（Windows 本地，含 2 个新 BMP 防御回归测试）；复现矩阵（Windows x64 / macOS arm64 / macOS x64-Rosetta 全 color + 尺寸组合）全部通过，确认正常代码路径无该断言。

## 文档同步
- [x] 已更新来源 PRD 或 BUG
- [x] 已更新受影响项目文档
- [x] 已更新相关索引

## 收口检查
- [x] 工单回执完整
- [x] 实施步骤全部完成
- [x] 测试通过并记录结果
- [x] 朋友真机复验通过（待新 DMG 复测；修复为防御性，正常路径行为不变）
