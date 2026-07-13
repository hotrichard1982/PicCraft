# WORK-001-01: Rust 后端核心修复

## PLAN 来源

[PLAN-001-audit-fixes.md](PLAN-001-audit-fixes.md)

## 目标

修复 Rust 后端的 6 个审计问题：缓存正确性、代码重复、弃用 API、资源泄漏。

## 审计项与修复方案

### C2 + M1: 缩略图缓存 key 加入 mtime + 替换 DefaultHasher

**文件**：`src-tauri/src/image_ops.rs` 第 577-584 行

**当前**：缓存 key = `hash(path + max_width)`，用 `DefaultHasher`

**修改为**：缓存 key 纳入文件 `modified_at`，用字符串拼接替代哈希（同时解决 M1）

```rust
// 读取文件修改时间
let mtime = std::fs::metadata(&path)
    .and_then(|m| m.modified())
    .ok()
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map(|d| d.as_secs())
    .unwrap_or(0);

// 用字符串拼接做 cache key（避免 DefaultHasher 跨版本不稳定）
let cache_key = format!("{path}_{max_width}_{mtime}");
// 文件名用 sanitize 后的 path + mtime 组合
let safe_name = path.replace(['\\', '/', ':', ' '], "_");
let cache_file = cache_dir.join(format!("{safe_name}_{max_width}_{mtime}.png"));
```

**注意**：旧缓存文件名格式 `{hash:x}.png` 会自然失效（不会命中），无需主动清理。

### H5: 提取 parse_startup_args 和 parse_from_iter 公共逻辑

**文件**：`src-tauri/src/lib.rs` 第 33-68 行 + 第 141-174 行

**当前**：两个函数逻辑几乎相同，差异仅在输入类型

**修改为**：提取公共解析函数，两个入口调用它

```rust
fn parse_args_from_strings<I, S>(mut iter: I) -> StartupArgs
where
    I: Iterator<Item = S>,
    S: AsRef<str>,
{
    let first = match iter.next() {
        Some(a) => a,
        None => return StartupArgs::default(),
    };
    let first = first.as_ref();
    if first == "--edit" {
        let file = iter.next().map(|a| a.as_ref().to_string());
        return StartupArgs { mode: StartupMode::Edit, file, folder: None };
    }
    let p = Path::new(first);
    if p.is_dir() {
        StartupArgs { mode: StartupMode::Browse, file: None, folder: Some(first.to_string()) }
    } else {
        StartupArgs { mode: StartupMode::Browse, file: Some(first.to_string()), folder: None }
    }
}
```

`parse_startup_args` 改为：将 `args_os` 转为 `String` 迭代器后调用 `parse_args_from_strings`。
`parse_from_iter` 改为：直接委托 `parse_args_from_strings`。

### M7: crop → crop_imm

**文件**：`src-tauri/src/image_ops.rs` 第 151 行

**修改**：`img.crop(x, y, width, height)` → `img.crop_imm(x, y, width, height)`

### H3: 启动时清理残留临时文件

**文件**：`src-tauri/src/image_ops.rs`（新增函数）+ `src-tauri/src/lib.rs`（setup 中调用）

**新增函数**：
```rust
/// 清理上次运行残留的临时文件
pub fn cleanup_temp_files() {
    let temp_dir = std::env::temp_dir();
    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("piccraft_") {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}
```

**调用位置**：`lib.rs` 的 `setup` 闭包中，在 `app.manage(...)` 之前调用。

### H4: 缩略图磁盘缓存启动时清理

**文件**：`src-tauri/src/image_ops.rs`（新增函数）+ `src-tauri/src/lib.rs`（setup 中调用）

**新增函数**：
```rust
/// 清理缩略图磁盘缓存（超过 200MB 时按最旧修改时间淘汰）
pub fn cleanup_thumb_cache() {
    let cache_dir = std::env::temp_dir().join("piccraft_thumbs");
    let Ok(entries) = std::fs::read_dir(&cache_dir) else { return };
    let mut files: Vec<_> = entries.flatten()
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            Some((e.path(), meta.len(), meta.modified().ok()?))
        })
        .collect();
    let total: u64 = files.iter().map(|(_, sz, _)| *sz).sum();
    const MAX_CACHE_BYTES: u64 = 200 * 1024 * 1024; // 200 MB
    if total <= MAX_CACHE_BYTES { return; }
    // 按修改时间升序（最旧在前），删除直到总量降到阈值以下
    files.sort_by_key(|(_, _, mtime)| *mtime);
    let mut current = total;
    for (path, sz, _) in &files {
        if current <= MAX_CACHE_BYTES { break; }
        let _ = std::fs::remove_file(path);
        current -= *sz;
    }
}
```

**调用位置**：`lib.rs` 的 `setup` 闭包中，紧接 `cleanup_temp_files()` 之后。

## 允许修改

- `src-tauri/src/image_ops.rs`
- `src-tauri/src/lib.rs`

## 禁止修改

- `src-tauri/src/main.rs`
- `src-tauri/Cargo.toml`（不新增依赖）
- `src-tauri/tauri.conf.json`
- 任何前端文件

## 必须复用

- 现有的 `RNG_COUNTER`、`temp_file_path` 命名约定
- 现有的 `StartupMode`、`StartupArgs` 类型定义
- 现有的 `system_time_to_unix_secs` 函数

## TDD 步骤

1. 先为 `parse_args_from_strings` 编写测试（覆盖 cold / edit / browse-folder / browse-file 四种路径）
2. 修改 `parse_startup_args` 和 `parse_from_iter` 委托新函数
3. 确保现有测试 `test_parse_from_iter_cold`、`test_parse_from_iter_edit` 仍通过
4. 为 `cleanup_temp_files` 和 `cleanup_thumb_cache` 编写基本可用性测试（创建临时文件 → 调用清理 → 验证被删除）
5. 修改缓存 key 逻辑
6. 替换 `crop` → `crop_imm`

## 验证命令

```bash
cd src-tauri && cargo test && cargo build
```

## 通过标准

- [ ] `cargo test` 全部通过（含新增测试）
- [ ] `cargo build` 无 warning（deprecated 警告消除）
- [ ] `parse_startup_args` 和 `parse_from_iter` 不再有重复逻辑
- [ ] 缩略图缓存 key 包含 mtime
- [ ] 临时文件和缩略图缓存有启动清理机制

## 停止条件

- `cargo build` 失败 → 停止，检查 API 变更
- 测试编译失败 → 停止，修正测试代码

## 下一步

执行完成后，运行 verify 模式验证本工单。然后继续执行 WORK-001-02。
