# 代码审计报告 — PicCraft (图轻剪)

> **审计日期**：2026-07-13
> **审计范围**：全量代码（前端 src/ + 后端 src-tauri/）
> **审计人**：瑶瑶 AI
> **状态**：已完成

## 概述

PicCraft 是一个基于 Tauri v2 + React 19 + Rust 的桌面图片处理工具，支持图片浏览、单图编辑（裁剪/旋转/翻转/缩放）、批量处理和 Windows 文件关联。代码总量约 3500 行（前端 ~2200 行 + 后端 ~830 行），架构清晰，分层合理。

---

## 问题清单（按严重程度排序）

### Critical（必须修复）

- [ ] **C1: `assetProtocol.scope: ["**"]` 允许访问系统所有文件**
  - 文件：`src-tauri/tauri.conf.json:28`
  - 问题：资源协议的 scope 设为 `**`，意味着 WebView 中的任何代码都能通过 `asset://` 协议读取系统上**任意文件**。虽然当前 CSP 限制了脚本来源，但如果未来引入 XSS 漏洞（如第三方依赖），攻击者可直接读取用户磁盘上的敏感文件。
  - 建议：将 scope 限制为用户选择的目录，或至少排除系统敏感路径（如 `C:\Windows\**`、`C:\Users\**\AppData\**`）。由于图片浏览需要访问任意目录，可考虑在前端层做路径白名单校验。

- [ ] **C2: 缩略图磁盘缓存未包含文件修改时间，导致缓存失效问题**
  - 文件：`src-tauri/src/image_ops.rs:578-584`
  - 问题：缓存 key 仅由 `path + max_width` 哈希生成。如果用户用同名文件替换了某张图片（修改时间变了但路径不变），缩略图缓存**不会更新**，用户看到的始终是旧图缩略图。
  - 建议：将文件的 `modified_at` 时间戳纳入缓存 key 计算。

### High（强烈建议修复）

- [ ] **H1: 前端零测试覆盖**
  - 问题：项目中搜索不到任何 `.test.ts` / `.spec.ts` 文件。前端有 10+ 组件、复杂的缩略图懒加载逻辑、框选交互、状态管理，全部没有自动化测试保障。
  - 建议：至少为核心逻辑编写测试 — `store/index.ts` 的 `enqueue`/`toggleSelected`/`hydrate`、`ThumbnailGrid` 的框选命中逻辑、`SingleTab` 的 `editReducer`/`imageReducer`。

- [ ] **H2: 后端测试覆盖不足**
  - 文件：`src-tauri/src/lib.rs:176-197`
  - 问题：仅有 2 个测试用例（`parse_from_iter_cold` 和 `parse_from_iter_edit`），覆盖了启动参数解析。核心的图片处理函数（`crop_image`、`resize_image`、`save_image`、`batch_process`、`make_thumbnail`）完全没有测试。
  - 建议：为 `png_colors`、`temp_file_path`、`check_file_size_path`、`process_single_batch` 等纯函数添加单元测试。

- [ ] **H3: 临时文件泄漏 — 未保存的编辑结果永不清理**
  - 文件：`src-tauri/src/image_ops.rs:272-273`
  - 问题：`save_image` 成功后会删除临时文件（第 273 行），但如果用户做了裁剪/缩放/变换后**不保存直接关闭**，临时文件会永久留在 `temp` 目录。长期使用会逐渐填满磁盘。
  - 建议：应用启动时清理上次残留的 `piccraft_*` 临时文件，或设置临时文件 TTL 机制。

- [ ] **H4: 缩略图磁盘缓存永不清理**
  - 文件：`src-tauri/src/image_ops.rs:585`
  - 问题：`piccraft_thumbs` 缓存目录只增不减，大量浏览不同目录的图片后，缓存会无限增长。
  - 建议：实现 LRU 淘汰策略，或在应用启动时检查缓存总大小，超阈值时清理最旧的文件。

- [ ] **H5: `parse_startup_args` 和 `parse_from_iter` 代码重复**
  - 文件：`src-tauri/src/lib.rs:33-68` 和 `141-174`
  - 问题：两个函数逻辑几乎完全相同（解析 `--edit` + 文件路径，或判断目录/文件），违反 DRY 原则。唯一差异是输入类型（`args_os` vs `Iterator<String>`）。
  - 建议：提取公共解析逻辑为 `fn parse_args_from_strings<I, S>(iter: I) -> StartupArgs where S: AsRef<str>`，两个入口函数分别调用。

