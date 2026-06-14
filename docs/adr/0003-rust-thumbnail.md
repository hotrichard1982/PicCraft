# ADR-0003: 缩略图由 Rust 端生成，前端只渲染

## 状态

已接受 (Accepted) — 2026-06-14

## 背景

浏览视图需要展示当前目录下所有图片的缩略图（默认宽 300px，可手动调节）。一个目录可能有几百到几千张图，每张原图从 1MB 到 50MB 不等。

## 决策

**Rust 端**新增 `make_thumbnail(path, max_width)` 命令：
- 用 `image` crate 把图片缩到指定宽度（保持纵横比）
- 输出 PNG bytes 返回前端
- 前端用 `data:image/png;base64,...` 渲染

调用时机：**懒加载** —— 缩略图进入视口（intersection observer）时调用，未进入视口不调用。

## 备选方案

### 备选 A：前端 Konva 缩放原图

- ✅ 实现最简，零新 Rust 命令
- ❌ **内存爆炸**：1000 张 5MB 图 = 5GB 内存
- ❌ 浏览器解码 + 渲染 1000 张原图卡顿严重
- ❌ Konva 主要是矢量画布，做位图缩放没优势

### 备选 B：Rust 生成缩略图 + 写磁盘缓存

- ✅ 第二次进入目录秒开
- ❌ 缩略图文件散落磁盘（`%APPDATA%/piccraft/thumbnails/...`）
- ❌ 原图删除/移动后缓存清理逻辑复杂
- ❌ 增大本期范围

### 备选 C：Rust 生成 + 内存缓存（LRU 1000 张）

- ✅ 同一会话内不重复生成
- ❌ 实现稍复杂
- ✅ 不写磁盘

## 后果

- Rust 端新增依赖：无（`image` crate 已在用）
- 新增 `make_thumbnail` 命令
- 前端用 `data:` URL 而非 `asset:` URL（base64 比文件协议对缩略图这种小数据更快）
- 切换目录时清空缩略图缓存
- **不**做磁盘缓存（ADR-0003-B 留作未来优化）

## 关联

- [CONTEXT.md §5.5 浏览视图交互细节](../CONTEXT.md#55-浏览视图交互细节-browse-view-interaction)
- [CONTEXT.md §5.8 架构决策](../CONTEXT.md#58-架构决策-architecture-decisions)
