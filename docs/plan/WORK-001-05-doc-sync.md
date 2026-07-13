# WORK-001-05: 文档同步

## PLAN 来源

[PLAN-001-audit-fixes.md](PLAN-001-audit-fixes.md)

## 目标

修复文档与实现之间的 2 处不一致。

## 依赖

- WORK-001-01 完成（确认缩略图缓存最终实现）
- WORK-001-03 完成（确认前端行为无变更）

## 审计项与修复方案

### L4: CONTEXT.md 缩略图磁盘缓存描述过时

**文件**：`CONTEXT.md` 第 152 行

**当前**：
```
- 不做：图片搜索、标签、EXIF 编辑、缩略图磁盘缓存
```

**实际**：`image_ops.rs` 第 577-624 行已实现磁盘缓存（JPEG 快速解码 + temp 目录缓存）

**修改为**：
```
- 不做：图片搜索、标签、EXIF 编辑
```

同时在 §5.8 架构决策表中更新缩略图行：
```
| **缩略图生成** | **Rust 端** `make_thumbnail`，JPEG 快速解码 + 磁盘缓存（temp 目录，200MB 上限自动清理）|
```

### L5: 切换目录清空队列 — 文档与代码不一致

**文件**：`CONTEXT.md` 第 51 行 + `src/store/index.ts:101-104`

**当前文档**：
```
| **切换目录 (Switch Folder)** | 改变浏览视图的当前目录。**会清空队列**（与"清空队列"区分）。|
```

**当前代码**：`setCurrentFolder` 只清空 `selected`，未调用 `clearQueue`。

**产品决策**：这是一个需要确认的产品意图问题。

**方案 A**（更新代码匹配文档）：在 `setCurrentFolder` 中添加 `clearQueue()` 调用。
```ts
setCurrentFolder: (folder) => {
  set({ currentFolder: folder, lastFolder: folder, selected: new Set(), queue: [] })
  void persistKey("lastFolder", folder)
},
```

**方案 B**（更新文档匹配代码）：修改 CONTEXT.md 描述。
```
| **切换目录 (Switch Folder)** | 改变浏览视图的当前目录。清空选中但不影响队列。|
```

**建议**：采用方案 B（更新文档）。理由：
1. 用户可能从目录 A 挑图加入队列，再切到目录 B 继续挑图。切目录清空队列会丢失之前的工作。
2. 队列跨目录累积是更合理的用户体验。

**如果执行者认为方案 A 更合理**，停止并回到 PLAN 确认。

## 允许修改

- `CONTEXT.md`
- `docs/adr/index.md`（如需更新 ADR-0003 描述以反映磁盘缓存）

## 禁止修改

- 任何代码文件（除非选择方案 A 修改 `src/store/index.ts`）
- 审计报告文件

## 必须复用

- 现有的 CONTEXT.md 格式和术语

## TDD 步骤

1. 修改 CONTEXT.md L4（删除"缩略图磁盘缓存"从不做列表）
2. 更新 CONTEXT.md §5.8 架构决策表
3. 修改 CONTEXT.md L5（方案 B：更新文档描述）
4. 如果 ADR-0003 中有"不做磁盘缓存"的表述，同步更新

## 验证命令

```bash
python tools/project_docs.py validate
```

## 通过标准

- [ ] `validate` 零断裂链接
- [ ] CONTEXT.md 不再包含"不做缩略图磁盘缓存"
- [ ] CONTEXT.md 切换目录描述与代码行为一致
- [ ] ADR-0003 如有相关描述已同步更新

## 停止条件

- 如果决定采用方案 A（改代码）→ 停止，回到 PLAN 确认

## 下一步

执行完成后，运行 verify 模式验证本工单。全部 5 个 WORK 完成后，回到 PLAN 做最终验收。
