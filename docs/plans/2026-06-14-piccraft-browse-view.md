# PicCraft 浏览视图功能 - 实施计划

> 日期：2026-06-14 · 关联：[CONTEXT.md](../../CONTEXT.md) · [ADR-0001-0003](../../adr/)

## 一、目标

为 PicCraft 增加**图片浏览视图**，把应用从"单图/批量处理工具"升级为"图片处理 + 浏览 + 队列挑选"工作流入口。同时引入：

- 4 视图切换（浏览 / 单图编辑 / 批量编辑 / 设置）
- 全局 Zustand 状态管理
- 启动参数路由（双击图片 / 右键"用图轻剪编辑"）
- 设置视图 + Windows 文件关联

## 二、路由表（启动与视图切换）

### 2.1 应用启动路由

| 启动方式 | 参数示例 | 目标视图 | 进入后状态 |
|---------|----------|----------|------------|
| 冷启动 | 无 | 浏览视图 | 加载 lastFolder（来自持久化），无则空目录占位 |
| 双击图片 | `piccarft.exe C:\photos\a.jpg` | 浏览视图 | currentFolder = a.jpg 所在目录，全屏看图模式，定位到 a.jpg |
| 右键目录 → 用图轻剪打开 | `piccarft.exe C:\photos` | 浏览视图 | currentFolder = C:\photos |
| 右键图片 → 用图轻剪编辑 | `piccarft.exe --edit C:\photos\a.jpg` | 单图编辑视图 | 加载 a.jpg，自动加入队列 |

### 2.2 运行时视图切换

| 触发 | 来源视图 | 目标视图 |
|------|---------|----------|
| 顶部 Tab 点击 | 任意 | 任意 |
| 浏览视图选图 → 右键"加入队列" | 浏览 | 批量编辑（自动） |
| 单图视图 → "加入队列并打开下一张" | 单图 | 单图（加载下一张） |
| 全屏看图按 `E` | 浏览（全屏） | 单图编辑（编辑当前全屏的图） |
| 全屏看图按 `Esc` | 浏览（全屏） | 浏览（缩略图） |
| 批量处理完成 → 自动 | 批量 | 批量（停留，显示"完成 N 张"提示） |

## 三、垂直切片（Milestones）

按"能独立编译运行"切分，每片都跑 `cargo build` + `npm run build` 通过。

### M1 · Rust 后端扩展 + 前端基础设施（地基）

**交付：**
- Rust 新增命令：
  - `read_dir(folder: String) -> Vec<ImageInfo>` —— 扫描目录、过滤 `IMG_EXTS`、读元数据
  - `make_thumbnail(path: String, max_width: u32) -> String` —— 返回 base64 PNG
  - `get_file_meta(path: String) -> FileMeta` —— 单独取大小/创建/修改日期
- 扩展 `ImageInfo` 结构：加 `created_at: Option<u64>`、`modified_at: Option<u64>`（Unix 时间戳秒）
- 前端：
  - 装 `zustand`、`@tauri-apps/plugin-store`
  - 建 `src/store/index.ts` —— 4 个 slice：`view` / `folder` / `queue` / `settings`
  - 持久化插件：启动时 hydrate `lastFolder` 和 `settings.fileAssoc`
- 入口 `App.tsx` 加 `useEffect` 读启动参数（`@tauri-apps/api/path` + `window.__TAURI__.cli`）

**验证：** `cargo build` 干净通过；前端能通过 invoke 调通 3 个新命令。

**风险：** 启动参数读取在 Tauri 2 里的 API 路径得查清楚。

### M2 · 浏览视图骨架

**交付：**
- `src/views/BrowseView.tsx` —— 缩略图网格 + 状态栏
- `src/components/ThumbnailGrid.tsx` —— 用 CSS Grid + IntersectionObserver 懒加载缩略图
- `src/components/StatusBar.tsx` —— 底部状态栏（单选/多选/计数）
- 顶部 Tab 4 选 1：当前 `defaultValue="browse"`，3 个老 Tab 改名为对应名字

**验证：** 打开一个有图的目录，能看到缩略图；Ctrl+A 全选；底部状态栏正确显示。

**风险：** 缩略图网格 + 1000+ 张图时的滚动性能（待 M3 后回归测试）。

### M3 · 全屏看图

**交付：**
- `src/components/FullscreenViewer.tsx` —— 覆盖式全屏组件
- Konva Stage 渲染大图（不复用 CropCanvas，简化版）
- 顶部悬浮工具条（4 按钮 + 鼠标静止 1.5s 隐藏）
- 右下角元信息卡片
- 快捷键：`← →` 翻页、`Space` 下一张、`+ - 0 F` 缩放、`Esc` 退出、`E` 进编辑
- 浏览视图双击缩略图 → 滚动定位 + 启动全屏看图

**验证：** 双击图进入全屏，工具条自动隐藏/显示，按 `E` 跳到单图编辑。

**风险：** Konva 渲染超大图（8000x6000）需验证 WebGL 上下文上限。

### M4 · 队列 + 批量视图改造

**交付：**
- `src/components/QueuePanel.tsx` —— 仅在 `BatchView` 右侧出现，默认展开可折叠
- 队列 store：`{ items: QueueItem[] }` + actions：`enqueue / dequeue / clearQueue / reorderQueue`（**不实现** reorder）
- 队列项右键菜单：① 移除 ② 在单图编辑中打开 ③ 复制文件路径 ④ 在资源管理器中显示
  - "在资源管理器中显示"用 `tauri-plugin-opener` 调 `revealItemInDir(path)`，自动高亮该文件
