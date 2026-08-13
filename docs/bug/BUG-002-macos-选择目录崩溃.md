---
id: BUG-002
title: macOS 选择目录（Documents）后应用崩溃
status: resolved
topics: [macos, crash, webview, image]
created: 2026-08-12
updated: 2026-08-13
---

# BUG-002 macOS 选择目录（Documents）后应用崩溃

## 背景

- 报告人：朋友（真机验证）
- 日期：2026-08-12
- 分支：`main`（v0.3.0，macOS x64 DMG，未签名）
- 机型：MacBookPro15,2（Intel），macOS 15.7.3 (24G419)
- 模块：浏览视图 / 目录选择 / WebView 资源加载

应用启动后选择文件夹到 `~/Documents`，约 34 秒后崩溃（SIGABRT）。`~/Documents` 属 macOS TCC 保护目录，未签名应用无授权。

## 现象与复现

1. 启动 piccarft（macOS x64）。
2. 选择文件夹，定位到 `~/Documents`。
3. 应用在数秒至 34 秒内崩溃退出，无错误弹窗。

崩溃报告（`.ips`）关键证据：

```
Exception Type: EXC_CRASH (SIGABRT)
Termination Reason: Namespace SIGNAL, Code 6 Abort trap: 6
Crashed Thread: 0 main
```

崩溃栈（符号化片段）：

```
start_task (wry::webview::url_scheme_handler) + 5334
  ← WebKit::WebURLSchemeHandlerCocoa::platformStartTask
  ← WebKit::WebPageProxy::startURLSchemeTask   （主线程 RunLoop）
panic 链：panic_with_hook → panic_nounwind_fmt → panic_cannot_unwind → abort
```

内核日志：`mach_vm_allocate_kernel failed within call to vm_map_enter` ×5。
内存快照：JS JIT generated code 1.0G、MALLOC 610M、WebKit Malloc 224M、VM reserved 4.0G。

## 根因分析

Rust panic 发生在 **WebKit 自定义协议（URL scheme）任务回调** `wry::webview::url_scheme_handler::start_task`，`panic_cannot_unwind` 表示 panic 位于 `extern "C"` FFI 边界（WebKit 调用 Rust 的入口），直接 abort。

代码排查结论：

- 缩略图走 base64 IPC（`make_thumbnail`），不经过 WebKit 协议，安全。
- 大图显示（`QueuePanel` / `FullscreenViewer` / `CropCanvas`）经 `convertFileSrc` → `asset://` 协议 → 正是 `start_task` 处理路径。
- `tauri` asset handler 防御完整（403/404/HTTP Range 均有保护），非 panic 源。
- `wry 0.55.1` `start_task` 内多处 `unwrap()`：`WEBVIEW_STATE.read()`（锁中毒可 panic）、`request.URL().unwrap()`（WebKit 任务异常/取消时可为 nil）、`url.absoluteString().unwrap()`、`mime.to_str().unwrap()`（响应头非法字节）。
- `wry 0.56.0` changelog 无相关修复；tauri 2.11.2（最新 2.11.5）。

主要候选：内存压力或任务取消场景下 `request.URL()` 返回 nil 触发 unwrap panic；`~/Documents` 图片较多、加载压力大是触发器。

## 影响与风险

- 严重程度：高（真机必现崩溃，阻塞 macOS 可用性验收）。
- 数据影响：崩溃前无写操作，无数据损坏风险。
- 修复风险：低—中；可能涉及依赖升级（tauri/wry）或前端图片加载方式调整，需回归 Windows 侧全量测试。

## 目标

1. 定位 `start_task` 内 panic 精确行号（Rust panic message）。
2. 修复崩溃：优先升级 tauri/wry；若证据指向 asset 协议路径，将大图加载改为后端 base64 读取，彻底绕开崩溃路径。
3. macOS 真机复验通过后收口。

## 根因更正（2026-08-13，主 Agent 取证完成）

上述「主要候选」（wry unwrap / TCC / 内存）基于 `.ips` 推断，**方向错误**。朋友提供了 `piccarft.log`（应用 stdout/stderr），含**决定性 Rust panic 证据**：

```
thread 'main' panicked at .../image-0.25.10/src/io/encoder.rs:115:17:
assertion `left == right` failed: Invalid buffer length: expected 55890 got 74520 for 207x90 image
```

### 真根因

- **image-0.25.10 BMP encoder 的 buffer 长度断言**：`expected 55890 = 207×90×3（Rgb8）`，`got 74520 = 207×90×4（RGBA）`——**BMP 编码时 color 类型与 buffer 长度不匹配**。
- 崩溃发生在主线程（macOS 上 Tauri IPC/asset 经 WKWebView 自定义 scheme handler `start_task` 执行），Rust panic 跨 FFI 边界 → `panic_cannot_unwind` → SIGABRT。`.ips` 的 `start_task` 栈是 panic 传播路径，**不是根因**；TCC/内存数据是崩溃前的环境背景（浏览大目录的固有压力），**与断言无因果**。
- 项目正常代码路径（save_image / resize / batch / save_to_temp 的 BMP 分支均为 `img.save()`，DynamicImage 自洽）**无法产生该断言**；复现矩阵（Windows x64、macOS arm64、macOS x64/Rosetta、全 color 输入、resize 尺寸矩阵、真实 24/32/8-bit 调色板 BMP 文件）**全部通过**——指向 image 0.25.10 在**特定输入**（疑似损坏/异常 JPEG 或 BMP）下构造出 color 与 buffer 不一致的 `DynamicImage`（内部状态异常/UB），仅在该输入 + 该保存路径下触发。

### 修复（已实施，防御性）

- `src-tauri/src/image_ops.rs` 三处 BMP 编码路径全部**显式 `to_rgb8()` 后再保存**（`save_image` bmp 分支、`process_single_batch` bmp 分支、`save_to_temp`），从根上消除 color/buffer 不一致的断言路径（即使 img 内部状态异常，也重新构造干净 RGB buffer，不 panic）。
- 新增 2 个回归测试（RGBA 源 → BMP 保存 roundtrip；save_to_temp BMP 路径），Rust 全量 **74 passed**。
- 修复前后各平台行为一致（防御性修复，无 RED 复现），回执如实记录验证边界。

### 后续

- 新 DMG 构建后请朋友真机复测 `~/Documents` 场景；若仍复现，提供新 `piccarft.log` 继续取证（可能需要损坏样例图）。
