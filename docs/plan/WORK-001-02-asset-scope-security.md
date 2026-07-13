# WORK-001-02: Asset 协议安全收紧

## PLAN 来源

[PLAN-001-audit-fixes.md](PLAN-001-audit-fixes.md)

## 目标

将 `assetProtocol.scope` 从 `["**"]` 收紧为排除系统敏感目录，同时保证用户可正常浏览任意非敏感目录的图片。

## 用户决策

> C1 只排除系统敏感目录，其它的目录要保留，不然用户怎么浏览图片？

排除以下路径（Windows）：
- `C:\Windows\**`
- `C:\Users\*\AppData\**`
- `C:\Program Files\**`
- `C:\Program Files (x86)\**`

保留其他所有目录可访问。

## 技术方案

Tauri v2 的 `assetProtocol.scope` 支持 glob 数组。经查 Tauri v2 文档，scope 数组是**允许列表**（allowlist），不支持排除语法（`!`）。

因此采用**白名单 + Rust 端路径校验**双层方案：

### 第一层：tauri.conf.json scope 保持宽泛

`assetProtocol.scope` 保持 `["**"]` 不变（因为 Tauri 不支持排除模式）。

### 第二层：Rust 端新增路径校验函数

在 `image_ops.rs` 新增 `is_sensitive_path(path: &str) -> bool`，在 `read_dir`、`make_thumbnail`、`get_image_info`、`get_file_meta` 等接收路径的命令入口处调用。

```rust
/// 检查路径是否属于系统敏感目录
fn is_sensitive_path(path: &str) -> bool {
    let canonical = std::fs::canonicalize(path)
        .unwrap_or_else(|_| PathBuf::from(path));
    let path_str = canonical.to_string_lossy().to_lowercase();

    // Windows 敏感目录
    let sensitive_prefixes = [
        r"c:\windows",
        r"c:\program files",
        r"c:\program files (x86)",
    ];
    for prefix in &sensitive_prefixes {
        if path_str.starts_with(prefix) {
            return true;
        }
    }
    // AppData 目录（所有用户）
    if path_str.contains(r"\appdata\") {
        return true;
    }
    false
}
```

在每个 Tauri 命令入口处添加校验：
```rust
if is_sensitive_path(&path) {
    return Err("安全限制：不允许访问系统敏感目录".to_string());
}
```

**需要添加校验的命令**：
- `get_image_info`
- `resize_image`
- `crop_image`
- `transform_image`
- `apply_transforms`
- `save_image`（检查 `temp_path` 和 `save_path`）
- `read_dir`
- `make_thumbnail`
- `get_file_meta`
- `batch_process_queue`（检查每个 path）

`list_subdirs` 不校验（目录浏览需要能看见这些目录，只是不能读取里面的文件）。

## 允许修改

- `src-tauri/src/image_ops.rs`（新增 `is_sensitive_path` + 在命令入口添加校验）

## 禁止修改

- `src-tauri/tauri.conf.json`（scope 保持 `["**"]`）
- `src-tauri/src/lib.rs`
- 任何前端文件

## 必须复用

- 现有的 `check_file_size` / `check_file_size_path` 校验模式（在它们之后调用 `is_sensitive_path`）

## TDD 步骤

1. 编写 `is_sensitive_path` 测试用例：
   - `C:\Windows\System32\cmd.exe` → true
   - `C:\Users\test\AppData\Local\foo` → true
   - `C:\Program Files\bar` → true
   - `D:\Pictures\photo.jpg` → false
   - `C:\Users\test\Pictures\photo.jpg` → false
2. 实现函数
3. 在各命令入口添加校验

## 验证命令

```bash
cd src-tauri && cargo test && cargo build
```

## 通过标准

- [ ] `cargo test` 全部通过（含 `is_sensitive_path` 测试）
- [ ] `cargo build` 成功
- [ ] 敏感路径被拒绝，非敏感路径正常工作
- [ ] `list_subdirs` 不受限制（可以浏览目录树）

## 停止条件

- 如果发现 Tauri v2 的 scope 实际上支持排除语法 → 停止，改为 scope 层面排除（更安全）
- `cargo build` 失败 → 停止，修正

## 下一步

执行完成后，运行 verify 模式验证本工单。然后继续执行 WORK-001-03。
