import { useEffect, useState, useRef, useCallback } from "react"
import { Stage, Layer, Image as KonvaImage } from "react-konva"
import { invoke } from "@tauri-apps/api/core"
import { convertFileSrc } from "@tauri-apps/api/core"
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAppStore } from "@/store"
import type { DirEntry } from "@/views/BrowseView"

interface FullscreenViewerProps {
  entries: DirEntry[]
  currentIndex: number
  onClose: () => void
  onIndexChange: (index: number) => void
  onEdit: () => void
}

const TOOLBAR_HIDE_DELAY = 1500

export function FullscreenViewer({
  entries,
  currentIndex,
  onClose,
  onIndexChange,
  onEdit,
}: FullscreenViewerProps) {
  const setView = useAppStore((s) => s.setView)
  const setEditingFile = useAppStore((s) => s.setEditingFile)

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [stageSize, setStageSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [toolbarVisible, setToolbarVisible] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<unknown>(null)
  const hideTimerRef = useRef<number | null>(null)
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null)
  const metaCacheRef = useRef<Map<string, { size: number; format: string; width: number; height: number }>>(new Map())

  const current = entries[currentIndex]
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < entries.length - 1

  // ─── 加载原图 ───
  useEffect(() => {
    if (!current) return
    let cancelled = false
    setLoading(true)
    setImg(null)
    setLoadError(null)
    const url = convertFileSrc(current.path)
    const i = new window.Image()
    i.onload = () => {
      if (cancelled) return
      setImg(i)
      setImgSize({ w: i.naturalWidth, h: i.naturalHeight })
      setLoading(false)
    }
    i.onerror = () => {
      if (cancelled) return
      console.error("[FullscreenViewer] 图片加载失败:", current.path)
      setLoadError("图片加载失败，请检查文件是否被移动或删除")
      setLoading(false)
    }
    i.src = url
    return () => {
      cancelled = true
    }
  }, [current])

  // ─── 元信息（异步 lazy load）───
  const [meta, setMeta] = useState<{ size: number; format: string; width: number; height: number } | null>(null)
  useEffect(() => {
    if (!current) return
    const cached = metaCacheRef.current.get(current.path)
    if (cached) {
      setMeta(cached)
      return
    }
    setMeta(null)
    ;(async () => {
      try {
        const m = await invoke<{ size: number; created_at: number | null; modified_at: number | null }>(
          "get_file_meta",
          { path: current.path },
        )
        const info: { size: number; format: string; width: number; height: number } = {
          size: m.size,
          format: current.format,
          width: current.width,
          height: current.height,
        }
        metaCacheRef.current.set(current.path, info)
        setMeta(info)
      } catch {
        // ignore
      }
    })()
  }, [current])

  // ─── 适应窗口缩放 ───
  const fitToWindow = useCallback(() => {
    if (!img || !stageSize.w || !stageSize.h) return
    const padding = 40
    const s = Math.min(
      (stageSize.w - padding * 2) / imgSize.w,
      (stageSize.h - padding * 2) / imgSize.h,
      1,
    )
    setScale(s)
    setPos({
      x: (stageSize.w - imgSize.w * s) / 2,
      y: (stageSize.h - imgSize.h * s) / 2,
    })
  }, [img, imgSize, stageSize])

  // 加载完新图自动 fit
  useEffect(() => {
    if (img) fitToWindow()
  }, [img, fitToWindow])

  // ─── 窗口尺寸 ───
  useEffect(() => {
    const onResize = () => setStageSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // ─── 工具条自动隐藏 ───
  const showToolbar = useCallback(() => {
    setToolbarVisible(true)
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => setToolbarVisible(false), TOOLBAR_HIDE_DELAY)
  }, [])

  useEffect(() => {
    showToolbar()
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    }
  }, [showToolbar])

  // ─── 鼠标移动显示工具条 ───
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      showToolbar()
    }
    window.addEventListener("mousemove", onMove)
    return () => window.removeEventListener("mousemove", onMove)
  }, [showToolbar])

  // ─── 翻页 ───
  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(currentIndex - 1)
  }, [hasPrev, currentIndex, onIndexChange])
  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(currentIndex + 1)
  }, [hasNext, currentIndex, onIndexChange])

  // ─── 缩放 ───
  const zoom = useCallback(
    (delta: number) => {
      setScale((s) => {
        const next = Math.max(0.1, Math.min(8, s * (1 + delta)))
        return next
      })
    },
    [],
  )
  const zoomIn = useCallback(() => zoom(0.25), [zoom])
  const zoomOut = useCallback(() => zoom(-0.25), [zoom])
  const actualSize = useCallback(() => {
    if (!img) return
    setScale(1)
    setPos({
      x: (stageSize.w - imgSize.w) / 2,
      y: (stageSize.h - imgSize.h) / 2,
    })
  }, [img, imgSize, stageSize])

  // ─── 滚轮缩放（Ctrl+滚轮 或 直接滚轮）───
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoom(e.deltaY < 0 ? 0.1 : -0.1)
    }
    const el = containerRef.current
    el?.addEventListener("wheel", onWheel, { passive: false })
    return () => el?.removeEventListener("wheel", onWheel)
  }, [zoom])

  // ─── 快捷键 ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        goPrev()
      } else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault()
        goNext()
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        zoomIn()
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault()
        zoomOut()
      } else if (e.key === "0") {
        e.preventDefault()
        actualSize()
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault()
        fitToWindow()
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault()
        const file = entries[currentIndex]
        if (file) {
          setEditingFile(file.path)
          setView("single")
          onEdit()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, goPrev, goNext, zoomIn, zoomOut, actualSize, fitToWindow, entries, currentIndex, setEditingFile, setView, onEdit])

  if (!current) return null

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black select-none"
      onMouseDown={showToolbar}
    >
      {/* 顶部工具条 */}
      <div
        className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-200 ${
          toolbarVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={onClose}
            aria-label="退出全屏"
          >
            <X className="size-4" />
          </Button>
          <span className="text-white text-xs ml-2 tabular-nums">
            {currentIndex + 1} / {entries.length} · {current.filename}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={goPrev} disabled={!hasPrev} aria-label="上一张">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={goNext} disabled={!hasNext} aria-label="下一张">
            <ChevronRight className="size-4" />
          </Button>
          <div className="w-px h-5 bg-white/20 mx-1" />
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={zoomOut} aria-label="缩小">
            <ZoomOut className="size-4" />
          </Button>
          <span className="text-white text-xs tabular-nums w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={zoomIn} aria-label="放大">
            <ZoomIn className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={fitToWindow} aria-label="适应窗口">
            <Maximize2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* 画布 */}
      <Stage
        ref={stageRef as never}
        width={stageSize.w}
        height={stageSize.h}
        draggable
        x={pos.x}
        y={pos.y}
        scaleX={scale}
        scaleY={scale}
        onDragEnd={(e) => {
          setPos({ x: e.target.x(), y: e.target.y() })
        }}
        onWheel={(e) => {
          e.evt.preventDefault()
          zoom(e.evt.deltaY < 0 ? 0.1 : -0.1)
        }}
      >
        <Layer>
          {img && (
            <KonvaImage image={img} x={0} y={0} width={imgSize.w} height={imgSize.h} />
          )}
        </Layer>
      </Stage>

      {/* 右下角元信息卡 */}
      <div
        className={`absolute bottom-3 right-3 z-10 bg-black/60 text-white text-xs px-3 py-2 rounded-md backdrop-blur-sm transition-opacity duration-200 ${
          toolbarVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {meta ? (
          <div className="space-y-0.5 tabular-nums">
            <div>{imgSize.w || meta.width} × {imgSize.h || meta.height} px</div>
            <div>{formatSize(meta.size)}</div>
            <div>{meta.format}</div>
          </div>
        ) : (
          <div className="opacity-60">…</div>
        )}
      </div>

      {/* 加载中 */}
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-white/60 text-sm">
          加载中…
        </div>
      )}

      {/* 加载失败 */}
      {loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="bg-destructive/90 text-white text-sm px-4 py-2 rounded-md">
            {loadError}
          </div>
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}
