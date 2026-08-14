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

## 根因定案（2026-08-14，本地复现）

朋友提供 `piccarft.log` 后先疑为 BMP 编码断言（2026-08-13 防御性修复，见下）；**2026-08-14 本地精确复现，确认真根因为 CMYK JPEG → 缩略图 PNG 编码断言**（见上文「根因分析」，复现证据与真机日志逐字节一致）：

```
image-0.25.10/src/io/encoder.rs:115:17:
Invalid buffer length: expected 55890 got 74520 for 207x90 image
```

- **复现**：PIL 生成 207x90 CMYK JPEG → `make_thumbnail(path, 207)` → 本地 catch_unwind 捕获**相同断言 panic**（Windows 亦可复现）。
- **为什么 2d3bebb 的复现矩阵全过**：image crate 无法编码 CMYK JPEG，矩阵未覆盖该输入；且 BMP 编码只出现在保存操作（选文件夹不触发），BMP 路径与崩溃场景无关。
- **BMP 防御修复保留**（2d3bebb，`save_image`/`process_single_batch`/`save_to_temp` 三处 BMP 分支显式 `to_rgb8()`）：无害的附加防御，与 CMYK 修复互补；其 2 个回归测试保留。
