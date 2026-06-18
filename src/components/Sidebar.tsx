import { useState, useCallback, useRef } from "react"
import { PanelLeftClose, PanelLeft, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DirTree } from "@/components/DirTree"

interface SidebarProps {
  currentFolder: string | null
  onSelectDirectory: (path: string) => void
}

const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 480
const SIDEBAR_DEFAULT = 240

/**
 * 侧边栏容器 — 可收起、可拖拽调节宽度
 * 仅在浏览视图网格状态下显示
 */
export function Sidebar({ currentFolder, onSelectDirectory }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(SIDEBAR_DEFAULT)
  const resizingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // ─── 拖拽调节宽度 ───
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current || !containerRef.current) return
      const parent = containerRef.current.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      const newWidth = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, ev.clientX - rect.left))
      setWidth(newWidth)
    }

    const onUp = () => {
      resizingRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [])

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 pt-2 border-r bg-card/20">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(false)}
          className="size-8"
          title="展开侧边栏"
        >
          <PanelLeft className="size-4" />
        </Button>
        {currentFolder && (
          <div className="relative group">
            <Button variant="ghost" size="icon" className="size-8" title={currentFolder}>
              <FolderOpen className="size-4" />
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col border-r bg-card/20 relative shrink-0"
      style={{ width }}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground">目录</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(true)}
          className="size-6"
          title="收起侧边栏"
        >
          <PanelLeftClose className="size-3.5" />
        </Button>
      </div>

      {/* 目录树 */}
      <DirTree
        currentFolder={currentFolder}
        onSelectDirectory={onSelectDirectory}
      />

      {/* 拖拽手柄 */}
      <div
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
        onMouseDown={handleMouseDown}
      />
    </div>
  )
}
