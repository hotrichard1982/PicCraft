---
id: PLAN-007
title: 假扩展名图片修复与预览区顶部工具按钮组实施计划
status: completed
source: BUG-004
topics: [frontend-ui, backend-image]
created: 2026-08-17
updated: 2026-08-17
---

# PLAN-007 假扩展名图片修复与预览区顶部工具按钮组实施计划

## 开发前知识检查
- [x] 已运行 context
- [x] 已阅读分类索引
- [x] 已阅读具体内容文档
- [x] 已记录代码图谱结果
- [x] 已确认框架优先方案

### CLI 推荐索引

`context "浏览模式 地址栏" --topic UI` → docs/design/index.md（空索引）；BUG 链路走 docs/bug/

### 已阅读内容文档

- docs/bug/BUG-004-假扩展名图片加载失败.md
- docs/plan/PLAN-006（撤销/地址栏上一轮实现）

### 代码图谱结果

- `get_image_info`（src-tauri/src/image_ops.rs:90）：`image::image_dimensions` 按扩展名解码 → 假 PNG 报 Invalid PNG signature。`with_guessed_format` 内容嗅探已验证可修。
- `CropCanvas.tsx`：已有预览区顶部浮动工具栏（水平/垂直翻转、双向 90° 旋转、应用），hover 显示；`transformReducer` 纯函数已有。
- `SingleTab.tsx`：撤销/重置在右侧面板 Save 区。

### 框架能力与结论
- 结论：Rust 侧换用 `image::ImageReader::open().with_guessed_format()`（image crate 内建内容嗅探，非自造轮子）；UI 侧复用 CropCanvas 既有浮动工具栏骨架，把撤销/重置按钮合并进去（lucide 图标 + 既有样式），不新增依赖。

## 实施工单

- WORK-007-01（Bug 修复）：`get_image_info` 按内容识别格式。允许文件：src-tauri/src/image_ops.rs。验证：`cargo test` 新增"假 PNG（JPEG 内容 + .png 扩展名）"用例 + 既有测试不回归。
  - ✅ 完成：改用 `ImageReader::open().with_guessed_format()` 内容嗅探；新增 2 个测试（假扩展名 / 真 PNG 回归），cargo test 78 passed。
- WORK-007-02（UI）：撤销/重置合并进预览区顶部工具按钮组（翻转/旋转按钮旁，带 tooltip，工具栏常驻可见）。允许文件：src/components/CropCanvas.tsx、src/components/SingleTab.tsx。验证：`pnpm test` + `pnpm lint`。
  - ✅ 完成：CropCanvas 新增 `toolbarExtra` 插槽，工具栏由 hover 显隐改为常驻；SingleTab 注入 撤销/重做/重置 按钮组（含分隔线、禁用态、tooltip），并加 Ctrl/Cmd+Z、Ctrl+Y / Ctrl+Shift+Z 快捷键；新增 redoStack 重做栈（新编辑清空重做栈）。右侧面板去掉撤销/重置，"覆盖原图"恢复全宽。

停止条件：需要动 read_dir / 缩略图等其它命令的格式识别逻辑，或按钮组交互需求变化时停下汇报。

## 测试与验证
- [x] 已运行要求的测试
- 测试命令：`cargo test`、`pnpm test`、`pnpm lint`、`npx tsc -b --noEmit`
- 测试结果：cargo 78 passed；前端 133 passed（13 files）；lint 0 错误；tsc 通过。

## 文档同步
- [x] 已更新来源 PRD 或 BUG（BUG-004 → resolved）
- [x] 已更新受影响项目文档（无受影响文档）
- [x] 已更新相关索引（bug-index BUG-004 → 已解决）

## 收口检查
- [x] 工单回执完整
- [x] 实施步骤全部完成
- [x] 测试通过并记录结果
- [x] 来源文档状态已更新
- [x] 受影响文档已更新
- [x] 索引已同步
