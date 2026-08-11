# WORK-003-04: 批量确认前端测试

## PLAN 来源

[PLAN-003-stable-release-baseline.md](PLAN-003-stable-release-baseline.md)
[ADR-0004 批量输出目录等于输入目录](../adr/0004-batch-output-same-dir.md)

## 目标

按 [ADR-0004](../adr/0004-batch-output-same-dir.md) 实现批量编辑视图的"输出目录 == 输入目录"确认交互：

- 开始处理前检测：输出目录 == 任一待处理图片所在目录 → 弹出警告对话框
- 警告文案明确"原图将被覆盖，此操作不可恢复"
- 用户**二次确认**后才调用 `batch_process_queue`；取消则完全不执行
- 该交互全流程覆盖 Vitest 测试

## 依赖

- WORK-003-02（前端质量门禁基线）

## 允许修改

- `src/components/BatchTab.tsx`（仅新增同目录检测与确认交互，`handleStart` 分流）
- 新增 `src/components/BatchTab.test.tsx`（或并入现有测试文件）
- 确认对话框相关 UI（已有 shadcn `dialog` 则直接复用；缺失则仅新增必要组件）
- 如需要，`src/lib/` 下新增纯函数（如同目录判定）并单测

## 禁止修改

- Rust 端 `batch_process_queue` / `execute_batch_processing` 签名与行为（ADR-0004 明确 Rust 端零改动）
- 其他视图与组件的行为
- 禁止静默允许：无警告直接执行同目录覆盖
- 不新增确认之外的业务功能

## 必须复用

- 现有 UI 组件（`Button`、`Label`、`Input`，shadcn `dialog` 若存在）
- 现有 Vitest + Testing Library 测试设施
- 现有 `batchRunReducer` 状态机与 `handleStart` 流程

## TDD 步骤

1. 先编写失败测试（`BatchTab.test.tsx`）：
   - 输出目录 == 队列图片所在目录 → 点"开始处理"出现警告对话框，且未调用 invoke
   - 警告中确认 → 调用 `batch_process_queue`（mock invoke 断言参数）
   - 警告中取消 → 不调用 invoke，状态不进入 processing
   - 输出目录 != 输入目录 → 无警告直接处理（回归）
2. 运行定向测试确认红
3. 最小实现：同目录检测 + 警告对话框 + 二次确认分流
4. 定向测试转绿，再跑全量前端测试回归

## 验证命令

```bash
pnpm test -- BatchTab
pnpm test
pnpm lint
pnpm build
```

## 通过标准

- [ ] 同目录时警告出现且不直接执行
- [ ] 二次确认后执行、取消后不执行（测试覆盖）
- [ ] `pnpm test` 全量通过
- [ ] `pnpm lint` 零错误、`pnpm build` 成功
- [ ] Rust 端无任何改动（git diff 确认）

## 停止条件

- 实现中发现必须改 Rust 端才能满足 ADR-0004 → 停止，走 ADR 补充决策
- 对话框组件缺失导致需引入新 UI 库 → 停止，汇报（倾向复用 shadcn dialog）

## 下一步

执行完成后运行 verify 模式验证本工单，然后继续 WORK-003-05。
