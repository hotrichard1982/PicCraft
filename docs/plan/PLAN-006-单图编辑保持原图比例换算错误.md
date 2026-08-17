---
id: PLAN-006
title: 单图编辑比例修复与撤销、浏览地址栏实施计划
status: completed
source: BUG-003
topics: [frontend-ui]
created: 2026-08-17
updated: 2026-08-17
---

# PLAN-006 单图编辑比例修复与撤销、浏览地址栏实施计划

## 开发前知识检查
- [x] 已运行 context
- [x] 已阅读分类索引
- [x] 已阅读具体内容文档
- [x] 已记录代码图谱结果
- [x] 已确认框架优先方案

### CLI 推荐索引

`context "浏览模式 地址栏" --topic UI` → docs/design/index.md（空索引）、docs/prd/index.md

### 已阅读内容文档

- docs/bug/BUG-003-单图编辑保持原图比例换算错误.md（本次根因记录）
- docs/plan/plan-index.md、docs/bug/bug-index.md

### 代码图谱结果

- `aspectHeightForWidth` / `aspectWidthForHeight`（src/lib/single-tab-state.ts）：换算纯函数，调用方 3 处均在 SingleTab.tsx。
- `SingleTab.tsx` 换算与 `handleResize` 均用 `img.imageInfo`（原图），裁剪/旋转后不更新 → BUG-003 根因。
- `setTempPath` action 不记录 temp 图尺寸，也不保留上一步 → 撤销需扩展状态。
- `BrowseView.tsx` 无地址栏；`setCurrentFolder`（store）3 个调用方，read_dir 已有目录校验（错误走 loadError 分支）。

### 框架能力与结论
- 结论：全部为前端状态与 UI 改动，不新增依赖。撤销用 reducer 扩展（single-tab-state.ts），地址栏复用 `setCurrentFolder` + `read_dir` 错误分支，无框架绕过。

## 实施工单

### WORK-006-01（Bug 修复）：keepAspect 基于"当前编辑图"尺寸换算
- 允许文件：src/lib/single-tab-state.ts、src/components/SingleTab.tsx、src/components/SingleTab.test.ts
- 步骤：新增纯函数 `currentEditSize`（temp 优先）→ 三处换算 handler 与 `handleResize` 的 Math.min 约束改用 currentEditSize → 回归测试。
- 验证命令：`pnpm vitest run src/components/SingleTab.test.ts`
- 结果：✅ 完成。28 tests passed，含 BUG-003 回归用例（裁剪后换算按 temp 比例）。

### WORK-006-02（功能）：单图编辑"撤销上一步"
- 允许文件：src/lib/single-tab-state.ts、src/components/SingleTab.tsx、src/components/SingleTab.test.ts
- 步骤：ImageState 增加 history 快照栈（setTempPath 追加、loadImage/reset 清空）→ `undoEdit` action → `canUndo` → 右侧面板"撤销"按钮（无编辑禁用，撤销后宽高输入同步回退图尺寸）。
- 验证命令：`pnpm vitest run src/components/SingleTab.test.ts`
- 结果：✅ 完成。撤销一次/连续撤销/无编辑不可撤销均覆盖。

### WORK-006-03（功能）：浏览模式地址栏
- 允许文件：src/views/BrowseView.tsx、src/views/address-bar.test.ts
- 步骤：新增 `addressBarReducer`（纯函数）→ 顶部控制条替换为地址栏（点击进入编辑、Enter/失焦提交、Esc 取消、编辑中显示跳转按钮）→ 提交前 `read_dir` 校验，失败 showError 显示错误信息。
- 验证命令：`pnpm vitest run src/views/address-bar.test.ts`
- 结果：✅ 完成。7 reducer tests passed。

停止条件：需求理解分歧、涉及 Rust 命令改动或架构边界变化时停下汇报。

## 测试与验证
- [x] 已运行要求的测试
- 测试命令：`pnpm test`、`pnpm lint`、`npx tsc -b --noEmit`
- 测试结果：130 tests passed（13 files）；lint 0 error 0 warning；tsc 通过。

## 文档同步
- [x] 已更新来源 PRD 或 BUG（BUG-003 状态 → resolved）
- [x] 已更新受影响项目文档（无受影响文档，改动集中在以上文件）
- [x] 已更新相关索引（plan-index / bug-index 状态列）

## 收口检查
- [x] 工单回执完整（三个工单均记录步骤、验证与结果）
- [x] 实施步骤全部完成
- [x] 测试通过并记录结果
- [x] 来源文档状态已更新
- [x] 受影响文档已更新
- [x] 索引已同步