- 队列项状态：待处理 / 处理中 / 完成 / 失败
- Rust 新增 `batch_process_queue(paths: Vec<String>, output_dir: String, target_width: u32, quality: u8) -> Result<...>` —— 走旧的 `process_single_batch` 复用逻辑
- 旧 `batch_process(input_dir, ...)` 命令**保留**
- `BatchView` 主区域：左侧参数设置（目标宽度、质量、输出目录）+ 右侧队列面板

**验证：** 浏览视图右键"加入队列"自动切到批量视图，参数调好点开始能跑，进度实时反映到队列项。

**风险：** 旧 `batch_process` 和新 `batch_process_queue` 的进度事件 (`batch-progress`) payload 格式要保持兼容。

### M5 · 单图编辑视图适配

**交付：**
- 单图视图的 `CropCanvas` 已是独立组件，几乎不用动
- SingleTab 接收 `initialFile` prop（启动参数时设置）
- 单图视图右侧面板加按钮："加入队列并打开下一张"—— 加入当前编辑的图，从**浏览视图的当前目录**取下一张（按文件名排序）跳到下一张编辑；队列空则按钮禁用

**验证：** 启动参数 `--edit` 进单图，按按钮能从浏览视图当前目录找下一张继续编辑。

**风险：** "当前目录"在单图视图里需要从 store 读，且与"加入队列"语义要厘清。

### M6 · 设置视图

**交付：**
- `src/views/SettingsView.tsx` —— 内部 `<Tabs>` 3 个子 Tab
- **设置子 Tab**：
  - 5 个 checkbox（jpg/jpeg/png/webp/bmp）—— `tauri-plugin-store` 持久化
  - 每次勾选变化 → 调 Rust 命令 `register_file_assoc(formats: Vec<String>)` 同步 Windows 注册表
  - Rust 端用 `winreg` crate 操作 `HKCU\Software\Classes\<ext>` 下的 OpenWithProgids
- **帮助子 Tab**：
  - 静态 HTML 3-4 段：① 如何浏览图片 ② 如何加入队列 ③ 如何编辑 / 批量 ④ 双击图片关联
- **关于子 Tab**：
  - 现 AboutTab 内容迁移过来（Logo / 标题 / 版本 / 技术栈 / 开源 / 公司 / 官网 / GitHub）

**验证：** 勾选 jpg → 立即生效（用 `assoc` 或 `ftype` 命令查注册表能看到 PicCraft）。

**风险：** Windows 注册表写错位置会污染系统——必须先**读**再**合并写**（不删用户已有的关联项），且所有操作加 `Result` 错误处理。

### M7 · 启动参数路由

**交付：**
- `src-tauri/tauri.conf.json` 加 `bundle.fileAssociations`：
  - 5 种图片格式关联到 `piccarft.exe`
- Tauri 启动时通过 `tauri::Builder` 的 `setup` 钩子读 `std::env::args()`
- 解析规则：
  - `--edit <file>` → 路由到单图视图
  - `<dir>` 存在 → 路由到浏览视图打开该目录
  - `<file>` 存在 → 路由到浏览视图，打开该文件所在目录 + 全屏
  - 无参数 → 冷启动
- 前端 `App.tsx` 启动时用 `invoke("get_startup_args")` 拉参数决定初始视图
- 冷启动时从 `tauri-plugin-store` 读 `lastFolder`，有则用之

**验证：** 在 cmd 里分别 `piccarft.exe C:\photos\a.jpg` 和 `piccarft.exe --edit C:\photos\a.jpg` 看是否路由正确。

**风险：** Tauri 2 的 `fileAssociations` 在 Windows 上**首次安装**才写注册表，开发模式 `tauri dev` 不生效。需在 release 模式下测。

## 四、依赖变更汇总

### Rust
- **新增**：`winreg` (Windows 注册表操作，仅 Windows 平台依赖)
- **新增**：`base64` (缩略图编码)
- **已有**：`image`、`serde`、`tauri` 等复用

### 前端
- **新增**：`zustand` (~3KB)
- **新增**：`@tauri-apps/plugin-store` (Tauri 官方)

## 五、风险登记表

| 等级 | 风险 | 缓解 |
|------|------|------|
| 🔴 高 | Windows 文件关联在开发模式 (`tauri dev`) 测不出 | M7 阶段必须用 release 模式 (`tauri build` 后跑安装包) 验证 |
| 🔴 高 | Windows 注册表写错位置污染系统 | M6 Rust 命令必须**合并写**而非覆盖，先读后写 |
| 🟡 中 | Zustand 与现有 SingleTab 内的 useState 衔接 | M1 阶段明确 store slice 边界，SingleTab 的 useState 保留（局部 UI 状态） |
| 🟡 中 | 启动参数解析的边界情况（路径含空格、中文） | M7 用 `Path::new` 规范化，参数解析容错 |
| 🟢 低 | Konva 渲染超大图（8000x6000）性能 | M3 阶段回归测试；如有问题，缩放默认用 Lanczos3 但 webgl 限制最大 4096x4096 |
| 🟢 低 | 缩略图 1000+ 张时的滚动卡顿 | M2 阶段用 IntersectionObserver + 缩略图生成异步队列 |

## 六、不在范围（Out of Scope）

- 图片搜索 / 标签 / 评分
- 缩略图磁盘缓存
- 远程图片 / S3
- 视频文件
- Linux / macOS 的"右键打开方式"集成
- 单图编辑的撤销栈（除已实现）
- 帮助内容的国际化（i18n）

## 七、验证标准（Definition of Done）

每个 Milestone 完成时：
1. `cargo build` 干净通过（0 警告 0 错误）
2. `npm run build` 通过
3. 该 Milestone 的"验证"条目全部跑通
4. 至少 1 次手动 `tauri dev` 全流程回归
5. commit message 用 Conventional Commits 格式
