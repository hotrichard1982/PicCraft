---
id: RECEIPT-WORK-003-03
work: WORK-003-03
status: completed
created: 2026-08-11
updated: 2026-08-11
---

# RECEIPT-WORK-003-03

## 范围说明

WORK-003-03 文档"允许修改"仅列测试；本次主代理委派额外授权两项生产代码改动（委派指令原文）：统一 `batch_process` 与 `batch_process_queue` 的敏感输入和输出路径校验；目录批处理遵守 `MAX_DIR_ENTRIES` 并有明确行为。签名与命令语义不变，未违反 ADR-0004（同目录输出仍放行，无新增禁止逻辑）。

## Changed Files（仓库内）

- `src-tauri/src/image_ops.rs`：生产代码（委派范围内）
  - 新增 `validate_batch_paths(inputs, output)`：批量命令统一的输入+输出敏感路径校验；输出 == 输入不禁止（ADR-0004）；`batch_process`（原无任何校验）与 `batch_process_queue`（原只校验输入）均改为调用，且校验先于输出目录创建
  - 新增 `collect_dir_image_entries(dir)`：目录图片扫描，数量超过 `MAX_DIR_ENTRIES` 时截断并 `log::warn!`（与 `read_dir` 命令既有行为一致）；`batch_process` 目录扫描改走此函数（原无上限）
  - 新增 `unique_batch_name(path, used_names)`：同批次重名自动加后缀（_1、_2…）纯函数，从 `execute_batch_processing` 提取，行为逐行等价（首次出现返回原文件名；重名时循环尝试后缀）
- `src-tauri/src/image_ops.rs`：测试模块（`#[cfg(test)]`）
  - 新增 37 个测试 + 测试辅助（`test_work_dir` 独立子目录、`make_test_image`、`img_dims`）
  - 新增 `TEMP_FILE_TEST_LOCK` 静态互斥锁：`test_cleanup_temp_files` 会删除临时目录根部所有 `piccraft_*` 文件，与依赖该类临时文件的测试（crop/resize 等）并发会互相删除；对该 2 个既有清理测试与新测试加锁串行化（测试隔离）
- `docs/plan/RECEIPT-WORK-003-03.md`（本回执，新增）
- `src-tauri/Cargo.toml` / `Cargo.lock`：未改动，零新依赖（含 dev-dependencies）

## TDD 证据

### RED

`cargo test --locked`（测试先行，生产函数尚未实现）：

```
error[E0425]: cannot find function `unique_batch_name` in this scope        (×6)
error[E0425]: cannot find function `validate_batch_paths` in this scope     (×5)
error[E0425]: cannot find function `collect_dir_image_entries` in this scope (×3)
error: could not compile `piccarft` (lib test) due to 14 previous errors
```

### GREEN

实现后 `cargo test --locked`：**53 passed**（基线 16 → +37），连续 3 次运行稳定通过（6.20s / 4.94s / 5.47s）。

## 新增测试覆盖

| 类别 | 测试 | 覆盖点 |
|---|---|---|
| 临时文件 | `test_temp_file_path_lives_in_temp_dir` / `_unique_per_call` / `_extension_fallback` | 位于系统临时目录、piccraft_ 前缀、后缀与扩展名规则、两次调用唯一 |
| 裁剪 | `test_crop_image_ok` / `_out_of_bounds` / `_zero_size` / `_sensitive_path_rejected` | 正常裁剪尺寸与临时文件、越界拒绝、零尺寸拒绝、敏感路径拒绝 |
| 缩放 | `test_resize_image_ok` / `_zero_target_rejected` / `_sensitive_path_rejected` | 目标尺寸、零目标拒绝、敏感路径拒绝 |
| 变换 | `test_transform_image_modes` / `_unsupported_mode` / `_sensitive_path_rejected` | flip-h/flip-v/rot-cw/rot-ccw 尺寸、未知模式拒绝、敏感路径拒绝 |
| 保存 | `test_save_image_jpeg_ok_and_temp_cleanup` / `_png_webp_bmp_ok` / `_png_quality_clamp` / `_unsupported_format` / `_sensitive_paths_rejected` | 各格式落盘、成功后临时文件清理、quality 0/101 clamp、未知格式拒绝、temp/save 双路径敏感拒绝 |
| 缩略图 | `test_make_thumbnail_scales_down` / `_jpeg_fast_path` / `_max_width_clamped` / `_zero_width_rejected` / `_sensitive_path_rejected` | PNG 输出与尺寸上限、JPEG 快速路径、max_width 截断到 1024、零宽拒绝、敏感路径拒绝 |
| 批量命名（WORK-003-04 后端行为依据） | `test_unique_batch_name_duplicates_suffixed` / `_distinct_filenames_kept`；`test_process_single_batch_same_dir_overwrites` / `_suffixed_output_keeps_both` / `_jpeg_output` / `_zero_width_rejected` | 重名加后缀规则；**同目录不重名直接覆盖原图（ADR-0004 原地替换语义）**；重名后缀输出时原图与输出并存 |
| 批量命令公共校验 | `test_validate_batch_paths_rejects_sensitive_input` / `_rejects_sensitive_output` / `_rejects_appdata_input` / `_same_dir_allowed` / `_safe_paths_ok` | batch_process/batch_process_queue 共用 seam：敏感输入/输出/AppData 拒绝，**同目录放行**（ADR-0004） |
| 目录扫描上限 | `test_collect_dir_image_entries_under_limit` / `_truncates_over_max` / `_empty_dir` | 大小写扩展名识别、超过 5000 截断、空目录返回空 |

