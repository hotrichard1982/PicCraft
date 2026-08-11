---
id: RECEIPT-WORK-004-02
work: WORK-004-02
status: completed
created: 2026-08-12
updated: 2026-08-12
---

# RECEIPT-WORK-004-02

## 范围说明

WORK-004-02「前端平台交互」：前端完成 macOS 交互适配（依赖 WORK-004-01 的 `finder-opened` 事件接口）。平台检测用运行时 UA（Tauri v2 核心 API 已移除 `os.platform()`，`@tauri-apps/plugin-os` 未安装且受「不新增 npm 依赖」约束）；Windows 行为与文案保持不变。未改 Rust、`tauri.conf.json`、CI、其余 `docs/`（除本回执）。

## Changed Files（仓库内）

**新增（生产代码）**
- `src/lib/platform.ts`：平台检测纯函数 + 平台化文案/快捷键匹配
  - `detectPlatform(ua)`（纯函数，UA → `macos | windows | other`；mac 前缀匹配先于 win，jsdom 默认 UA `(win32)` 落 windows）
  - `getPlatform()`（运行时读取 `navigator.userAgent`）
  - `revealItemLabel(platform)`（macOS → 「在 Finder 中显示」，其余 → 「在资源管理器中显示」）
  - `matchSaveShortcut(e, platform)`（macOS 用 `metaKey`；其余平台逐行保留原 ctrlKey 行为：`Ctrl+S` 覆盖保存、`Ctrl+Shift+S` 另存为）
  - `saveShortcutHint(platform)`（提示文案修饰键平台化：`Cmd+S 覆盖原图 | Cmd+Shift+S 另存为`）
- `src/lib/startup-route.ts`：启动/打开事件统一路由纯逻辑
  - `folderOfFile(file)`（目录提取，保留 App.tsx 原语义：无分隔符返回 null）
  - `finderOpenedToRoute(paths)`（`finder-opened` payload：完整路径数组 → 取第一个 → Browse+file；空数组 → cold）
  - `resolveRoute(args, lastFolder)`（路由参数 → 导航计划，纯函数）
  - `applyRoutePlan(plan)`（计划应用到 store；folder 为 null 不动当前目录）

**新增（测试）**
- `src/lib/platform.test.ts`（15 例）、`src/lib/startup-route.test.ts`（16 例）、`src/components/QueuePanel.test.tsx`（1 例，macOS 右键菜单文案）、`src/components/DirTree.test.tsx`（1 例，根节点文案）

**修改**
- `src/App.tsx`：启动路由与 single-instance 监听统一收敛到 `resolveRoute` + `applyRoutePlan`；新增 `finder-opened` 监听（payload `string[]`）走同一语义；删除 App 内两套重复路由分支与不再使用的 setter 依赖
- `src/components/SingleTab.tsx`：保存快捷键改走 `matchSaveShortcut`（macOS metaKey）；底部提示文案改 `saveShortcutHint`
- `src/components/QueuePanel.tsx`：右键菜单 reveal 文案改 `revealItemLabel(getPlatform())`
- `src/components/DirTree.tsx`：根节点「此电脑」→「文件系统」（平台中性，PRD-002）
- `src/views/SettingsView.tsx`：设置子 Tab 按平台分支——macOS 只读格式列表（FORMATS 5 项复用）+ Finder 默认应用教程（右键 → 显示简介 → 打开方式 → 选择 PicCraft → 全部更改），不渲染勾选框/保存按钮；Windows 原勾选 UI 原样保留（拆为 `WindowsFileAssocSubTab`）
- `src/views/SettingsView.test.tsx`：增加平台分支组件测试（vi.hoisted 平台开关）

## TDD 证据

### RED

测试先行（新增 4 个测试文件 + SettingsView 扩展），生产模块未实现/未接入，运行失败：

```
FAIL src/lib/platform.test.ts      Error: Failed to resolve import "@/lib/platform"（模块不存在）
FAIL src/lib/startup-route.test.ts Error: Failed to resolve import "@/lib/startup-route"（模块不存在）
FAIL src/components/DirTree.test.tsx   Unable to find an element with the text: 文件系统（仍是「此电脑」）
FAIL src/components/QueuePanel.test.tsx Unable to find an element with the text: 在 Finder 中显示
FAIL src/views/SettingsView.test.tsx   Found multiple elements with the role "checkbox"（macOS 分支未渲染）
Test Files 5 failed | 7 passed (12)   Tests 3 failed | 83 passed (86)
```

