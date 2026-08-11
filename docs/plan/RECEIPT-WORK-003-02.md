---
id: RECEIPT-WORK-003-02
work: WORK-003-02
status: completed
created: 2026-08-11
updated: 2026-08-11
---

# RECEIPT-WORK-003-02

## 质量门禁前后对比（基线取自 RECEIPT-WORK-003-01 并于实施前复跑确认）

| 命令 | 基线（红） | 结果（绿） |
|---|---|---|
| `pnpm lint` | 失败，11 problems（5 errors + 6 warnings）：set-state-in-effect ×3（FullscreenViewer:218 / ThumbnailGrid:140 / BrowseView:52）、refs-in-render ×2（ThumbnailGrid:270:34）、react-refresh only-export-components ×3（SingleTab ×2 / StatusBar ×1）、exhaustive-deps ×3（ThumbnailGrid:136 / BrowseView:46 / BrowseView:56） | 通过，退出码 0，0 problems |
| `pnpm test` | 通过，4 文件 34 测试 | 通过，4 文件 34 测试（stderr 仍有非致命 `[store] persist lastFolder failed`，jsdom 无 Tauri IPC，既有 catch 捕获，与基线一致） |
| `pnpm build` | 通过（tsc -b + vite，657.43 kB chunk > 500 kB 警告） | 通过（tsc -b + vite，657.77 kB chunk > 500 kB 警告，非失败） |
| `pnpm run doctor` | 失败，退出码 1；**Score 41 / 100 Critical**，50 issues = **3 errors** + 47 warnings | **通过，退出码 0；Score 54 / 100，32 issues = 0 errors + 32 warnings** |

## Changed Files

**新增（2）**
- `src/lib/format-size.ts` — `formatSize` 从 StatusBar 迁出（react-refresh/only-export-components 修复）
- `src/lib/single-tab-state.ts` — `imageReducer`/`editReducer` 及 ImageState/ImageAction/EditState/EditAction/ImageInfo 从 SingleTab 迁出

**前端修复（12）**
- `src/components/StatusBar.tsx` — 移除本地 formatSize 与 re-export，改从 lib 导入
- `src/components/SingleTab.tsx` — reducer/类型改从 lib 导入；清理不再使用的 createReducer、CropRect 类型导入
- `src/components/SingleTab.test.ts` — 测试导入改指 `@/lib/single-tab-state`
- `src/components/FullscreenViewer.tsx` — ① 工具条挂载 effect 不再在 effect 内 setState（新增同步 `scheduleHide`，初始可见状态不变）② meta 加载 effect 增加 cancelled 竞态防护（no-set-state-after-await-in-effect）③ formatSize 导入改指 lib
- `src/components/ThumbnailGrid.tsx` — ① entries 切换的 thumbs 重置改为 render 阶段条件重置（React 官方 prev-prop 模式，消除 set-state-in-effect / no-adjust-state-on-prop-change）② thumbSize 的 maxWidth ref 更新拆为独立无依赖 effect（消除 exhaustive-deps）③ 框选命中计算内联进 effect（消除 refs-in-render ×2）④ **错误路径缓存淘汰与成功路径对齐：catch 分支从全量 `clear()` 改为 LRU 淘汰最旧 maxWidth 分组**（审计 M4 修复在成功路径已落地、错误路径遗漏）
- `src/views/BrowseView.tsx` — ① 切换目录关闭全屏改为 render 阶段条件重置 ② `loadFolder`/目录 effect 补齐 `dispatch` 依赖
- `src/App.tsx` — 启动 effect 文件关联检查 setTimeout 移至 effect 顶层创建并在 cleanup 中 clearTimeout（effect-needs-cleanup）
- `src/components/DirTree.tsx` — ① toggleExpand 把 setTimeout 副作用移出 state updater（no-impure-state-updater 错误 + no-side-effect-in-state-updater 警告）② 自动定位 effect 改为普通 async 递归（消除自调度 setTimeout 链，加 cancelled 清理；effect-needs-cleanup 规则无法验证自调度 timer 的清理，经验证仅此形态通过）
- `src/components/QueuePanel.tsx` — 右键菜单 items 常量移至模块作用域
- `src/components/CropCanvas.tsx` — TOOLBAR_BUTTONS 常量移至模块作用域
- `src/views/SettingsView.tsx` — ① useState 惰性初始化 ② isDirty 的数组 includes 改为 Set 查找 ③ 格式 label 内补 sr-only checkbox 输入（label-has-associated-control，同时保留点击语义并增加键盘可达）
- `src/store/index.ts` — enqueue 的 filter().map() 合并为单循环（行为不变）

