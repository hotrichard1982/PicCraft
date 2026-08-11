---
id: RECEIPT-WORK-003-04
work: WORK-003-04
status: completed
created: 2026-08-11
updated: 2026-08-11
---

# RECEIPT-WORK-003-04

## 范围说明

按 ADR-0004 与 WORK-003-04 实现批量视图"输出目录 == 输入目录"二次确认；主代理额外委派：补 FullscreenViewer reducer、CropCanvas transform reducer、SingleTab 等比尺寸纯逻辑测试（仅做计划列出的最小导出/提取）。shadcn ui 目录无 dialog 组件，按主代理指示复用 `@tauri-apps/plugin-dialog` 已有 `confirm`（项目依赖已有 plugin-dialog，BatchTab 已 import 其 `open`），未新增 UI/依赖，未触发 WORK 停止条件。package.json / 版本号 / doctor 脚本（WORK-003-02 已改）未触碰；Rust 端零改动。

## Changed Files

**新增（4）**
- `src/lib/batch-dir.ts` — 同目录判定纯函数：`normalizeDirPath`（反斜杠统一为 `/`、去尾分隔符、转小写，Windows 语义）、`dirNameOf`（提取文件所在目录）、`isSameDir`（Windows 语义稳健比较）、`needsOverwriteConfirm`（输出目录 == 任一队列图片所在目录，空队列/空输出目录返回 false）
- `src/lib/batch-dir.test.ts` — 14 个测试：正反斜杠混用、大小写不敏感、尾分隔符、前缀相似目录不误判、根目录文件、空队列/空输出目录
- `src/components/BatchTab.test.tsx` — 9 个测试：batchRunReducer（start/setProgress/带 error 追加错误/listenFailed/finish）+ 4 个组件交互用例（见下）
- `src/components/FullscreenViewer.test.ts` — 10 个测试：imageLoadReducer（loadStart/loadSuccess/loadError）+ viewReducer（resize/setScale/setPos/setScaleAndPos 保留与显式 rotation/rotate 90° 累加与 360° 回绕）

**修改（6，均为最小改动叠加在共享工作区既有变更上）**
- `src/components/BatchTab.tsx` — ① 导出 `batchRunReducer` + `BatchRunState`/`BatchRunAction` 类型 ② `handleStart` 在 dispatch start 之前插入 ADR-0004 分流：`needsOverwriteConfirm(queue.paths, outputDir)` 为真时 `await confirm(...)`，取消直接 return（不 invoke、不标记 processing、不更新队列状态），确认后走原流程 ③ 确认文案含 ADR 要求短语"原图将被覆盖，此操作不可恢复"与处理规则（不备份、覆盖前不再提示），`kind: "warning"` ④ 输出目录打开按钮补 `aria-label="选择输出目录"`（测试可达 + a11y）
- `src/components/FullscreenViewer.tsx` — 导出 `imageLoadReducer`/`viewReducer` + 关联类型（组件文件导出加 react-refresh/oxlint disable 注释，照 CropCanvas `calculateOverlayRects` 先例）
- `src/components/CropCanvas.tsx` — `transformReducer`/`TransformState`/`TransformAction` 从组件函数体内上移至模块作用域并导出（同上 disable 先例）
- `src/lib/single-tab-state.ts` — 新增 `aspectHeightForWidth`/`aspectWidthForHeight`（等比换算纯函数，非法输入返回 null）
- `src/components/SingleTab.tsx` — `handleWidthChange`/`handleHeightChange`/`handleAspectToggle` 内联等比计算改调提取函数（行为逐行等价，守卫语义一致）
- `src/components/SingleTab.test.ts` / `src/components/CropCanvas.test.ts` — 追加 aspect 换算 8 个、transformReducer 5 个测试

**未改动**：`package.json`、`pnpm-lock.yaml`、`src-tauri/*`（Cargo.toml / image_ops.rs / tauri.conf.json 的工作区既有变更未触碰）、其他组件行为。

## TDD 证据

### RED

`npx vitest run`（实现前，测试先行）：

```
Test Files  5 failed (5)
     Tests  32 failed | 16 passed (48)
```

- `src/lib/batch-dir.ts` 尚不存在 → `batch-dir.test.ts` 文件级加载失败
- 其余 4 文件 32 个测试因 `batchRunReducer`/`imageLoadReducer`/`viewReducer`/`transformReducer`/`aspectHeightForWidth` 等未导出（`TypeError: xxx is not a function`）失败
- 16 passed 为既有测试（CropCanvas 4 + SingleTab 12），确认回归基线未受测试文件追加影响

### GREEN

定向（5 文件）：**62 passed**（含既有 16，新增 46 全绿）

```
✓ src/components/SingleTab.test.ts      (20 tests)
✓ src/lib/batch-dir.test.ts             (14 tests)
✓ src/components/CropCanvas.test.ts     ( 9 tests)
✓ src/components/FullscreenViewer.test.ts (10 tests)
✓ src/components/BatchTab.test.tsx      ( 9 tests)
```

