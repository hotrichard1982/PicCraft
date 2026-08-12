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

---

## 返工段（测试模块平台化，2026-08-12）

> 主代理验收缺陷：WORK-004-04（macOS CI 双架构）将真实编译并运行 `cargo test`，本工单原测试模块无平台保护，macOS 上必失败。本段为全部返工内容，未改任何生产逻辑。

### 缺陷清单与处理

**image_ops.rs — 新增 `#[cfg(windows)]`（15 处）**

| # | 测试 | 处理理由 |
|---|---|---|
| 1 | `test_is_sensitive_path_windows` | `C:\Windows`、`C:\Users\...\AppData` 断言拒绝；macOS 分支（`is_sensitive_macos_path`）对这些形态不命中 → 断言失败 |
| 2 | `test_is_sensitive_path_safe_paths` | `D:\` / `C:\Users\test\Pictures` 安全路径断言；macOS 分支对 `\` 形态恒放行，测试无断言价值且非 macOS 合法路径形态 |
| 3 | `test_is_sensitive_path_other_appdata_still_rejected` | `C:\Users\someuser\AppData\...` 断言拒绝；macOS 分支不套 `\appdata\` 规则 → 失败 |
| 4 | `test_crop_image_sensitive_path_rejected` | `C:\Windows\System32\fake.png` 在 macOS 不敏感 → 错误不含「安全限制」→ 失败 |
| 5 | `test_resize_image_sensitive_path_rejected` | 同上 |
| 6 | `test_transform_image_sensitive_path_rejected` | 同上 |
| 7 | `test_save_image_sensitive_paths_rejected` | 同上 |
| 8 | `test_make_thumbnail_sensitive_path_rejected` | 同上 |
| 9 | `test_unique_batch_name_duplicates_suffixed` | `Path::file_name()` 在 Unix 上对 `D:\photos\a.png`（无 `/`）返回整串文件名 ≠ "a.png" → 失败 |
| 10 | `test_unique_batch_name_distinct_filenames_kept` | 同上 |
| 11 | `test_validate_batch_paths_rejects_sensitive_input` | `C:\Windows\System32` 在 macOS 不敏感 → 返回 Ok → `unwrap_err()` panic → 失败 |
| 12 | `test_validate_batch_paths_rejects_sensitive_output` | 同上（`C:\Program Files\out`） |
| 13 | `test_validate_batch_paths_rejects_appdata_input` | 同上（`C:\Users\alice\AppData\...`） |
| 14 | `test_validate_batch_paths_same_dir_allowed` | `D:\Pictures\batch` 为 Windows 语义路径；macOS 恒通过但测不出「放行」语义，与 #11-13 同族统一 cfg |
| 15 | `test_validate_batch_paths_safe_paths_ok` | 同上 |

**image_ops.rs — 保留不加 cfg（已逐项核实 macOS 安全）**

- `test_is_sensitive_path_temp_dir_exempt`：真实 `std::env::temp_dir()`；macOS 上 temp 位于 `/var/folders/...`（canonicalize 后 `/private/var/folders/...`），`is_sensitive_macos_path` temp 豁免两种前缀均放行 → 断言成立
- `test_is_sensitive_path_temp_dir_itself_exempt`：macOS temp 路径不含 `\appdata\`，`bare.to_lowercase().contains(r"\appdata\")` 为 false → 提前 return 跳过，安全
- `test_is_under_temp_dir_short_long_name_matrix` / `test_is_under_temp_dir_edge_cases_no_panic`：`is_under_temp_dir` 为纯字符串比较（`\` 分隔 + `starts_with`，无平台 API），Windows 形态字符串在 macOS 判定结果一致 → 通过；同时保持该函数（cfg `any(not(target_os = "macos"), test)`）在 macOS 测试构建被引用，避免 dead_code
- `test_temp_file_path_lives_in_temp_dir` / `test_temp_file_path_unique_per_call` / `test_temp_file_path_extension_fallback`：macOS 上 `Path::new(r"D:\Pictures\photo.jpg")` 整串为单组件（`\` 非 Unix 分隔符），`file_stem`/`extension` 为字符串级解析，断言仅检查前缀/后缀/父目录/唯一性 → 通过

**lib.rs — URL 测试平台化（7 个测试 + 1 个辅助函数）**

- 方案选择：**运行时按平台构造测试数据**（`cfg!(windows)` 分支），放弃双份 `#[cfg(windows)]`/`#[cfg(not(windows))]` 测试。理由：7 个测试共 9 处 URL 字面量，双份方案会复制整个测试体（维护双倍）；`cfg!(windows)` 分支保持测试体单份、断言仍为平台合法字面量（非运行时推导拼装），与 `run()` 中既有 `cfg!(debug_assertions)` 风格一致。`to_file_path` 按编译目标解析，Windows 目标要求盘符（`file:///C:/...` → `C:\...`），Unix 目标无盘符（`file:///tmp/...` → `/tmp/...`）
- 新增 `test` 模块辅助函数 `file_url_pair(rel) -> (tauri::Url, String)`：Windows 产 `file:///C:/<rel>` + `C:\<rel>`，Unix 产 `file:///tmp/<rel>` + `/tmp/<rel>`
- 改造：`test_urls_to_paths_single_file` / `_multiple_keeps_order` / `_percent_encoded` / `_filters_non_file_scheme`、`test_parse_opened_urls_single_file_browse` / `_multiple_takes_first` / `_non_image_file`（百分号解码测试期望路径按平台字面量显式断言）
- 保留不改：`test_parse_opened_urls_directory`（真实 temp_dir + `Url::from_file_path` 往返，平台对称构造）、`test_parse_opened_urls_empty_is_cold`（仅 https URL，平台无关）、`test_parse_edit` / `_from_iter_edit`（`--edit` 模式不解析 Path，字符串往返）、`test_parse_browse_file`（`is_dir()` 对不存在路径两边同为 false）

**编译级排查（第 3 项）**

- 两文件均无 `std::os::windows::*` / `OsStrExt` 等平台 API 无条件引用（grep 确认）
- 生产代码平台 cfg（`list_subdirs` 驱动列表、`file_assoc` 注册表模块 `#[cfg(target_os = "windows")]`、`check_file_assoc` 双分支）与测试模块无交叉，macOS 走 `not(target_os = "windows")` 分支
- macOS 测试构建下无 dead_code 风险：`is_sensitive_path`（macOS 分支被 crop/resize 等生产引用）、`validate_batch_paths`（batch_process 引用）、`unique_batch_name`（execute_batch_processing 引用）、`temp_file_path`（各生产函数引用）、`is_under_temp_dir`（保留的 2 个测试引用）、`urls_to_paths`/`parse_opened_urls`（`handle_finder_opened` 引用）、`handle_finder_opened`（`run()` 引用，依赖 `app.emit`/`get_webview_window`/`app.state` 均为 AppHandle 方法且 Emitter/Manager 已 use）

### 验证结果

| 命令 | 结果 |
|---|---|
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 通过，**72 passed / 0 failed / 0 warning**（Windows 上数量与修改前一致：`cfg(windows)` 在 Windows 全真、lib.rs 改造不改测试数量；首次运行暴露 `file_url_pair` 期望缺 `C:\` 前缀，修正后全绿） |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked` | 通过，`Finished dev profile`，0 warning |
| `git diff --check` | 无输出（通过） |

**macOS 验证边界（诚实记录）**：本机 rustup 仅 `x86_64-pc-windows-msvc` 单一 target，无 macOS 交叉编译工具链，以下均为 cfg 推导 + 代码审查结论，未经真实编译：macOS 测试数 = 72 − 15（cfg(windows) 排除）+ 0 = **57**；`file:///tmp/...` → `/tmp/...` 解析、temp 目录豁免、`test_parse_opened_urls_directory` 的 from_file_path/to_file_path 往返尾分隔符行为均需 WORK-004-04 macOS CI 真实验证；若 CI 仍有编译或测试失败，再次返工。

### 本返工段改动文件

- `src-tauri/src/image_ops.rs`（仅测试模块 15 处 `#[cfg(windows)]` + 1 处分组注释，生产代码 0 改动）
- `src-tauri/src/lib.rs`（仅测试模块：`file_url_pair` 辅助函数 + 7 个 URL 测试平台化，生产代码 0 改动）
- `docs/plan/RECEIPT-WORK-004-01.md`（本返工段）

未提交、未推送、未关闭 PLAN。

---

## 返工段二（macOS URL 目录测试尾斜杠，2026-08-12）

> 主代理验收缺陷：Run 31543334421（macOS arm64，Rust 测试步骤）`test_parse_opened_urls_directory` 失败——macOS `std::env::temp_dir()` 返回带尾斜杠（`/var/folders/.../T/`，源自 TMPDIR），expected 构造只 `trim_end_matches('\\')`（Windows 反斜杠）无法去掉 `/`；而 `parse_opened_urls` → `to_file_path()` 返回规范化路径（无尾分隔符）→ 断言 `folder` 不匹配。Windows 上 temp_dir() 返回带尾 `\` 且 trim 生效，故 Windows 通过、macOS 失败。未改任何生产逻辑。

### 根因

- macOS：`temp_dir()` = `/var/folders/<...>/T/`（尾 `/`）；`to_file_path` 往返后 `args.folder` = `/var/folders/<...>/T`（无尾分隔符）
- `trim_end_matches('\\')` 只处理反斜杠 → expected 保留尾 `/` → `left: .../T` ≠ `right: .../T/`

### 修复（单点小改动，仅测试模块）

- `src-tauri/src/lib.rs`（`test_parse_opened_urls_directory`，expected 构造）：`trim_end_matches('\\')` → `trim_end_matches(|c| c == '\\' || c == '/')`，双分隔符统一去尾
- `src-tauri/src/image_ops.rs`（`test_is_sensitive_path_temp_dir_itself_exempt`，同类隐患一并修复）：`strip_suffix('\\')` → `strip_suffix(|c| c == '\\' || c == '/')`

### 同类排查清单（grep `trim_end_matches` / `strip_suffix('\\')` / `ends_with("\\\\")`）

| 位置 | macOS 行为结论 | 处理 |
|---|---|---|
| `lib.rs:379` `trim_end_matches('\\')` | temp_dir() 尾 `/` 去不掉 → 断言失败（主缺陷，Run 31543334421） | **已修复**（双分隔符） |
| `image_ops.rs:556/562` `is_under_temp_dir` 内 `strip_suffix('\\')` | 函数 cfg `any(not(target_os = "macos"), test)`：macOS 生产路径不引用（`is_sensitive_path` macOS 分支走 `is_sensitive_macos_path`）；仅测试调用且输入为 Windows 字面量（`r"c:\temp\"` 等），`strip_suffix('\\')` 对字面量行为两平台一致 → macOS 测试通过，无失败风险 | **不改**（属生产代码区，按任务边界；无实际隐患） |
| `image_ops.rs:631` `is_sensitive_macos_path` 内 `strip_suffix('/')` | macOS 专用纯函数，路径分隔符即 `/`，strip 语义正确；既有测试已覆盖带尾斜杠形态（`"/var/folders/ab/cd/T/"`） | **不改**（行为正确） |
| `image_ops.rs:1197` `test_is_sensitive_path_temp_dir_itself_exempt` 内 `strip_suffix('\\')` | macOS 上 strip 无效（尾分隔符为 `/`），bare 保留尾 `/`；macOS 路径不含 `\appdata\` → `contains` 恒 false → 提前 return 跳过（测试不失败，但 strip 语义失效属同类隐患） | **已修复**（双分隔符，macOS 行为不变仍跳过） |

### 验证结果（本地 Windows）

| 命令 | 结果 |
|---|---|
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 通过，**72 passed / 0 failed**（与修改前数量一致） |
| `cargo check --manifest-path src-tauri/Cargo.toml --locked` | 通过，`Finished dev profile`，0 warning |
| `git diff --check` | 无输出（通过） |
| `cargo fmt --check` | 仅报存量 `build.rs` 格式差异（本次未触碰该文件），本返工改动两文件无格式差异 |

### 远端复验（Run 31547117391，push a7d2cca）

- **macOS arm64（job 93961888929）**：Rust 测试步骤 **57 passed / 0 failed**（`test result: ok. 57 passed`，与返工段一预测的 57 一致），其中 `test tests::test_parse_opened_urls_directory ... ok` —— 本返工修复目标达成
- job 最终失败于 workflow 最后一个「产物架构校验」步骤（**非测试代码问题**，且该步骤在历史 Run 31543334421 中因测试步骤先行失败从未执行到）：
  ```
  fatal error: .../lipo: can't open input file: src-tauri/target/release/bundle/macos/piccarft.app/Contents/MacOS/piccarft (No such file or directory)
  ##[error]Process completed with exit code 1.
  ```
  根因：tauri `tauri build` 先产 `bundle/macos/piccarft.app` 再打 DMG，`bundle_dmg.sh` 完成时清理/移除了中间 `.app`（日志：`Cleaning .../bundle/macos/piccarft.app`、`Finished 1 bundle at: .../piccarft_0.3.0_aarch64.dmg`），而 workflow 的 lipo 架构校验仍指向已不存在的 `.app` 路径。属 WORK-004-04 的 workflow 缺陷，按任务边界未修改 workflow，移交主代理。
- **macOS x64（job 93961888868）**：截至复验结束仍 `queued`（公共 macOS runner 队列拥堵，>15 分钟未开始），结论未出；与 arm64 同 workflow、同代码，预期同结论。
- **Windows 质量门禁（job 93961888843）**：`success`。
- 结论：本返工目标（macOS arm64 Rust 测试全绿）已达成；Run 整体非绿由 workflow 产物校验缺陷导致，与本次代码改动无关。

### 本返工段改动文件

- `src-tauri/src/lib.rs`（仅测试模块 1 处 expected 构造）
- `src-tauri/src/image_ops.rs`（仅测试模块 1 处，生产代码 0 改动）
- `docs/plan/RECEIPT-WORK-004-01.md`（本返工段）