### GREEN

实现后 `pnpm test`：**115 passed**（基线 81 → +34 = 15 platform + 16 startup-route + 1 QueuePanel + 1 DirTree + 1 SettingsView 新增断言组；SettingsView 平台分支 3 例计入），连续 2 次运行稳定（4.12s / 4.46s）。

## 新增测试覆盖

| 类别 | 测试 | 覆盖点 |
|---|---|---|
| 平台检测 | `detectPlatform` 3 例 | macOS WKWebView UA / Windows WebView2 + jsdom `(win32)` UA / Linux 与空串 → other |
| reveal 文案 | `revealItemLabel` 2 例 | macOS → Finder；windows/other → 资源管理器 |
| 保存快捷键 | `matchSaveShortcut` 4 例 | Windows Ctrl+S / Ctrl+Shift+S 原行为、无修饰不触发、macOS Cmd+S / Cmd+Shift+S、macOS 无 metaKey（含仅 Ctrl）不触发 |
| 提示文案 | `saveShortcutHint` 2 例 | macOS Cmd 修饰 / Windows Ctrl 修饰 |
| 目录提取 | `folderOfFile` 5 例 | Windows 反斜杠/正斜杠、macOS 路径、无分隔符、根目录下文件 |
| Finder 路由 | `finderOpenedToRoute` 3 例 | 单文件 Browse+file、多文件取第一个（保序）、空数组 cold |
| 统一路由 | `resolveRoute` 6 例 | edit+file / browse+folder / browse+file（目录+定位目标）/ browse+file 无目录回退 lastFolder / cold ± lastFolder |
| 计划应用 | `applyRoutePlan` 4 例 | browse 计划切视图设目录、targetFile 定位、edit 计划、folder null 不动目录 |
| 组件定向 | QueuePanel 1 例 | macOS 右键菜单显示「在 Finder 中显示」 |
| 组件定向 | DirTree 1 例 | 根节点「文件系统」 |
| 组件定向 | SettingsView 3 例 | macOS 无勾选框/无保存按钮/有 Finder 教程；5 格式全列出；Windows 5 勾选框 + 保存按钮 |

## 平台检测方案

- **结论**：运行时 UA 检测（`navigator.userAgent`），纯函数 `detectPlatform(ua)` 可单测，无新依赖、无构建配置改动。
- **决策依据**：`@tauri-apps/api@2.11.0` 核心包已无 `os` 模块（`os.platform()` 在 v2 移至 `@tauri-apps/plugin-os`，本项目未安装，安装即违反「不新增 npm 依赖」）；桌面 WebView UA 恒定携带宿主平台（macOS WKWebView `Macintosh`、Windows WebView2 `Windows NT`），比 Vite define 构建期常量更简单且避免「构建机平台 ≠ 目标平台」的交叉场景（本项目各平台分别在对应 runner 上构建，两种方案均可，选改动最小者）。
- **测试语义**：jsdom 默认 UA `(win32)` → 测试默认按 Windows 分支运行（既有测试断言不受影响）；macOS 分支通过 `vi.mock("@/lib/platform")` 或纯函数传参覆盖。

## 快捷键覆盖清单

| 快捷键 | 实现位置 | 状态 |
|---|---|---|
| Ctrl+S 覆盖保存 / Ctrl+Shift+S 另存为（Windows） | `SingleTab.tsx` → `matchSaveShortcut` | 行为逐行不变（单测证明） |
| Cmd+S 覆盖保存 / Cmd+Shift+S 另存为（macOS） | 同上 | 新增 metaKey 分支 |
| Ctrl/Cmd+滚轮 调整缩略图 | `BrowseView.tsx` `handleWheel` | **已存在**（`e.ctrlKey \|\| e.metaKey`，HEAD 已含），无需改动，未动文件 |
| Ctrl/Cmd+=/- 调整缩略图 | `BrowseView.tsx` keydown | 同上，已存在 |
| Ctrl+A / Cmd+A 全选 | — | **未实现**：代码中无全选功能（仅 SettingsView 帮助文案提及），按工单「只做已存在的快捷键的平台化，不新增功能」跳过，未新增功能 |

