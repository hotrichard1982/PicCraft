---
id: RECEIPT-WORK-004-01
work: WORK-004-01
status: completed
created: 2026-08-12
updated: 2026-08-12
---

# RECEIPT-WORK-004-01

## 范围说明

WORK-004-01「Rust 平台安全路径与 Finder 打开事件」：`is_sensitive_path` 增加 macOS 平台分支（平台无关纯函数，Windows 上可完整单测）；`RunEvent::Opened { urls }` 接入 Finder 打开事件，与 argv 解析复用同一路由语义；单实例场景沿用 `tauri-plugin-single-instance` 既有 argv 转发链路（State + emit + 焦点），Finder 打开事件在已运行实例经 `handle_finder_opened` 同链路处理。未改动 Windows 行为与既有测试；未新增 crate 依赖（`--locked` 验证 Cargo.lock 未变更）。

## Changed Files（仓库内）

- `src-tauri/src/image_ops.rs`（生产代码 + 测试）
  - `is_sensitive_path`（行 568）平台化：macOS 编译目标走 `is_sensitive_macos_path`（行 571-576，canonicalize 后传入，与 Windows 分支同构）；非 macOS（含 Windows）分支为原实现整体移入 `#[cfg(not(target_os = "macos"))]` 块（行 578-622），**行为逐行不变**（58 个既有测试全绿证明）
  - 新增平台无关纯函数 `is_sensitive_macos_path(path: &str) -> bool`（行 629-677，`#[cfg(any(target_os = "macos", test))]`）：字符串级、大小写不敏感判定
    - 禁止：`/System`、`/Library`、`/private`（含子路径）；用户 Library（`~/Library` 与 `/Users/<user>/Library` 两种形式）
    - 允许：用户普通目录（`/Users/<user>/**` 除 Library）、`/Users/<user>` 自身、`~` 自身、`/Users`、`/Applications`、用户临时目录（`/var/folders/...` 与 canonicalize 后的 `/private/var/folders/...` 两种前缀）
    - temp 豁免先于 `/private` 禁止规则（macOS 上 `/var` 是 `/private/var` 的符号链接，canonicalize 后临时目录落在 `/private` 之下，必须优先放行）
    - 不套 Windows 的 `\appdata\` 规则
  - `is_under_temp_dir`（行 553-555）加 `#[cfg(any(not(target_os = "macos"), test))]`：macOS 生产构建不被引用（避免 dead_code），测试模块全平台可用（矩阵测试保持编译运行）
  - 测试模块新增 5 个 macOS 规则测试（行 1918 起）：禁止目录 / 用户 Library（两种形式）/ 允许目录 / Applications 与临时目录 / 大小写不敏感矩阵
- `src-tauri/src/lib.rs`（生产代码 + 测试）
  - `run()` 启动链：`.run(generate_context!())` 改为 `.build(generate_context!()).expect(...).run(回调)`（行 107-127）；回调中 `#[cfg(target_os = "macos")]` 块匹配 `RunEvent::Opened { urls }` → `handle_finder_opened`（行 112-121）。注意：tauri 2.11.2 的 `App::run` 返回 `()`（非 Result），且 `RunEvent::Opened` 变体被 tauri 源码 `#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]` 包裹，Windows 编译目标下变体不存在，故匹配 arm 必须 cfg 包裹
  - 新增平台无关纯函数 `urls_to_paths(urls) -> Vec<String>`（行 182，`#[cfg(any(target_os = "macos", test))]`）：`file://` URL → 本地路径（`to_file_path`），非 file scheme / 无效 URL 过滤，保持原顺序
  - 新增 `parse_opened_urls(urls) -> StartupArgs`（行 194，同 cfg）：与 argv 解析复用同一 `parse_args_from_strings` 语义——单文件 → Browse+file（前端定位该图）；多文件 → `take(1)` 只取第一个路径（前端按第一张图片所在目录浏览）；目录 → Browse+folder（is_dir 语义）；空/全过滤 → Cold
  - 新增 `handle_finder_opened(app, urls)`（行 204，`#[cfg(target_os = "macos")]` 仅 macOS，胶水函数）：URL → 路径 → StartupArgs → 更新 `StartupArgsInner` State + `app.emit("finder-opened", &paths)`（payload 为完整路径数组）+ 主窗口焦点；与 single-instance argv 转发同一链路
  - 测试模块新增 9 个测试（行 284 起）：单文件 / 多文件保序 / 百分号解码 / 非 file scheme 过滤 / 单文件 Browse / 多文件取第一个 / 非图片文件（不校验扩展名）/ 目录（真实临时目录构造 URL）/ 空与全过滤 → Cold
