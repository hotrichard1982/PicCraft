---
id: PLAN-009
title: 批量处理界面增加格式转换功能
status: completed
source: PRD-001
topics: [batch, frontend-ui, backend-image, format]
created: 2026-08-18
updated: 2026-08-18
---

# PLAN-009 批量处理界面增加格式转换功能

## 开发前知识检查
- [x] 已运行 context：`release-build` 主文档 `docs/guide/index.md`
- [x] 已阅读分类索引：`docs/index.md`、`docs/technology/index.md`、`docs/prd/index.md`
- [x] 已阅读具体内容文档：PRD-001、ADR-0004、README 批量处理章节
- [x] 已记录代码图谱结果：`batch_process`/`batch_process_queue` 走 `execute_batch_processing` → `process_single_batch`（按输入扩展名编码）；输出命名 `unique_batch_name`（保留原扩展名）；前端 `BatchTab.tsx` 传 outputDir/targetWidth/quality 调 `batch_process_queue`
- [x] 已确认框架优先方案：复用现有批量命令与编码分支，不引入新依赖；格式选择用现有 Button 分段单选

### CLI 推荐索引
- `docs/guide/index.md`

### 已阅读内容文档
- `docs/prd/PRD-001-v0.2-stable-release-baseline.md`
- `docs/adr/0004-batch-output-same-dir.md`
- `src/components/BatchTab.tsx`、`src/components/BatchTab.test.tsx`
- `src-tauri/src/image_ops.rs`（batch 相关）

### 代码图谱结果
- `batch_process`（image_ops.rs:392）、`batch_process_queue`（image_ops.rs:425）→ `execute_batch_processing` → `process_single_batch`
- `unique_batch_name`（image_ops.rs:363）按输入文件名生成唯一输出名
- 前端 `handleStart`（BatchTab.tsx:114）调 `batch_process_queue`，参数 paths/outputDir/targetWidth/quality

### 框架能力与结论
- 结论：后端给两个 batch 命令加 `output_format: String`；为空时保持原格式（现状），否则按目标格式归一化输出扩展名并编码（JPEG 用质量、BMP 走 `to_rgb8()` 防御、PNG/WebP 直接保存）。前端 BatchTab 加分段单选按钮组并随 invoke 传参。原地转换生成新扩展名文件，保留原文件（用户已确认）。

## 实施工单
- WORK-009-01：批次格式转换功能。允许文件：`src-tauri/src/image_ops.rs`、`src/components/BatchTab.tsx`、`src/components/BatchTab.test.tsx`、`docs/plan/PLAN-009-*.md`、`docs/plan/plan-index.md`。步骤：改造 `unique_batch_name` 接收目标扩展名与 `process_single_batch` 接收 output_format → batch 命令加参数 → 前端按钮组与传参 → 补/更测试。验证：`cargo test --locked`、`pnpm test`、`pnpm build`。停止：出现 ADR-0004 覆盖语义变化或需要删除原文件时停下汇报（本次不删除原文件）。

## 测试与验证
- [x] 已运行要求的测试
- 测试命令：`cargo test --locked`、`pnpm test`、`pnpm lint`、`pnpm build`、`python tools/project_docs.py validate`
- 测试结果：Rust 85 passed（+7 转换/命名用例）；前端 135 passed（+1 格式选择用例）；lint / build / validate 全部通过

## 文档同步
- [x] 已更新来源 PRD 或 BUG（PRD-001 未覆盖格式转换，功能细目记录于本 PLAN）
- [x] 已更新受影响项目文档（README 批量处理章节）
- [x] 已更新相关索引（plan-index）

## 收口检查
- [x] 工单回执完整（本 PLAN 记录实施与验证）
- [x] 实施步骤全部完成
- [x] 测试通过并记录结果
- [x] 来源文档状态已更新
- [x] 受影响文档已更新
- [x] 索引已同步
