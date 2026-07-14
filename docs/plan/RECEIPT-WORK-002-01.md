---
id: RECEIPT-WORK-002-01
work: WORK-002-01
status: completed
created: 2026-07-14
updated: 2026-07-14
---

# RECEIPT-WORK-002-01

- run_id：不可用；当前项目 CLI 未实现 `run` 子命令，本工单按 `start/close` 工作流执行。
- status：实现、自动化回归与 Windows EXE 构建已完成；真实 UI 和仓库既有门禁问题待主 Agent 收口。

## Changed Files

- `src/components/CropCanvas.tsx`
- `src/components/CropCanvas.test.ts`
- `docs/plan/WORK-002-01-crop-overlay-sync.md`
- `docs/plan/RECEIPT-WORK-002-01.md`

## RED Evidence

- 命令：`rtk pnpm vitest run src/components/CropCanvas.test.ts`
- 结果：退出码 1；1 个测试文件失败，4 个测试全部失败。
- 预期原因：四项均报 `TypeError: calculateOverlayRects is not a function`，证明旧生产代码缺少测试要求的统一遮罩坐标计算。

## GREEN Evidence

- 最小实现：新增纯函数 `calculateOverlayRects(stageSize, cropBox)`；初次绘制的 `updateOverlay` 与 React 后续渲染的四个 `Rect` 共用该计算。
- 单文件测试：退出码 0；1 个测试文件通过，4 个测试全部通过。
- 完整测试：`rtk pnpm test` 退出码 0；4 个测试文件通过，34 个测试全部通过。
- 定向 lint：`rtk pnpm exec eslint src/components/CropCanvas.tsx src/components/CropCanvas.test.ts` 退出码 0。
- 前端构建：`rtk pnpm build` 退出码 0；TypeScript 与 Vite 构建成功。
- 文档校验：`rtk python tools/project_docs.py validate` 退出码 0，`broken_links` 为空。

## Checks

- `rtk pnpm lint`：退出码 1；5 个错误、5 个警告均位于本工单禁止修改的既有文件（`FullscreenViewer.tsx`、`ThumbnailGrid.tsx`、`BrowseView.tsx`、`SingleTab.tsx`、`StatusBar.tsx`）。本次两个代码文件的定向 lint 通过。
- `rtk pnpm doctor`：退出码 1；React Doctor 35/100，报告 7 个错误、45 个警告，首要错误位于本工单范围外的 `App.tsx`、`DirTree.tsx` 等既有代码；详细扫描还将为回归测试导出的 `calculateOverlayRects` 记为一条非组件导出警告，受 WORK 允许文件限制未拆分到新生产文件。
- 真实 UI：本执行工单未执行，按任务分工留给主 Agent。

## Build Artifact

- 首次 `rtk pnpm tauri:build` 在 Rust 编译前因 `PATH` 找不到 `cargo` 失败：`cargo metadata ... program not found`。
- 使用 `rtk rustup which cargo` 定位已有 stable 工具链，并仅为重试进程临时前置工具链 `bin` 目录；未安装或修改系统工具链。
- 重试结果：退出码 0；Rust release 编译完成，MSI 与 NSIS bundle 均生成，`piccarft.exe` 已复制到 `dist/`。
- `dist/piccarft.exe`：17,391,104 字节，更新时间 `2026-07-14 10:07:38 +08:00`。
- `src-tauri/target/release/piccarft.exe`：17,391,104 字节，更新时间 `2026-07-14 10:07:38 +08:00`。
- `dist/msi/piccarft_0.1.0_x64_zh-CN.msi`：6,356,992 字节，更新时间 `2026-07-14 10:07:24 +08:00`。
- `dist/nsis/piccarft_0.1.0_x64-setup.exe`：4,155,523 字节，更新时间 `2026-07-14 10:07:36 +08:00`。

## Unresolved Issues

- 主 Agent 仍需执行真实 UI 的“画框 -> 拖动 -> 缩放 -> 调整窗口”验收。
- 仓库全量 lint 与 React Doctor 的既有范围外问题仍未通过；本工单未越权修改。
- React Doctor 对本次纯函数测试导出保留一条 Fast Refresh 维护性警告；定向 ESLint、类型构建与测试均通过。

## Next Prompt

未生成；当前项目 CLI 不支持 `run route`。
