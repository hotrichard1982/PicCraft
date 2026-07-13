# WORK-001-03: 前端代码质量修复

## PLAN 来源

[PLAN-001-audit-fixes.md](PLAN-001-audit-fixes.md)

## 目标

修复前端 11 个审计问题：类型安全、错误边界、性能优化、代码一致性。

## 审计项与修复方案

### M5: FullscreenViewer stageRef 类型修复

**文件**：`src/components/FullscreenViewer.tsx:113`

```tsx
// 当前
const stageRef = useRef<unknown>(null)
// ... ref={stageRef as never}

// 修改为
import type Konva from "konva"
const stageRef = useRef<Konva.Stage>(null)
// ... ref={stageRef}
```

同时移除第 359 行的 `ref={stageRef as never}` 改为 `ref={stageRef}`。

### M6: 新增 ErrorBoundary

**新增文件**：`src/components/ErrorBoundary.tsx`

```tsx
import { Component, type ReactNode } from "react"

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
          <p className="text-lg font-semibold">应用出错了</p>
          <p className="text-sm">{this.state.message}</p>
          <button
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

**修改文件**：`src/App.tsx` — 在最外层包裹 `<ErrorBoundary>`。

### M8: QueuePanel 右键菜单滚动修复

**文件**：`src/components/QueuePanel.tsx:130`

```tsx
// 当前
window.addEventListener("scroll", onClose, true)

// 修改为：检查滚动是否来自菜单外部
const onScroll = (e: Event) => {
  const target = e.target as HTMLElement | null
  if (!target?.closest("[data-context-menu]")) onClose()
}
window.addEventListener("scroll", onScroll, true)
// cleanup 中也要用 onScroll
```

### M2: SingleTab 缓存目录列表

**文件**：`src/components/SingleTab.tsx:296-318`

在组件中增加 `entriesRef` 缓存目录扫描结果，避免每次"加入队列并打开下一张"都重新 `read_dir`。

```tsx
const entriesRef = useRef<ImageInfo[]>([])

// 在 loadImage 成功后，如果 currentFolder 变化，预加载目录列表
useEffect(() => {
  if (!currentFolder) return
  invoke<ImageInfo[]>("read_dir", { folder: currentFolder })
    .then((entries) => { entriesRef.current = entries })
    .catch(() => { entriesRef.current = [] })
}, [currentFolder])

// handleEnqueueAndNext 中用 entriesRef.current 替代 invoke("read_dir")
```

### M3: BatchTab localStorage → Tauri Store

**文件**：`src/components/BatchTab.tsx:22, 72-88`

将 `localStorage.getItem/setItem` 替换为 `tauri-plugin-store`，与项目其他持久化状态一致。

```tsx
// 移除
const STORAGE_KEY_OUTPUT = "piccraft-batch-output"
// localStorage.getItem(STORAGE_KEY_OUTPUT)
// localStorage.setItem(STORAGE_KEY_OUTPUT, outputDir)

// 替换为 Tauri Store
import { Store } from "@tauri-apps/plugin-store"
const store = await Store.load("piccraft-state.json")
await store.get<string>("batchOutputDir")
await store.set("batchOutputDir", outputDir)
await store.save()
```

### M4: 缩略图内存缓存 LRU 淘汰

**文件**：`src/components/ThumbnailGrid.tsx:96-99`

```tsx
// 当前：超 300 直接 clear()
if (cacheSizeRef.current > MAX_CACHE_SIZE) {
  thumbCacheRef.current.clear()
  cacheSizeRef.current = 0
}

// 修改为：LRU 淘汰最旧的 sub-map
if (cacheSizeRef.current > MAX_CACHE_SIZE) {
  // 淘汰最小的 maxWidth 分组（最久未使用的尺寸）
  const oldestKey = Math.min(...thumbCacheRef.current.keys())
  const removed = thumbCacheRef.current.get(oldestKey)?.size ?? 0
  thumbCacheRef.current.delete(oldestKey)
  cacheSizeRef.current -= removed
}
```

### L1: 版本号统一

**文件**：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src/components/Header.tsx`

统一为 `0.1.0`（Cargo.toml 和 tauri.conf.json 已是此值）：
- `package.json`: `"version": "0.0.0"` → `"0.1.0"`
- `Header.tsx:21`: `v2026.06` → `v0.1.0`