- `docs/plan/RECEIPT-WORK-004-01.md`（本回执，新增）

## TDD 证据

### RED

测试先行（仅新增测试，生产函数未实现），`cargo test --locked` 编译失败：

```
error[E0425]: cannot find function `is_sensitive_macos_path` in this scope   (×34)
error[E0425]: cannot find function `parse_opened_urls` in this scope         (×6)
error[E0425]: cannot find function `urls_to_paths` in this scope             (×4)
error: could not compile `piccarft` (lib test) due to 44 previous errors
```

### GREEN

实现后 `cargo test --locked`：**72 passed**（基线 58 → +14 = 5 macOS 规则 + 9 Finder 解析），连续 2 次运行稳定（4.24s / 6.68s）。`cargo check --locked` 通过（`Finished dev profile`）。`git diff --check` 无输出（通过）。

## 新增测试覆盖

| 类别 | 测试 | 覆盖点 |
|---|---|---|
| macOS 规则-禁止 | `test_is_sensitive_macos_rejects_system_dirs` | `/System`、`/Library`、`/private` 及其子路径拒绝 |
| macOS 规则-用户 Library | `test_is_sensitive_macos_rejects_user_library` | `/Users/<user>/Library` 与 `~/Library` 两种形式及子路径拒绝 |
| macOS 规则-允许 | `test_is_sensitive_macos_allows_user_dirs` | `/Users`、`/Users/<user>`、用户普通目录、`~`、`~/Pictures` 放行 |
| macOS 规则-Applications/temp | `test_is_sensitive_macos_allows_applications_and_temp` | `/Applications` 放行；`/var/folders/...` 与 canonicalize 后 `/private/var/folders/...` 放行（temp 豁免先于 /private 规则） |
| macOS 规则-大小写 | `test_is_sensitive_macos_case_insensitive` | `/system`、`/SYSTEM`、`/LIBRARY`、`/USERS/ALICE/LIBRARY` 命中；`/USERS/ALICE/PICTURES`、`/VAR/FOLDERS/...` 放行 |
| URL 解析 | `test_urls_to_paths_single_file` / `_multiple_keeps_order` / `_percent_encoded` / `_filters_non_file_scheme` | file:// 提取、顺序保持、百分号解码、非 file scheme 过滤 |
| Finder 路由语义 | `test_parse_opened_urls_single_file_browse` / `_multiple_takes_first` / `_non_image_file` / `_directory` / `_empty_is_cold` | 单文件 Browse+file；多文件只取第一个；非图片不校验扩展名（与 argv 一致）；目录 Browse+folder（真实临时目录）；空/全过滤 → Cold |

说明：`handle_finder_opened`（emit/焦点/State 更新）需要 `tauri::AppHandle`，单测无法构造；URL 解析与路由语义在共享纯函数 `urls_to_paths` / `parse_opened_urls` 上覆盖（与既有 `batch_process` 的 seam 测试口径一致）。未启用 tauri `test` feature（不改变生产依赖特性）。

## 与前端约定（WORK-004-02 消费）

