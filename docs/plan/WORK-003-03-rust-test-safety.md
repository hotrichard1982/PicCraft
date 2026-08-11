# WORK-003-03: Rust 测试安全

## PLAN 来源

[PLAN-003-stable-release-baseline.md](PLAN-003-stable-release-baseline.md)

## 目标

- Rust 测试全部隔离在临时目录（`std::env::temp_dir()` / `tempfile`），**不得触碰用户真实目录或系统目录**
- 覆盖安全相关纯函数（`is_sensitive_path`、`check_file_size_path`、`png_colors` 等）边界用例
- 补足批量处理重名/同目录覆盖行为的单元测试（为 WORK-003-04 的前端确认提供后端行为依据）

## 依赖

- WORK-003-01（Rust 工具链锁定）

## 允许修改

- `src-tauri/src/image_ops.rs`、`src-tauri/src/lib.rs`（仅 `#[cfg(test)]` 测试模块内新增/修改）
- `src-tauri/Cargo.toml`（仅 dev-dependencies，如需 `tempfile`）
- 新增测试辅助文件（如 `src-tauri/tests/`，仅测试）

## 禁止修改

- 任何非测试生产代码（`#[cfg(test)]` 之外）
- 测试中不得写入 `C:\Users\**`、`C:\Windows\**` 及项目目录外的真实路径
- 不得依赖真实文件系统状态（不得读取用户目录真实图片）
- 不新增运行时依赖（仅 dev-dependencies）

## 委派授权补记（PLAN-003 审计补正，2026-08-11）

上方"禁止修改任何非测试生产代码"与本工单实际执行冲突，特此补记主代理明确委派的两项生产代码授权（委派指令原文），消除范围记录冲突：

1. **统一 `batch_process` 与 `batch_process_queue` 的敏感输入/输出路径校验**：原 `batch_process` 无任何路径校验、`batch_process_queue` 仅校验输入，存在经批量入口访问系统敏感目录的隐患；授权在共享 seam `validate_batch_paths` 上统一收紧，校验先于输出目录创建。签名与命令语义不变，未违反 ADR-0004（同目录输出仍放行）。
2. **目录批处理遵守 `MAX_DIR_ENTRIES` 上限**：原目录扫描无上限，授权新增 `collect_dir_image_entries` 扫描截断（>5000 排序后截断并告警，与 `read_dir` 命令既有行为一致），防止超限时处理集合不确定。

以上授权的实现细节、TDD 证据与测试覆盖见 `RECEIPT-WORK-003-03.md`。审计后补充：截断改为**先按文件名排序再截断**（确定性）并在 `batch_process` 返回消息末尾追加跳过警告（`batch_result_with_truncation_warning`，返回类型仍为 `String`，前端兼容）。

## 必须复用

- 现有 `#[cfg(test)] mod tests` 模块与临时文件模式（`tempfile` 或手动 `std::env::temp_dir()`）
- 现有 `is_sensitive_path`、`check_file_size_path`、`png_colors` 等纯函数

## TDD 步骤

1. 先编写失败测试：敏感路径边界（`C:\Windows\**`、`AppData\**` 拒绝；普通路径放行）、临时文件创建/清理、批量同名与同目录覆盖行为
2. 运行 `cargo test` 确认红（若测试暴露生产代码缺陷则记录，不越权改生产代码，汇报）
3. 若仅测试设施问题，修复测试代码使其绿
4. 全量 `cargo test` 通过

## 验证命令

```bash
cd src-tauri && cargo test
cd src-tauri && cargo clippy --all-targets -- -D warnings
```

## 通过标准

- [ ] `cargo test` 全部通过
- [ ] 测试代码中不存在真实用户/系统路径字面量（grep 检查）
- [ ] `cargo clippy --all-targets -- -D warnings` 通过
- [ ] 新增覆盖：`is_sensitive_path` 边界、批量重名/同目录覆盖行为

## 停止条件

- 测试暴露生产代码缺陷且修复超出本工单范围 → 停止，汇报另开 BUG/WORK
- 平台差异（Windows 路径大小写、权限）导致测试不稳定 → 停止，汇报

## 下一步

执行完成后运行 verify 模式验证本工单，然后继续 WORK-003-05（CI 依赖本工单测试全绿）。
