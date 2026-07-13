import { useEffect, useRef, useState, useCallback, type MouseEvent as ReactMouseEvent } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { invoke } from "@tauri-apps/api/core"
import {
  Clock,
  Loader2,
  Check,
  X,
  Trash2,
  FolderOpen,
  ExternalLink,
  Copy,
  Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useAppStore, type QueueItem } from "@/store"

interface QueuePanelProps {
  outputDir: string
  onChangeOutputDir?: () => void
}

interface ContextMenuState {
  x: number
  y: number
  item: QueueItem
}

// 进度条动画样式已移至 index.css（qp-progress-slide / qp-progress-bar）

/**
 * 状态图标
 */
function StatusIcon({ status }: { status: QueueItem["status"] }) {
  const base = "size-4 shrink-0"
  switch (status) {
    case "pending":
      return <Clock className={cn(base, "text-muted-foreground")} aria-label="待处理" />
    case "processing":
      return <Loader2 className={cn(base, "text-blue-500 animate-spin")} aria-label="处理中" />
    case "done":
      return <Check className={cn(base, "text-green-600 dark:text-green-500")} aria-label="完成" />
    case "failed":
      return <X className={cn(base, "text-red-600 dark:text-red-500")} aria-label="失败" />
  }
}

/**
 * 单个队列项
 */
function QueueItemRow({
  item,
  hovered,
  onHoverChange,
  onContextMenu,
}: {
  item: QueueItem
  hovered: boolean
  onHoverChange: (v: boolean) => void
  onContextMenu: (e: ReactMouseEvent, item: QueueItem) => void
}) {
  const thumbSrc = convertFileSrc(item.path)

  return (
    <div
      onContextMenu={(e) => onContextMenu(e, item)}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      title={item.status === "failed" ? item.error ?? "处理失败" : item.filename}
      className={cn(
        "group flex items-center gap-2 h-12 px-2 rounded-md border border-transparent transition-colors",
        hovered && "bg-accent/50 border-border",
      )}
    >
      {/* 缩略图 */}
      <div className="size-10 rounded overflow-hidden bg-muted shrink-0 border">
        <img
          src={thumbSrc}
          alt={item.filename}
          className="w-full h-full object-cover"
          draggable={false}
        />
      </div>

      {/* 文件名 + 进度条 */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="text-xs truncate leading-tight">{item.filename}</span>
        {item.status === "processing" && (
          <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
            <div className="qp-progress-bar h-full w-1/2 bg-blue-500 rounded-full" />
          </div>
        )}
      </div>

      {/* 状态图标 */}
      <StatusIcon status={item.status} />
    </div>
  )
}

/**
 * 自定义右键菜单
 */
function ContextMenu({
  state,
  onClose,
  onAction,
}: {
  state: ContextMenuState
  onClose: () => void
  onAction: (action: ContextAction, item: QueueItem) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // 点外面 / 滚动 / Esc 关闭
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    // capture 阶段拿事件，避免 React stopPropagation 影响
    document.addEventListener("mousedown", onDown, true)
    document.addEventListener("keydown", onKey, true)
    // 滚动时关（避免菜单飘着），但菜单内部滚动不关
    const onScroll = (e: Event) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest("[data-context-menu]")) onClose()
    }
    window.addEventListener("scroll", onScroll, true)
    return () => {
      document.removeEventListener("mousedown", onDown, true)
      document.removeEventListener("keydown", onKey, true)
      window.removeEventListener("scroll", onScroll, true)
    }
  }, [onClose])

  // 防止菜单超出视口右/下边
  const MENU_W = 200
  const MENU_H = 168
  const x = Math.min(state.x, window.innerWidth - MENU_W - 4)
  const y = Math.min(state.y, window.innerHeight - MENU_H - 4)

  const items: { key: ContextAction; label: string; icon: React.ReactNode; destructive?: boolean }[] = [
    { key: "remove",  label: "移除",              icon: <X className="size-3.5" />, destructive: true },
    { key: "open",    label: "在单图编辑中打开",  icon: <Pencil className="size-3.5" /> },
    { key: "copy",    label: "复制文件路径",      icon: <Copy className="size-3.5" /> },
    { key: "reveal",  label: "在资源管理器中显示", icon: <ExternalLink className="size-3.5" /> },
  ]

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[200px] rounded-md border bg-popover text-popover-foreground shadow-md p-1 animate-in fade-in-0 zoom-in-95"
      style={{ left: x, top: y }}
      // 右键默认菜单屏蔽
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => (
        <div key={it.key}>
          {i > 0 && i === 2 && <Separator className="my-1" />}
          <button
            type="button"
            role="menuitem"
            onClick={() => onAction(it.key, state.item)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm text-left transition-colors",
              "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none",
              it.destructive && "text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400",
            )}
          >
            {it.icon}
            <span>{it.label}</span>
          </button>
        </div>
      ))}
    </div>
  )
}

