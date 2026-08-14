---
id: BUG-002
title: macOS 选择目录（Documents）后应用崩溃
status: resolved
topics: [macos, crash, webview, image]
created: 2026-08-12
updated: 2026-08-14
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

**结论（2026-08-12 已定案，朋友终端复现拿到 panic 消息）：**

```
thread 'main' panicked at image-0.25.10/src/io/encoder.rs:115:17:
assertion `left == right` failed: Invalid buffer length: expected 55890 got 74520 for 207x90 image
```

**这不是 wry/tauri 的 bug，而是项目自身图片编码链路的颜色类型错配**，完整链路：

1. 缩略图 `make_thumbnail` 对 JPEG 走快速路径 `make_jpeg_thumbnail_fast`（jpeg-decoder 0.3.2）。
2. `jpeg-decoder` 对 **CMYK 色彩空间 JPEG** 解码输出 **4 字节/像素（RGBA）**数据。
3. `image::RgbImage::from_raw` 的长度检查是**宽松的**（`min_len <= len` 即放行，非精确相等），RGBA 数据（74520）被当成 RGB（55890）包装成功——**Rgb8 图像持有 RGBA 缓冲区，不变量破坏**。
4. 后续 `write_to(Png)` 编码：PNG 编码器按 `Rgb8` 计算期望长度 55890，实际缓冲区 74520 → **断言 panic**。
5. `make_thumbnail` 是同步 command，tauri v2 在主线程执行；panic 沿 `start_task`（extern "C" FFI 边界）无法 unwind → **SIGABRT**。

选 `~/Documents` 触发：Documents 内含 CMYK JPEG 图片（常见于设计稿、打印素材），缩略图加载即崩溃。**Windows 同样受影响**（任何含 CMYK JPEG 的目录）。

此前怀疑的 wry `start_task` 内部 unwrap、asset 协议、内存压力均为表象——panic 确实发生在 `start_task` 调用链上，但源头是项目代码传入的图片数据。

### 修复

`src-tauri/src/image_ops.rs` `make_jpeg_thumbnail_fast`：`RgbImage::from_raw` 前**显式校验像素长度** `pixels.len() == w*h*3`；不匹配（CMYK 等非 RGB 输出）时**回退整图解码** `make_thumbnail_fallback`（`image::open` 能正确处理 CMYK → RGB 转换）。

另按用户要求升级 `tauri 2.11.2 → 2.11.5`（不直接修复本 bug，作为常规依赖维护）。

### 回归测试

`test_bug002_cmyk_jpeg_thumbnail_no_panic`：内嵌 207x90 CMYK JPEG（PIL 生成），断言 `make_thumbnail` 不 panic 且输出合法 PNG。修复前该测试在 `image encoder.rs:115` 复现崩溃（与真机一致）。

## 影响与风险

- 严重程度：高（真机必现崩溃，阻塞 macOS 可用性验收；Windows 同样受影响）。
- 数据影响：崩溃前无写操作，无数据损坏风险。
- 修复风险：低；仅 `make_jpeg_thumbnail_fast` 增加长度校验与回退，不涉及架构/依赖/权限变更。

## 目标

1. ✅ 定位 panic 精确行号（朋友终端复现，`image encoder.rs:115`）。
2. ✅ 修复崩溃：`make_jpeg_thumbnail_fast` 显式校验像素长度，非 RGB 输出回退整图解码。
3. ⏳ macOS 真机复验（新 DMG 待朋友确认）。

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