- 事件名：`finder-opened`
- payload：`Vec<String>`（完整路径数组，原顺序，字符串形式本地绝对路径）
- 语义：后端 State 已更新为「第一个路径的 Browse 语义」（单文件定位 / 多文件按第一张）；前端收到事件后按数组第一张图片所在目录浏览并定位，多文件不自动加入队列（PRD-002）
- 启动时刻（首实例冷启动被 Finder 触发）：事件在 setup 后 emit，前端正常监听；二次实例场景由 single-instance 插件拦截，已运行实例走 `RunEvent::Opened` → 同链路（State + emit + 焦点）

## 验证边界（诚实记录）

1. **macOS 分支无法在 Windows 上编译**：本机 rustup 仅安装 `x86_64-pc-windows-msvc` 单一 target，无 macOS 交叉编译工具链；`#[cfg(target_os = "macos")]` 块（`is_sensitive_path` macOS 分支、`RunEvent::Opened` 匹配、`handle_finder_opened`）在 Windows 构建中不编译。
2. **缓解措施**：macOS 判定逻辑全部纯函数化（`is_sensitive_macos_path`），Windows 测试构建（`#[cfg(any(target_os = "macos", test))]`）完整单测全部 macOS 规则；`RunEvent::Opened` 匹配 arm 的 cfg 条件与 tauri 2.11.2 源码变体 cfg（`target_os = "macos"`）逐字一致（已读 tauri-2.11.2/src/app.rs 行 261-270 确认），风险最低；`App::run` 返回 `()` 已按 tauri 2.11.2 源码（app.rs 行 1358）适配。
3. **macOS 路径形态的 `to_file_path` 行为**：url crate 按编译目标解析 file URL（Windows 目标要求盘符），`file:///Users/...` 形式的 macOS 路径在 Windows 测试中无法构造；URL 解析链路（过滤、解码、顺序、取第一个、is_dir 语义）用 Windows 形态 file URL 完整覆盖，macOS 路径形态的解析需真机/CI 验证。
4. **剩余 macOS 真机项**（需 WORK-004-04 CI 或真机）：`RunEvent::Opened` 端到端触发、单实例 Finder 转发、`/var` → `/private/var` canonicalize 行为、大小写不敏感文件系统上的真实路径命中。

## 验证命令结果

| 命令 | 结果 |
|---|---|
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 通过，72 passed（基线 58 → +14），2 次重复稳定；`--locked` 确认 Cargo.lock 未变更 |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked` | 通过，`Finished dev profile`，0 warning |
| `git diff --check` | 无输出（通过） |

## 通过标准核对（WORK-004-01）

- [x] macOS 安全路径测试：禁止目录拒绝、允许目录放行、`~/Library` 拒绝、`~` 放行、大小写语义测试
- [x] 打开事件解析测试：单文件 / 多文件 / 非图片 / 目录 / 空
- [x] `cargo test --locked` 全绿（既有 58 + 新增 14 = 72）
- [x] `cargo check --locked` 通过
- [x] 回执记录 RED/GREEN 证据
- [x] Windows 行为与既有测试未改动（`is_sensitive_path` 非 macOS 分支逐行保留，58 全绿）

## 风险与未决项

- macOS 分支仅编译级隔离验证（见验证边界），真实编译与行为需 macOS CI（WORK-004-04）与真机确认；若 CI 编译 macOS 分支发现问题（如 `RunEvent` 其它 cfg 差异），本工单需返工。
- `is_sensitive_macos_path` 对 `canonicalize` 失败（路径不存在）的输入走原始字符串判定；canonicalize 成功时 `/var` 系符号链接展开为 `/private/var`，两种前缀均已覆盖，行为一致。
- `/System/Volumes/...` 形态路径（若 canonicalize 将 firmlink 展开）会命中 `/system/` 前缀被拒绝——安全优先方向（误拒绝优于误放行），真实 macOS 上 `realpath` 不展开 firmlink，预期不影响用户图片目录。
- 工作区既有未提交变更（WORK-004-03 并行：Cargo.toml/lock、tauri.conf.json、tauri.macos.conf.json、前端等）未触碰；本工单仅改动 `src-tauri/src/lib.rs`、`src-tauri/src/image_ops.rs` 与本回执。未提交、未推送、未关闭 PLAN。