说明：`batch_process`/`batch_process_queue` 命令本身需要 `tauri::AppHandle`，单测无法直接构造；统一校验在共享 seam `validate_batch_paths` 上覆盖（两命令均调用同一函数）。未启用 tauri `test` feature（避免改动生产依赖特性）。

## 验证命令结果

| 命令 | 结果 |
|---|---|
| `cd src-tauri && cargo test --locked` | 通过，53 passed（基线 16），3 次重复稳定；`--locked` 确认 Cargo.lock 未变更 |
| `cd src-tauri && cargo check --locked` | 通过，`Finished dev profile` |
| `cd src-tauri && cargo fmt --check` | 本次新增代码 **0 违规**（脚本精确比对）；剩余 54 处为基线既有违规（build.rs、image_ops.rs、lib.rs、main.rs），本次未运行 `cargo fmt` 以避免无关改动 |
| `cd src-tauri && cargo clippy --all-targets -- -D warnings` | **失败（基线既有）**：4 处错误全部位于本次未改动的存量代码（`image_ops.rs:100` redundant ok()、`:257` 多余 u32 强转、`:763`/`:764` 手写 div_ceil），本次未新增任何 clippy 违规，未越权修复 |
| 路径字面量 grep | 测试代码中的 Windows 路径均为**不存在的假路径**（仅用于触发校验逻辑，`canonicalize` 失败即走字符串判断，不触碰真实文件系统），与既有测试模式一致；所有真实 FS 操作仅限 `std::env::temp_dir()` 子路径 |
| `python tools/project_docs.py validate` | 通过（见下） |

## 通过标准核对（WORK-003-03）

- [x] `cargo test` 全部通过（53 passed）
- [x] 测试代码中不存在真实用户/系统路径字面量（假路径仅作校验输入，不读写真实目录）
- [ ] `cargo clippy --all-targets -- -D warnings` 通过 —— **未通过，4 处为基线既有错误，本次零新增**，需另开工单处理
- [x] 新增覆盖：`is_sensitive_path` 边界（批量校验 seam）、批量重名/同目录覆盖行为

## 测试暴露的存量缺陷（记录，未越权修复）

1. **`is_sensitive_path` 对系统临时目录字符串本身误判为敏感**：`std::env::temp_dir()` 返回带尾分隔符（`...\Temp\`），临时目录豁免用 `starts_with` 前缀匹配，仅对"临时目录+文件名"的路径生效；裸目录字符串（无尾分隔符）会继续命中 `\appdata\` 规则被判为敏感。影响：用户把系统临时目录直接作为批量输入/输出会被拒绝。真实工作流不受影响（临时豁免是为应用自身临时文件服务）。本工单测试改用中性目录断言 ADR-0004 语义，未修复该边界。
2. **`cargo clippy -D warnings` 4 处基线错误**与 **`cargo fmt --check` 54 处基线违规**：均为存量代码，建议随 WORK-003-05（CI 门禁）或独立工单统一清理。

## 风险与未决项

- clippy/fmt 存量债务非本工单引入，WORK-003-05 CI 若启用 `-D warnings`/fmt 检查将失败，需在 CI 工单中一并决策（清理存量或按现状放行）。
- `batch_process` 新增了原不具备的敏感路径校验与 MAX_DIR_ENTRIES 截断：均为收紧行为（拒绝系统敏感目录、超 5000 张截断并告警），同目录输出、重名后缀、命令签名与返回消息格式未变；与 WORK-003-04 的前端二次确认无冲突（ADR-0004 Rust 端无新增禁止逻辑）。
- 未提交、未推送、未 tag、未关闭 PLAN；工作区既有未提交变更（.gitignore、README.md、docs 等，来自 WORK-003-01/02 并行工作）未触碰。

## 审计补正段（PLAN-003 审计，2026-08-11）

审计发现本工单"禁止修改任何非测试生产代码"与实际执行的授权记录冲突，已在 `WORK-003-03-rust-test-safety.md` 与 `PLAN-003-stable-release-baseline.md` 补记主代理委派授权原文与理由（统一 `validate_batch_paths` 敏感校验、`MAX_DIR_ENTRIES` 截断）。本次补正追加：

- **确定性截断**：`collect_dir_image_entries` 改为**先按文件名排序再截断**（`read_dir` 返回顺序不保证，原实现超限时处理集合不确定）；返回类型改为 `(Vec<PathBuf>, bool)`，截断标志上抛。
- **返回结果清晰警告**：新增纯函数 `batch_result_with_truncation_warning`，`batch_process` 截断发生时在返回 `String` 末尾追加"（目录超过 5000 张上限，仅处理排序后前 5000 张，其余已跳过）"；未截断时消息原样返回，返回类型不变，前端兼容。
- **测试**：更新 3 个目录扫描测试（解构 tuple、断言 truncated 标志、超限断言截断保留的是排序后最小文件名集合并整体升序）；新增 `test_batch_result_with_truncation_warning`（命令本身需 AppHandle 无法单测，警告拼接在共享纯函数 seam 覆盖，与既有说明一致）。`cargo test --locked`：**54 passed**（基线 53 → 补正后 54）。