type ContextAction = "remove" | "open" | "copy" | "reveal"

export function QueuePanel({ outputDir, onChangeOutputDir }: QueuePanelProps) {
  const queue = useAppStore((s) => s.queue)
  const dequeue = useAppStore((s) => s.dequeue)
  const clearQueue = useAppStore((s) => s.clearQueue)
  const setEditingFile = useAppStore((s) => s.setEditingFile)
  const setView = useAppStore((s) => s.setView)

  const [hoveredPath, setHoveredPath] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // toast 自动消失
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(t)
  }, [toast])

  // 打开输出目录
  const handleOpenOutputDir = useCallback(async () => {
    if (!outputDir) {
      if (onChangeOutputDir) onChangeOutputDir()
      return
    }
    try {
      // 优先 reveal（聚焦到目录）；如果失败再退回到 open_path
      await revealItemInDir(outputDir)
    } catch {
      try {
        await invoke("plugin:opener|open_path", { path: outputDir })
      } catch (e) {
        setToast(`打开失败：${String(e)}`)
      }
    }
  }, [outputDir, onChangeOutputDir])

  // 右键菜单触发
  const handleContextMenu = useCallback((e: ReactMouseEvent, item: QueueItem) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, item })
  }, [])

  // 菜单项动作
  const handleAction = useCallback(
    async (action: ContextAction, item: QueueItem) => {
      setContextMenu(null)
      switch (action) {
        case "remove":
          dequeue(item.path)
          break
        case "open":
          setEditingFile(item.path)
          setView("single")
          break
        case "copy":
          try {
            await navigator.clipboard.writeText(item.path)
            setToast("已复制路径")
          } catch (e) {
            setToast(`复制失败：${String(e)}`)
          }
          break
        case "reveal":
          try {
            await revealItemInDir(item.path)
          } catch (e) {
            setToast(`打开失败：${String(e)}`)
          }
          break
      }
    },
    [dequeue, setEditingFile, setView],
  )

  const isEmpty = queue.length === 0

  return (
    <>
      <aside className="flex flex-col w-80 shrink-0 h-full border-l bg-card">
        {/* 顶部按钮（sticky） */}
        <div className="sticky top-0 z-10 bg-card border-b p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={clearQueue}
              disabled={isEmpty}
            >
              <Trash2 className="size-3.5" />
              清空队列
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={handleOpenOutputDir}
              title={outputDir || "未选择输出目录"}
            >
              <FolderOpen className="size-3.5" />
              打开输出目录
            </Button>
          </div>
          {onChangeOutputDir && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-[11px] text-muted-foreground"
              onClick={onChangeOutputDir}
            >
              更换输出目录…
            </Button>
          )}
        </div>

        <Separator />

        {/* 队列列表 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-xs text-muted-foreground py-12">
              <Clock className="size-8 mb-2 opacity-40" />
              <p>队列为空</p>
              <p className="mt-1 text-[10px] opacity-70">从浏览视图右键 → 加入队列</p>
            </div>
          ) : (
            queue.map((item) => (
              <QueueItemRow
                key={item.path}
                item={item}
                hovered={hoveredPath === item.path}
                onHoverChange={(v) => setHoveredPath(v ? item.path : null)}
                onContextMenu={handleContextMenu}
              />
            ))
          )}
        </div>

        {/* 底部小提示 / toast */}
        {toast && (
          <div className="border-t bg-card px-3 py-1.5 text-[11px] text-muted-foreground text-center">
            {toast}
          </div>
        )}
      </aside>

      {/* 右键菜单 portal（用 fixed 定位） */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onAction={handleAction}
        />
      )}
    </>
  )
}