### Medium（建议修复）

- [ ] **M1: `DefaultHasher` 不保证跨版本稳定性**
  - 文件：`src-tauri/src/image_ops.rs:579-583`
  - 问题：Rust 标准库明确文档说明 `DefaultHasher` 的算法可能在版本间变化。由于缩略图缓存持久化在磁盘上，Rust 版本升级后旧缓存会全部失效（不会崩溃，只是缓存 miss）。
  - 建议：使用固定算法的哈希（如 `xxhash` 或 `fxhash`），或直接用字符串拼接作为缓存文件名。

- [ ] **M2: `SingleTab.handleEnqueueAndNext` 每次都重新读目录**
  - 文件：`src/components/SingleTab.tsx:296-318`
  - 问题：每次点击"加入队列并打开下一张"时，都调用 `invoke("read_dir", ...)` 重新扫描整个目录来查找下一张图片。频繁操作时产生不必要的 IO。
  - 建议：在组件挂载时缓存目录列表，或从 `BrowseView` 的状态中共享已加载的 entries。

- [ ] **M3: `BatchTab` 使用 `localStorage` 而非 Tauri Store**
  - 文件：`src/components/BatchTab.tsx:22, 72-88`
  - 问题：应用其他持久化状态（`lastFolder`、`settings`）都使用 `tauri-plugin-store`，但 `BatchTab` 的 `outputDir` 用了 `localStorage`，不一致。在 Tauri 环境中 `localStorage` 的行为可能与浏览器不同（如 WebView2 的 localStorage 路径问题）。
  - 建议：统一使用 `tauri-plugin-store`。

- [ ] **M4: 缩略图缓存淘汰策略过于粗暴**
  - 文件：`src/components/ThumbnailGrid.tsx:96-99`
  - 问题：当内存缓存超过 300 项时，直接 `thumbCacheRef.current.clear()` 清空全部。这会导致正在显示的缩略图突然消失，触发重新加载，出现视觉闪烁。
  - 建议：改为 LRU 策略，淘汰最久未访问的条目而非全清。

- [ ] **M5: `FullscreenViewer` 的 `stageRef` 类型为 `unknown`**
  - 文件：`src/components/FullscreenViewer.tsx:113`
  - 问题：`const stageRef = useRef<unknown>(null)` 丢失了类型安全。后续 `ref={stageRef as never}` 是类型擦除。
  - 建议：正确类型应为 `useRef<Konva.Stage>(null)`。

- [ ] **M6: 无 React ErrorBoundary**
  - 问题：如果 Konva 渲染失败、或某个组件抛出异常，整个应用白屏。
  - 建议：在 `App.tsx` 外层包裹 `ErrorBoundary`，提供友好的错误恢复 UI。

- [ ] **M7: `image::DynamicImage::crop` 已弃用**
  - 文件：`src-tauri/src/image_ops.rs:151`
  - 问题：`img.crop(x, y, width, height)` 在 `image` 0.25 中已标记为 deprecated，建议使用 `crop_imm`。当前能工作但未来版本可能移除。
  - 建议：替换为 `img.crop_imm(x, y, width, height)`。

- [ ] **M8: `QueuePanel` 的右键菜单在面板内滚动时也会关闭**
  - 文件：`src/components/QueuePanel.tsx:130`
  - 问题：`window.addEventListener("scroll", onClose, true)` 使用了捕获阶段，意味着队列列表内部的滚动也会触发菜单关闭。
  - 建议：检查滚动事件的 `target`，仅在外部滚动时关闭。

### Low（可改进项）

- [ ] **L1: 版本号不一致**
  - `package.json`: `"version": "0.0.0"`
  - `src-tauri/Cargo.toml`: `version = "0.1.0"`
  - `src-tauri/tauri.conf.json`: `"version": "0.1.0"`
  - `Header.tsx` 显示：`v2026.06`
  - 建议：统一版本号管理。

- [ ] **L2: `StatusBar` 导出了 `formatDate` 和 `DirEntry` 但无人使用**
  - 文件：`src/components/StatusBar.tsx:46-47`
  - 问题：`formatDate` 在项目中没有被其他文件导入；`DirEntry` 类型的 re-export 是不必要的，应直接从 `BrowseView` 导入。
  - 建议：移除未使用的导出。

