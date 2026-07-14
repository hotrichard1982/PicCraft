---
id: WORK-002-01
title: 裁剪遮罩坐标同步
status: completed
source: PLAN-002
bug: BUG-001
risk: low
verification: direct
created: 2026-07-14
updated: 2026-07-14
receipt: docs/plan/RECEIPT-WORK-002-01.md
---

# WORK-002-01 裁剪遮罩坐标同步

## 目标

修复单图编辑预览区中裁剪框移动、缩放或画布适配后，半透明遮罩透亮区域仍停留在旧坐标的问题，并重新构建 Windows EXE。

## 依赖与风险

- 来源：[BUG-001](../bug/BUG-001-单图裁剪遮罩不同步.md)
- 依赖：无。
- 风险：低；仅调整前端 Konva 遮罩坐标同步。
- 验证路由：`direct`，由执行者运行自动化验证，再由规划/验收 Agent 复核证据。

## 允许文件

- `src/components/CropCanvas.tsx`
- `src/components/CropCanvas.test.ts`（新增）
- `docs/bug/BUG-001-单图裁剪遮罩不同步.md`
- `docs/bug/bug-index.md`
- `docs/plan/PLAN-002-单图裁剪遮罩不同步.md`
- `docs/plan/WORK-002-01-crop-overlay-sync.md`
- `docs/plan/RECEIPT-WORK-002-01.md`（新增）
- `docs/plan/ACCEPTANCE-WORK-002-01.md`（新增）
- `docs/plan/plan-index.md`
- `docs/test/test-index.md`
- 构建产物：`dist/piccarft.exe`、`src-tauri/target/release/**`

## 禁止文件与行为

- 禁止修改 `src-tauri/src/**`、`src/store/**`、`src/components/SingleTab.tsx` 或其他产品代码。
- 禁止新增、替换或升级依赖。
- 禁止改变实际裁剪坐标、图片处理、保存或变换行为。
- 禁止顺手重构其他 Konva 交互。

## 必须复用

- 现有 `CropRect`、`stageSize`、`scale`、`offsetX/offsetY` 数据。
- 现有 `updateOverlay` 或等价的单一遮罩坐标计算。
- 现有 Vitest，不引入 Canvas 测试依赖。

## TDD 步骤

1. RED：新增 `CropCanvas.test.ts`，针对真实导出的遮罩坐标计算验证初始位置、移动后位置、缩放后尺寸和画布尺寸变化；在生产实现不存在时运行并确认测试按预期失败。
2. GREEN：在 `CropCanvas.tsx` 中加入最小、纯粹的遮罩坐标计算，并让初次画框与 React 后续渲染共用它；确保 `cropRect`、`scale`、偏移或舞台尺寸变化时四块遮罩都会更新。
3. REFACTOR：仅删除已经被统一计算替代的重复坐标表达式，保持拖拽、Transformer 和初次画框流程不变。
4. 回归：运行单文件测试、完整前端测试、lint、TypeScript/Vite 构建、React Doctor 和文档校验。
5. 真实 UI：使用 `public/logo.png` 重复“画框 -> 拖动 -> 缩放”并确认遮罩透亮区域始终与红框重合。
6. 发布构建：运行项目现有 Tauri 构建脚本并核对 EXE 的路径、大小和更新时间。

## 验证命令

```powershell
pnpm vitest run src/components/CropCanvas.test.ts
pnpm test
pnpm lint
pnpm build
pnpm doctor
python tools/project_docs.py validate
pnpm tauri:build
```

## 通过标准

- [x] 回归测试在旧实现上按预期失败，并记录 RED 证据。
- [x] 单文件测试与完整前端测试全部通过。
- [ ] `pnpm lint`、`pnpm build`、React Doctor 无阻断问题。
- [ ] 真实 UI 中拖动、缩放裁剪框后遮罩与红框重合。
- [x] `project_docs.py validate` 无断链。
- [x] 新 EXE 存在且更新时间属于本次构建。
- [x] 变更严格限制在允许范围。

## 停止条件

- 需要修改禁止文件或 Rust 图片处理逻辑。
- 需要新增 Canvas 模拟库或其他依赖。
- 回归测试无法在现有 Vitest/jsdom 中表达纯坐标行为。
- 修复导致裁剪坐标、拖拽或 Transformer 现有行为变化。

## 回执

实施完成后写入 `docs/plan/RECEIPT-WORK-002-01.md`，记录 RED/GREEN 证据、验证结果、真实 UI 结果、构建产物和未解决问题。
