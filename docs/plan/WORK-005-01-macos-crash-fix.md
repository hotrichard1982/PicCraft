---
id: WORK-005-01
title: 崩溃取证与修复实施
status: completed
source: PLAN-005 / BUG-002
topics: [macos, crash, image]
created: 2026-08-12
updated: 2026-08-13
---

# WORK-005-01 崩溃取证与修复实施

## 目标

1. 拿到 Rust panic message（含精确行号），确定崩溃点。
2. 按证据实施修复。
3. Windows 全量回归 + macOS 真机复验。

## 取证结果（2026-08-13，已取得决定性证据）

朋友提供 `piccarft.log`：

```
thread 'main' panicked at .../image-0.25.10/src/io/encoder.rs:115:17:
assertion `left == right` failed: Invalid buffer length: expected 55890 got 74520 for 207x90 image
```

- 断言来源：**image-0.25.10 BMP encoder**（`bmp/encoder.rs:71`，经 `#[track_caller]` 显示为调用点 `io/encoder.rs:115`）：`expected 55890 = 207×90×3（Rgb8）`，`got 74520 = 207×90×4（RGBA）`——BMP 编码时 color 与 buffer 长度不匹配。
- 传播路径：主线程（macOS Tauri IPC/asset 经 WKWebView scheme handler `start_task`）→ Rust panic 跨 FFI → SIGABRT。`.ips` 的 `start_task` 栈是传播路径，非根因；TCC/内存是背景。
- 排除：项目 BMP 编码路径均为 `img.save()`（DynamicImage 自洽）；复现矩阵（Windows x64 / macOS arm64 / macOS x64-Rosetta、全 color、resize 尺寸矩阵、真实 24/32/8-bit 调色板 BMP）全部通过。指向 image 0.25.10 特定输入（疑似异常图片）下 DynamicImage 内部状态异常。

## 修复（已实施，防御性）

- `src-tauri/src/image_ops.rs` 三处 BMP 编码路径显式 `to_rgb8()`：`save_image` bmp 分支、`process_single_batch` bmp 分支、`save_to_temp`。
- 新增 2 个回归测试：`test_save_bmp_rgba_source_ok`、`test_save_to_temp_bmp_rgba_ok`（RGBA 源 → BMP roundtrip）。
- 验证：`cargo test --locked` **74 passed**；`cargo check --locked` 通过；`git diff --check` 通过。
- 未升级 tauri/wry（原 PLAN 路径 A 基于错误根因，已放弃）；未改大图加载方式（路径 B 同理）。

## 回归与复验

- [x] `cargo test --locked` 74 passed（Windows 本地）
- [x] `pnpm test` 115 通过（前端无改动，回归）
- [ ] 朋友真机复验：新 DMG 复测 `~/Documents` 场景（待新 DMG 构建后交付）

## 风险与回滚

- 防御性修复不改变正常输入行为（RGBA→BMP 显式转 RGB 输出，与 image 自动转换等价）；回滚 = revert 提交。
- 若真机仍复现：需要异常样例图 + 新 `piccarft.log`，或升级 image crate 观察上游修复。
