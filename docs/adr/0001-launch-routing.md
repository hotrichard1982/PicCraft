# ADR-0001: 启动参数路由（双击图片 vs 右键"用图轻剪编辑"）

## 状态

已接受 (Accepted) — 2026-06-14

## 背景

应用需要支持 Windows 文件关联：双击图片或在文件管理器中"打开方式"选择 PicCraft 都会启动应用。这两种入口的**用户期待不同**：

- **双击** = "用默认应用打开" → 用户期望看到图片
- **打开方式 → 用图轻剪编辑** = "明确表示要编辑" → 用户期望进入编辑

如果两种入口都路由到同一个视图，会让其中一种体验别扭。

## 决策

| 启动方式 | 路由目标 |
|---------|----------|
| 冷启动（无参数） | 浏览视图，加载上次目录 |
| 双击图片（OS 默认行为） | **浏览视图** + 全屏看图模式 + 定位该图 |
| 右键目录"用图轻剪打开" | **浏览视图**，打开该目录 |
| 右键图片 → 打开方式 → "用图轻剪编辑" | **单图编辑视图** |

## 备选方案

### 备选 A：两种入口都进单图编辑

- ✅ 实现最简
- ❌ 违背 OS "双击 = 打开" 的用户预期
- ❌ 如果用户只是想快速看图，强制进编辑会让人烦

### 备选 B：两种入口都进浏览视图

- ✅ 一致性强
- ❌ 用户在右键菜单里明确点了"编辑"，结果还是浏览——认知不符
- ❌ "用图轻剪编辑图片" 这个菜单项名变成骗人

## 后果

- OS 关联注册时需要写**两个不同的命令行行为**（同一个 exe 接收参数判断）
- 命令行参数格式约定：`piccarft.exe --edit <file>` vs `piccarft.exe <file>`
- Tauri 2 的 `fileAssociations` 配置需要分两种类型："image/jpeg" 关联默认行为 + "image/jpeg-edit" 关联编辑行为
- ⚠️ Windows "打开方式" 菜单的实际行为是：先尝试"默认应用"，若没设置则列出所有候选。用户必须**在 PicCraft 第一次运行时主动设为"打开方式"**，菜单里才会出现。这个 UX 必须写在帮助里

### 实施细节（M6 / M7 阶段）

Tauri 2 的 `fileAssociations` 只能生成**默认 verb (open)**，**不能**直接生成 "edit" verb。

要做到"双击 = 浏览 / 右键"用图轻剪编辑" = 单图编辑"的双 verb 分流，**必须**用 `winreg` crate 直接写 Windows 注册表（不进 NSIS 安装脚本，因为用户随时能改设置）：

```
HKCU\Software\Classes\SystemFileAssociations\image\shell\open\command
  (default) = "C:\path\piccarft.exe" "%1"

HKCU\Software\Classes\SystemFileAssociations\image\shell\edit\command
  (default) = "C:\path\piccarft.exe" --edit "%1"
```

- 写入位置用 `SystemFileAssociations\image` 而非 `Software\Classes\.jpg`，**避免**污染所有应用对 .jpg 的关联
- 5 种图片格式共享同一个 `image` 关联组（jpg/jpeg/png/webp/bmp 都是 `SystemFileAssociations\image` 下的成员）
- 写注册表时**先读后合并**，不删用户已有的其他应用关联

### 必装依赖（M1 阶段）

| 依赖 | 原因 |
|------|------|
| `tauri-plugin-single-instance = "2"` | 不装的话，用户双击 2 张图会**开 2 个 PicCraft 进程**，队列/状态分裂。第二次启动时把 args 转发给已运行的实例，**统一路由**。 |

### 未来扩展（不在本期）

- macOS 文件关联不走 `std::env::args()`，需用 `tauri::RunEvent::Opened { urls }` 事件
- Linux 走 `.desktop` 文件 + `MimeType=`
- 这两平台在 [CONTEXT.md §9 Out of Scope](../../CONTEXT.md#9-不在范围-out-of-scope) 已声明不在本期

## 关联

- [CONTEXT.md §7.1 启动路由](../../CONTEXT.md#71-启动路由)
- [CONTEXT.md §5.8 架构决策](../../CONTEXT.md#58-架构决策-architecture-decisions)
