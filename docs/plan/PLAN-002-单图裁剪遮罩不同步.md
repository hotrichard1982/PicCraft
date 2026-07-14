---
id: PLAN-002
title: 单图裁剪遮罩不同步实施计划
status: implementing
source: BUG-001
topics: [frontend-ui, testing]
created: 2026-07-14
updated: 2026-07-14
---

# PLAN-002 单图裁剪遮罩不同步实施计划

## 开发前知识检查
- [x] 已运行 context
- [x] 已阅读分类索引
- [x] 已阅读具体内容文档
- [x] 已记录代码图谱结果
- [x] 已确认框架优先方案

### CLI 推荐索引

- 主索引：`docs/design/index.md`
- 相关索引：`docs/technology/index.md`、`docs/prd/index.md`
- 流程索引：`docs/bug/bug-index.md`、`docs/plan/plan-index.md`、`docs/test/test-index.md`

### 已阅读内容文档

- `docs/bug/BUG-001-单图裁剪遮罩不同步.md`
- `docs/technology/index.md`
- `docs/test/test-index.md`
- `CONTEXT.md` 中单图编辑与裁剪术语

### 代码图谱结果

- `CropCanvas` 仅由 `SingleTab` 调用，修复影响面局限于单图编辑预览。
- `updateOverlay` 只在首次画框的鼠标移动流程调用。
- `handleDragEnd`、`handleTransformEnd` 和容器缩放没有同步遮罩坐标。
- 当前没有覆盖 `CropCanvas` 遮罩坐标的自动化测试。

### 框架能力与结论
- 结论：复用 React 状态更新、Konva 现有节点和 Vitest；不新增或替换框架，不修改架构、数据、权限或依赖，无需 ADR。

## 实施工单

- [WORK-002-01：裁剪遮罩坐标同步](WORK-002-01-crop-overlay-sync.md)

## 测试与验证
- [ ] 已运行要求的测试
- 测试命令：见 WORK-002-01。
- 测试结果：待实施后填写。

## 文档同步
- [ ] 已更新来源 PRD 或 BUG
- [ ] 已更新受影响项目文档
- [ ] 已更新相关索引

## 收口检查
- [ ] 工单回执完整
- [ ] 实施步骤全部完成
- [ ] 测试通过并记录结果
- [ ] 来源文档状态已更新
- [ ] 受影响文档已更新
- [ ] 索引已同步