### L2: 移除未使用导出

**文件**：`src/components/StatusBar.tsx:46-47`

移除 `export { formatSize, formatDate }` 和 `export type { DirEntry }`。
`formatSize` 如果被 `FullscreenViewer.tsx` 导入，则保留 `formatSize`，仅移除 `formatDate` 和 `DirEntry`。

**注意**：先检查 `formatSize` 是否被 `FullscreenViewer.tsx:17` 导入 — 是的，`import { formatSize } from "@/components/StatusBar"`，所以保留 `formatSize`。

### L3: lucide-react 图标替换

**文件**：`src/views/SettingsView.tsx:172-207`

删除 `FolderIcon`、`QueueIcon`、`EditIcon`、`OpenIcon` 四个手写 SVG 组件，改为从 `lucide-react` 导入：
- `FolderIcon` → `Folder`
- `QueueIcon` → `List`
- `EditIcon` → `Pencil`
- `OpenIcon` → `ExternalLink`

更新 `HELP_ITEMS` 数组中的 icon 引用。

### L6: Slider min 修复

**文件**：`src/components/SingleTab.tsx:433`

```tsx
// 当前
<Slider min={0} max={100} step={1} ... />
// 修改为
<Slider min={1} max={100} step={1} ... />
```

### L7: eslint 抑制审查

**文件**：`src/components/BrowseView.tsx:88`、`src/components/FullscreenViewer.tsx:210`、`src/components/SingleTab.tsx:323`

逐一检查每个 `eslint-disable-next-line`：
- `react-hooks/set-state-in-effect`：这些是在 effect 中调用 setState 的场景。React 19 的 `useEffect` 中 setState 会导致额外渲染。审查后如果确实需要（如从外部源同步状态），保留注释并添加说明；如果可以通过其他模式避免，移除注释并重构。
- `react-hooks/exhaustive-deps`：如果依赖确实不需要（如稳定引用），保留；否则补全依赖。

**此项如果审查后确认抑制合理，不需改动代码，仅在工单回执中记录审查结论。**

## 允许修改

- `src/components/FullscreenViewer.tsx`
- `src/components/QueuePanel.tsx`
- `src/components/SingleTab.tsx`
- `src/components/BatchTab.tsx`
- `src/components/ThumbnailGrid.tsx`
- `src/components/StatusBar.tsx`
- `src/components/ErrorBoundary.tsx`（新增）
- `src/views/SettingsView.tsx`
- `src/App.tsx`
- `package.json`

## 禁止修改

- `src/store/index.ts`（M3 的 store 交互通过现有 API 进行，不改 store 定义）
- `src-tauri/` 任何文件
- `src/components/CropCanvas.tsx`
- `src/components/DirTree.tsx`

## 必须复用

- 现有的 `cn()` 工具函数
- 现有的 shadcn/ui 组件
- 现有的 `useAppStore` selector 模式

## TDD 步骤

1. M5 类型修复 → 验证 `pnpm build` 类型检查通过
2. M6 ErrorBoundary → 验证组件能捕获错误并显示恢复 UI
3. M8 滚动修复 → 手动验证面板内滚动不关闭菜单
4. M2 缓存目录 → 验证 handleEnqueueAndNext 不重复调用 read_dir
5. M3 Store 迁移 → 验证 outputDir 持久化正常
6. M4 LRU 淘汰 → 验证缩略图不闪烁
7. L1-L7 逐项修复

## 验证命令

```bash
pnpm lint && pnpm build
```

## 通过标准

- [ ] `pnpm lint` 零错误
- [ ] `pnpm build` 成功（TypeScript 类型检查通过）
- [ ] FullscreenViewer 的 stageRef 类型为 `Konva.Stage`
- [ ] ErrorBoundary 存在且被 App 使用
- [ ] QueuePanel 内部滚动不关闭右键菜单
- [ ] BatchTab 使用 Tauri Store 而非 localStorage
- [ ] 版本号统一为 0.1.0
- [ ] 手写 SVG 图标替换为 lucide-react
- [ ] Slider min=1

## 停止条件

- `pnpm build` 类型检查失败 → 停止，修正类型
- Konva 类型导入路径不正确 → 停止，查 Konva 文档确认正确导入

## 下一步

执行完成后，运行 verify 模式验证本工单。然后继续执行 WORK-001-04。