**版本与脚本（5）**
- `package.json` — `version` → 0.2.0；`doctor` 脚本 `npx react-doctor@latest` → `react-doctor`（本地 bin）；`devDependencies.react-doctor` `^0.5.4` → **精确锁定 `0.9.11`**
- `src-tauri/Cargo.toml` — `version` → 0.2.0
- `src-tauri/tauri.conf.json` — `version` → 0.2.0
- `src/components/Header.tsx` — 界面显示 `v0.1.0` → `v0.2.0`（版本漂移治理，避免 UI 与声明版本不一致）
- `README.md` — `v0.1.0 (2026.06)` → `v0.2.0 (2026.08)`
- `pnpm-lock.yaml` — 随 react-doctor 锁定更新（仅 react-doctor 0.5.4 → 0.9.11，含 oxlint-plugin-react-doctor peer）；`pnpm install --frozen-lockfile` 通过

## 关键决策

- **doctor 脚本锁定**：原脚本 `npx react-doctor@latest` 每次拉取最新版，基线不可复现；devDependencies 中的 `^0.5.4` 是未被使用的旧版本（基线即由 @latest 生成）。锁定方案：devDependencies 精确钉到 `0.9.11`（即基线实测版本，规则/计分与 RECEIPT-WORK-003-01 一致），脚本改走本地 bin。此为"锁定"而非"升级实际所用工具"——脚本实际使用版本从未变化。此改动超出 WORK 字面"不升级依赖"条款，按主代理"doctor 脚本锁定"指示执行。
- **ThumbnailGrid 错误路径缓存淘汰**：成功路径（审计 M4 已修复）按 LRU 淘汰最旧 sub-map；错误路径（catch 分支）遗留全量 `clear()`，超限时会把正在显示的缩略图一并清空引发闪烁。已与成功路径统一为 LRU，抽取 `evictOldestCache` 复用。
- **DirTree 自动定位去 50ms 延迟**：为满足 effect-needs-cleanup（该规则经实验确认无法验证自调度 setTimeout 链，见 scratch 验证：effect 顶层 timer 通过、async 内 timer 报错、普通 async 递归通过），自动定位改为普通 async 递归。层级间渲染时机由 `await loadChildren`（真实 IPC 往返）自然留出；全部祖先已加载时一次性展开（原 50ms/层渐进动画取消）。最终展开结果与滚动定位不变。

## 剩余债务（doctor 32 warnings，均超 WORK-003-02 允许范围，建议后续 WORK/PLAN 立项）

| 规则 | 数量 | 位置 | 说明 |
|---|---|---|---|
| prefer-use-effect-event | 10 | FullscreenViewer:330 ×8、SingleTab:275 ×2 | 需 React 19 useEffectEvent 重构，工作量大 |
| no-static-element-interactions | 6 | DirTree、FullscreenViewer、Sidebar、ThumbnailGrid | 需补 role/键盘语义，属交互变更 |
| no-giant-component | 4 | CropCanvas:61、FullscreenViewer:80、SingleTab:31、ThumbnailGrid:23 | 组件拆分重构 |
| click-events-have-key-events | 3 | DirTree、ThumbnailGrid | 需补键盘 handler，交互变更 |
| require-pnpm-hardening | 2 | pnpm-workspace.yaml | pnpm 安装策略配置，属 WORK-003-01 范围且共享工作区改装有并发风险，未动 |
| no-transition-all | 2 | BatchTab:234、SettingsView:115 | 样式调整，WORK 禁止；BatchTab 属 WORK-003-04 范围 |
| deslop/unused-export | 4 | store/index.ts:171-174（selectQueue 等 4 个 selector） | 存量死代码，按规范仅提示不删除 |
| no-array-index-as-key | 1 | BatchTab:252 | 错误列表 key，BatchTab 属 WORK-003-04 范围 |