## 组件交互测试覆盖（WORK-003-04 通过标准）

| 用例 | 断言 |
|---|---|
| 同目录点开始处理 | `confirm` 被调用且文案含"原图将被覆盖，此操作不可恢复"、`kind: "warning"`；`invoke` 未被调用；队列全部仍为 pending |
| 警告中确认 | `invoke` 以 `batch_process_queue` 调用，参数 `paths`（队列全路径）/`outputDir`/`targetWidth: 1000`/`quality: 60` 精确匹配 |
| 警告中取消 | `invoke` 未调用、队列不进入 processing、开始按钮保持可点状态 |
| 异目录（回归） | 无 `confirm` 直接 `invoke` |

测试方式：mock `@tauri-apps/api/core`（invoke/convertFileSrc）、`@tauri-apps/api/event`（listen）、`@tauri-apps/plugin-dialog`（open/confirm）、`@tauri-apps/plugin-store`（load）、`@tauri-apps/plugin-opener`（revealItemInDir）；store 用 `useAppStore.setState` 注入队列项；输出目录经 UI 点击打开按钮（mock open 返回目录）设置，走真实组件路径。

## 验证命令结果

| 命令 | 结果 |
|---|---|
| `pnpm test` | 通过，**7 文件 80 测试**（基线 34 → +46）；stderr 的 `[store] persist lastFolder failed` 为既有非致命行为（jsdom 无 Tauri IPC，与 RECEIPT-WORK-003-02 基线一致） |
| `pnpm lint` | 通过，退出码 0，**0 errors 0 warnings**（reducer 导出均加 `react-refresh/only-export-components` disable 注释，照 CropCanvas `calculateOverlayRects` 既有先例；eslint 配置 `allowConstantExport` 对该形态不豁免，实测确认） |
| `pnpm build` | 通过（tsc -b + vite，658.45 kB chunk > 500 kB 警告为基线既有，非失败） |
| `pnpm doctor`（脚本未改） | 通过，退出码 0；`react-doctor --score` = **54，与 RECEIPT-WORK-003-02 基线完全一致，零新增违规**（新导出未引入 only-export-components 等） |
| `python tools/project_docs.py validate` | 通过，`broken_links: []` |
| git diff 范围 | `src-tauri/` 下 Cargo.toml / image_ops.rs / tauri.conf.json 为共享工作区既有变更（WORK-003-02/03），本次**零触碰**；前端改动仅限 WORK 允许文件 |

## 通过标准核对（WORK-003-04）

- [x] 同目录时警告出现且不直接执行（测试覆盖）
- [x] 二次确认后执行、取消后不执行（测试覆盖；取消不 invoke、队列状态不变）
- [x] `pnpm test` 全量通过（80/80）
- [x] `pnpm lint` 零错误、`pnpm build` 成功
- [x] Rust 端无任何改动（git diff 确认）

## 关键决策

- **复用 plugin-dialog `confirm` 而非 shadcn dialog**：ui 目录无 dialog 组件，WORK 停止条件预设"缺失则停止汇报（倾向复用 shadcn dialog）"；主代理指示优先复用已有 `confirm`（依赖已在、BatchTab 已用同包 `open`），零新 UI/依赖，未触发停止条件。
- **确认插在 `dispatchRun({type:"start"})` 之前**：取消路径天然满足"不 invoke、不改变队列状态"（不进入 processing、不标记队列项）。
- **窗口打开按钮补 aria-label**：打开按钮原无可访问名称（仅图标），测试需经 UI 路径设置输出目录；补 label 同时为 a11y 增强，一行改动。
- **Windows 路径语义为字符串级比较**：队列路径与输出目录均来自真实 FS（read_dir / dialog），形态一致；不做 canonicalize（需真实文件系统，jsdom 不可用，且 Rust 端已有 canonicalize 校验）。大小写不敏感 + 分隔符/尾斜杠规范化覆盖 ADR-0004 要求。

## 风险与未决项

- **真机 UI 需主代理验收**：确认对话框为 Tauri 原生对话框（plugin-dialog），Vitest 以 mock 覆盖交互决策；真实弹窗外观、按钮文案（确认覆盖/取消）与焦点行为需真机 `pnpm tauri dev` 验收。
- **同目录判定粒度**：字符串级比较不解析符号链接/`..`/相对路径；队列与输出目录均来自真实 FS 绝对路径时无实际影响，如有网络盘/符号链接场景需后续加强（超出本工单范围）。
- **reducer 导出姿势**：4 处 reducer 导出均带 disable 注释（组件文件内导出，CropCanvas 先例）；若后续希望彻底消除，可仿 `single-tab-state.ts` 迁至 `src/lib/`，属结构重构非本工单范围。
- 未提交、未推送、未 tag、未关闭 PLAN；共享工作区既有未提交变更未触碰。
