# WORK-001-04: 测试补充

## PLAN 来源

[PLAN-001-audit-fixes.md](PLAN-001-audit-fixes.md)

## 目标

为前端核心逻辑和后端纯函数补充单元测试，建立测试基础设施。

## 依赖

- WORK-001-01 完成（后端函数签名已稳定）
- WORK-001-03 完成（前端组件结构已稳定）

## 审计项与修复方案

### H2: 后端测试补充

**文件**：`src-tauri/src/image_ops.rs`（在现有 `#[cfg(test)] mod tests` 中新增）+ `src-tauri/src/lib.rs`（在现有测试模块中新增）

需要测试的函数：

1. **`png_colors`** — 边界值测试
   ```rust
   #[test]
   fn test_png_colors_bounds() {
       assert_eq!(png_colors(1), 16);      // 最低质量 → 16 色
       assert_eq!(png_colors(100), 256);   // 最高质量 → 256 色
       assert_eq!(png_colors(0), 16);      // clamp 到 1
       assert_eq!(png_colors(101), 256);   // clamp 到 100
   }
   ```

2. **`check_file_size_path`** — 需要创建临时文件测试
   ```rust
   #[test]
   fn test_check_file_size_ok() {
       let temp = tempfile::NamedTempFile::new().unwrap();
       std::fs::write(&temp, b"small").unwrap();
       assert!(check_file_size_path(temp.path()).is_ok());
   }
   ```
   注意：需要 `tempfile` dev-dependency，或手动用 `std::env::temp_dir()` 创建。

3. **`parse_args_from_strings`**（WORK-001-01 新增）— 四种路径测试
   ```rust
   #[test]
   fn test_parse_cold() { ... }
   #[test]
   fn test_parse_edit() { ... }
   #[test]
   fn test_parse_browse_folder() { ... }
   #[test]
   fn test_parse_browse_file() { ... }
   ```

4. **`is_sensitive_path`**（WORK-001-02 新增）— 敏感/非敏感路径测试

### H1: 前端测试补充

**需要安装的依赖**：
```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**新增配置文件**：`vitest.config.ts`
```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
```

**新增测试文件**：

1. **`src/store/index.test.ts`** — Zustand store 测试
   - `enqueue`：添加新路径、跳过重复路径
   - `dequeue`：移除指定路径
   - `toggleSelected`：单选/多选/取消选择
   - `clearSelected`：清空选中
   - `setCurrentFolder`：切换目录时清空 selected

2. **`src/components/SingleTab.test.ts`** — Reducer 测试
   - `imageReducer`：loadImage / setTempPath / setCropRect / resetToOriginal
   - `editReducer`：setWidth / setHeight / setKeepAspect / setQuality / setSize

3. **`src/views/BrowseView.test.ts`** — dirReducer 测试
   - loadStart / loadSuccess / loadError / clear

**注意**：Zustand store 测试需要在每个 test 前 `useAppStore.setState(...)` 重置状态。

## 允许修改

- `src-tauri/src/image_ops.rs`（仅新增 `#[cfg(test)]` 块）
- `src-tauri/src/lib.rs`（仅新增 `#[cfg(test)]` 块）
- `src-tauri/Cargo.toml`（仅新增 dev-dependency `tempfile`）
- `package.json`（新增 devDependencies）
- `vitest.config.ts`（新增）
- `src/store/index.test.ts`（新增）
- `src/components/SingleTab.test.ts`（新增）
- `src/views/BrowseView.test.ts`（新增）

## 禁止修改

- 任何现有非测试代码
- `src-tauri/src/image_ops.rs` 的非测试部分
- `src-tauri/src/lib.rs` 的非测试部分

## 必须复用

- 现有的 `imageReducer`、`editReducer`、`dirReducer` 函数（如果是模块内定义的，需要 export 出来或在同一模块内测试）
- 现有的 `useAppStore` store 实例

## TDD 步骤

1. 安装测试依赖
2. 创建 vitest 配置
3. 先编写后端测试（不需要前端依赖）
4. 再编写前端 store 测试（最简单，不涉及组件渲染）
5. 最后编写 reducer 测试（需要 export reducer 或在同模块测试）

## 验证命令

```bash
cd src-tauri && cargo test
cd .. && pnpm vitest run
```

## 通过标准

- [ ] `cargo test` 全部通过
- [ ] `pnpm vitest run` 全部通过
- [ ] 后端新增测试覆盖：`png_colors`、`check_file_size_path`、`parse_args_from_strings`、`is_sensitive_path`
- [ ] 前端新增测试覆盖：`enqueue`、`dequeue`、`toggleSelected`、`setCurrentFolder`、`imageReducer`、`editReducer`、`dirReducer`

## 停止条件

- `tempfile` crate 与现有依赖冲突 → 停止，改用手动临时文件
- vitest 与 Vite 8 配置不兼容 → 停止，检查 vitest 版本兼容性

## 下一步

执行完成后，运行 verify 模式验证本工单。然后继续执行 WORK-001-05。