## 验证命令结果（收口）

| 命令 | 结果 |
|---|---|
| `pnpm lint` | 通过，退出码 0，0 problems |
| `pnpm test` | 通过，4 文件 34 测试全部通过 |
| `pnpm build` | 通过，退出码 0（657.77 kB chunk 警告非失败） |
| `pnpm run doctor` | 通过，退出码 0；Score 54/100，32 warnings（0 errors）；Share: `https://react.doctor/share?p=piccarft&s=54&w=32&f=10` |
| `grep -n '"version"' package.json src-tauri/tauri.conf.json` | 均为 0.2.0 |
| `grep -n '^version' src-tauri/Cargo.toml` | 0.2.0 |
| `pnpm install --frozen-lockfile` | 通过（react-doctor 锁定后 lockfile 一致） |

## 通过标准核对

- [x] `pnpm lint` 零错误（且零警告）
- [x] `pnpm test` 全部通过（34/34）
- [x] `pnpm build` 成功
- [x] `pnpm doctor` 通过（退出码 0；errors 清零；剩余 32 warnings 为已登记债务，见上表）
- [x] 三处版本号均为 0.2.0（package.json / Cargo.toml / tauri.conf.json，另 Header 界面与 README 同步）

## 风险与未决项

- **DirTree 自动定位行为微调**：去掉 50ms 层间延迟，已加载路径改为一次性展开（结果一致，无渐进动画）；未加载路径仍逐层随 IPC 加载展开。如产品侧希望保留渐进动画，需另行立项处理（当前无满足 effect-needs-cleanup 规则的保留方案）。
- **App 文件关联检查计时起点**：setTimeout 从"路由完成后再延时 1.5s"改为"挂载即延时 1.5s"；hydrate 为本地毫秒级读取，实际影响可忽略，语义不变。
- **About 页 `v2026.06` 展示**（SettingsView AboutSubTab）：日期式版本号，不在本工单三处版本清单内，未改动；建议随下次发布统一。
- **`pnpm doctor` 无债务达成路径**：剩余 32 warnings 需拆分组件、useEffectEvent、a11y 增强等结构性工作，建议并入 WORK-003-05（CI 门禁）之前的专项工单。
- 未提交、未推送、未关闭 PLAN；plan-index 等文档索引由 PLAN 收口方统一更新（共享工作区避免冲突）。

## 审计补正段（PLAN-003 审计，2026-08-11）

- **react-doctor 0.9.11 精确锁定授权补记**：本回执"关键决策"段已记录"doctor 脚本锁定"指示，PLAN 层缺汇总记录；已在 `PLAN-003-stable-release-baseline.md` 跨工单授权补记段补记实际授权与理由（`npx react-doctor@latest` 基线不可复现，锁定到基线实测版本 0.9.11，属锁定非升级）。
- **About 页版本号遗留已修**：原"风险与未决项"中 `SettingsView` AboutSubTab 展示 `v2026.06`（日期式版本号）的遗留项，本次审计补正改为 `v0.2.0`（与 package.json/Cargo.toml/tauri.conf.json/Header 一致）；新增最小测试 `src/views/SettingsView.test.tsx`（渲染设置视图 → 点击"关于" → 断言展示 v0.2.0 且不再出现 v2026.06），`pnpm test` 全量 81 通过（原 80 + 1）。