- [ ] **L3: `SettingsView` 手写 SVG 图标而项目已用 lucide-react**
  - 文件：`src/views/SettingsView.tsx:172-207`
  - 问题：`FolderIcon`、`QueueIcon`、`EditIcon`、`OpenIcon` 是手写 SVG，而项目其他地方统一使用 `lucide-react`。
  - 建议：直接用 lucide-react 的对应图标替换。

- [ ] **L4: 文档与实现不一致 — 缩略图磁盘缓存**
  - 文件：`CONTEXT.md:152` 写 "不做缩略图磁盘缓存"
  - 实际：`image_ops.rs:577-624` 实现了磁盘缓存
  - 建议：更新 `CONTEXT.md`。

- [ ] **L5: `CONTEXT.md:51` 说"切换目录会清空队列"，但代码中 `setCurrentFolder` 未清空队列**
  - 文件：`src/store/index.ts:101-104`
  - 问题：`setCurrentFolder` 只清空了 `selected`，没有调用 `clearQueue`。这与文档描述不符。
  - 建议：确认产品意图 — 如果确实应该清空队列，补上 `clearQueue()` 调用；如果文档有误，更新文档。

- [ ] **L6: `Slider` 组件的 `min` 设为 0 但质量 0 无意义**
  - 文件：`src/components/SingleTab.tsx:433`
  - 问题：质量滑块 `min={0}`，但 JPEG 质量 0 会产生损坏文件。后端 `save_image` 做了 `clamp(1, 100)` 保护，但前端 UI 应该设 `min={1}`。
  - 建议：改为 `min={1}`。

- [ ] **L7: `eslint-disable-next-line` 注释较多**
  - 文件：`src/components/BrowseView.tsx:88`、`src/components/FullscreenViewer.tsx:210`、`src/components/SingleTab.tsx:323` 等
  - 问题：多处使用 `eslint-disable-next-line react-hooks/set-state-in-effect` 和 `react-hooks/exhaustive-deps`。这些可能是合理的抑制，但也可能是潜在的状态更新问题。
  - 建议：逐一审查这些 eslint 抑制，确认是否真的需要。

---

## 亮点

| 方面 | 评价 |
|------|------|
| **性能优化** | `ThumbnailGrid` 的 4 大热点优化（rAF 节流、observer 复用、layout 缓存、稳定 handler）非常专业 |
| **状态管理** | Zustand + selector 模式使用规范，局部订阅避免了不必要渲染 |
| **Reducer 模式** | 多个组件用 `useReducer` 管理复杂状态（`BrowseView`、`FullscreenViewer`、`SingleTab`、`BatchTab`、`CropCanvas`），比零散的 `useState` 更可追踪 |
| **Rust 端防护** | `MAX_FILE_SIZE`、`MAX_DIR_ENTRIES`、`THUMBNAIL_MAX_WIDTH` 等上限保护到位，`read_dir` 做了 `canonicalize` 防路径穿越 |
| **CSP 配置** | Content Security Policy 配置详细且合理，覆盖了 asset 协议的 HTTP/HTTPS 双 scheme |
| **Konva 裁剪实现** | `CropCanvas` 的坐标映射（stage ↔ image）、Transformer 集成、overlay 蒙版实现完整 |
| **单实例 + 启动参数转发** | `tauri-plugin-single-instance` 集成 + `startup-args-updated` 事件转发，二次启动参数路由完整 |
| **CONTEXT.md 术语表** | 领域语言定义清晰，经验教训记录详实，对后续维护非常友好 |

---

## 建议优先级

| 优先级 | 行动项 |
|--------|--------|
| **P0（本周）** | C2 缩略图缓存 key 加 mtime；H3 临时文件清理机制 |
| **P1（本月）** | C1 asset scope 收紧；H1/H2 补充核心测试；H4 缓存清理；H5 消除重复代码 |
| **P2（下个迭代）** | M1-M8 逐项修复；L1 版本号统一；L4/L5 文档同步 |
| **P3（有空就做）** | L2/L3/L6/L7 代码清理 |

---

## 审批状态

- [x] Approved with suggestions

项目整体质量良好，架构清晰、性能优化到位、错误处理较完善。Critical 问题主要集中在缓存正确性和安全配置上，建议优先处理 C2（影响用户可见的正确性）和 H3（影响磁盘空间）。测试覆盖是最大的技术债务，建议在下一个迭代周期系统性补充。