## Finder 打开路由实现方式（与 Rust 约定对齐）

- **事件**：`listen<string[]>("finder-opened")`（事件名与 payload 类型对齐 WORK-004-01：完整路径数组、原顺序）。
- **语义**：`finderOpenedToRoute(paths)` 取 `paths[0]` → `{ mode: "browse", file: paths[0], folder: null }` → 与 argv 路由共用 `resolveRoute`：进入浏览视图、加载第一张图片所在目录、`setBrowseTargetFile` 全屏定位该图；多文件不自动加入队列（PRD-002）；空数组 → cold → 回退 lastFolder。
- **统一路由**：启动 `read_startup_args`、二次实例 `startup-args-updated`、Finder `finder-opened` 三路全部收敛到 `resolveRoute` + `applyRoutePlan` 单套实现；App.tsx 中两套重复分支删除。
- **启动竞态**：首实例冷启动被 Finder 触发时，read_startup_args 与 finder-opened 携带同一目标，两次路由幂等（同值 setState 去重）。
- **文件关联检查**：`check_file_assoc` 在非 Windows 由 Rust 端返回 `open_ok: true`，App 启动检查在 macOS 直接放行，无需前端改动（已核对 `image_ops.rs` 行 1073）。

## 验证命令结果

| 命令 | 结果 |
|---|---|
| `pnpm test` | 通过，115 passed（基线 81 → +34），连续 2 次稳定 |
| `pnpm lint` | 零错误（修掉 1 个 `prefer-const`） |
| `pnpm build` | 成功（`tsc -b` + vite build；>500kB chunk 警告为既有，非本次引入） |
| `pnpm exec react-doctor --score` | 54（与基线持平，未新增 error） |
| `git diff --check` | 无输出（通过） |

## 通过标准核对（WORK-004-02）

- [x] 快捷键：Cmd+S / Cmd+Shift+S（metaKey）；Cmd+滚轮已存在无需改动；无全选功能故不做
- [x] 文案：macOS「在 Finder 中显示」（QueuePanel）；目录树根节点「文件系统」（双平台统一，PRD-002）
- [x] Finder 打开路由：接收 `finder-opened`，单文件浏览+全屏定位；多文件按第一张目录浏览，不自动入队；与 argv 路由共用一套纯逻辑
- [x] macOS 设置页：只读格式列表（jpg/jpeg/png/webp/bmp）+ Finder 默认应用教程，无勾选框（无假关联）
- [x] 平台检测：UA 运行时检测，无新依赖（`@tauri-apps/api` 无 os 模块 → 方案记录于本回执）
- [x] Windows 回归：既有 81 个测试全绿未改动语义
- [x] 前端测试 115 全绿；lint 零错误；build 成功；react-doctor 54 不低于基线
- [x] 回执记录 RED/GREEN 证据

## 风险与未决项

- **UA 检测在真实 Tauri WebView 的行为**：macOS WKWebView 与 Windows WebView2 的 UA 形态为业界稳定事实（各含宿主平台标识），且与测试中使用的形态一致；仍建议 WORK-004-04 CI / 真机冒烟时确认设置页与右键菜单文案（PRD-002 验收项）。
- **统一路由的退化语义变化**：原 single-instance 监听对 `browse` 无 file/folder（Rust 端实际不可达）与 `edit` 无 file（仅手动 `--edit` 裸参可达）不动作；统一后此类退化输入回退 lastFolder 导航。可达路径行为不变（`resolveRoute` 6 例单测覆盖），此为刻意统一，非缺陷。
- **帮助页文案未平台化**（SettingsView Help 子 Tab：Ctrl+A、Windows 资源管理器描述）：工单未列、属文案决策，未改动；其中 Ctrl+A 文案在无全选功能的现状下本就过期，建议后续单独工单处理。
- **BrowseView 的 Cmd+滚轮/Cmd+=/- 在 HEAD 已具备**（`e.ctrlKey || e.metaKey`），本工单零改动；如后续新增缩略图快捷键，应复用同一匹配模式。
- 未提交、未推送、未关闭 PLAN；工作区仅本工单改动文件。
