import { useEffect, useState, useCallback, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open } from "@tauri-apps/plugin-dialog"
import { FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAppStore } from "@/store"
import { ThumbnailGrid } from "@/components/ThumbnailGrid"
import { StatusBar } from "@/components/StatusBar"
import { FullscreenViewer } from "@/components/FullscreenViewer"

export interface DirEntry {
  path: string
  filename: string
  width: number
  height: number
  format: string
  file_size: number
  created_at: number | null
  modified_at: number | null
}

const THUMB_DEFAULT = 300
const THUMB_MIN = 100
const THUMB_MAX = 800
const THUMB_STEP = 0.1 // ±10% / 步

export function BrowseView() {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const setCurrentFolder = useAppStore((s) => s.setCurrentFolder)

  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [thumbSize, setThumbSize] = useState(THUMB_DEFAULT)
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null)

  // ─── 调 Rust read_dir 加载目录 ───
  const loadFolder = useCallback(async (folder: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await invoke<DirEntry[]>("read_dir", { folder })
      setEntries(result)
    } catch (e) {
      setError(String(e))
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentFolder) {
      void loadFolder(currentFolder)
    } else {
      setEntries([])
    }
  }, [currentFolder, loadFolder])

  // ─── 打开目录对话框 ───
  const handleOpenFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false })
    if (selected && typeof selected === "string") {
      setCurrentFolder(selected)
    }
  }, [setCurrentFolder])

  // ─── 缩略图大小调节（双绑）───
  const bumpThumbSize = useCallback((delta: number) => {
    setThumbSize((s) => {
      const next = Math.round(s * (1 + delta))
      return Math.max(THUMB_MIN, Math.min(THUMB_MAX, next))
    })
  }, [])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        bumpThumbSize(e.deltaY < 0 ? THUMB_STEP : -THUMB_STEP)
      }
    },
    [bumpThumbSize],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === "=" || e.key === "+") {
        e.preventDefault()
        bumpThumbSize(THUMB_STEP)
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault()
        bumpThumbSize(-THUMB_STEP)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [bumpThumbSize])

  const totalCount = useMemo(() => entries.length, [entries])

  return (
    <div className="h-full flex flex-col" onWheel={handleWheel}>
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-card/40">
        <Button variant="outline" size="sm" onClick={handleOpenFolder}>
          <FolderOpen className="size-3 mr-1" />
          打开目录
        </Button>
        <div className="text-xs text-muted-foreground truncate flex-1">
          {currentFolder ?? "未选择目录"}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          缩略图 {thumbSize}px
        </div>
      </div>

      {/* 主区 */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {!currentFolder ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
            <FolderOpen className="size-16 opacity-30" />
            <p className="text-sm">点击"打开目录"开始浏览</p>
          </div>
        ) : loading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            加载中…
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-sm text-destructive">
            {error}
          </div>
        ) : entries.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            该目录没有图片
          </div>
        ) : (
          <ThumbnailGrid
            entries={entries}
            thumbSize={thumbSize}
            onOpenFullscreen={(i) => setFullscreenIndex(i)}
          />
        )}
      </div>

      {/* 全屏看图 */}
      {fullscreenIndex !== null && (
        <FullscreenViewer
          entries={entries}
          currentIndex={fullscreenIndex}
          onClose={() => setFullscreenIndex(null)}
          onIndexChange={setFullscreenIndex}
          onEdit={() => setFullscreenIndex(null)}
        />
      )}

      {/* 状态栏 */}
      <StatusBar totalCount={totalCount} />
    </div>
  )
}
