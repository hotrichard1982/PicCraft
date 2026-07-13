import { useEffect, useState, useRef, useCallback, useReducer } from "react"
import { Stage, Layer, Image as KonvaImage } from "react-konva"
import type Konva from "konva"
import { invoke } from "@tauri-apps/api/core"
import { convertFileSrc } from "@tauri-apps/api/core"
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  Edit3,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAppStore } from "@/store"
import { formatSize } from "@/components/StatusBar"
import type { DirEntry } from "@/views/BrowseView"

interface FullscreenViewerProps {
  entries: DirEntry[]
  currentIndex: number
  onClose: () => void
  onIndexChange: (index: number) => void
  onEdit: () => void
}

const TOOLBAR_HIDE_DELAY = 1500
const HINT_DURATION = 5000 // 首次提示停留时间

// 图片加载相关状态
interface ImageLoadState {
  img: HTMLImageElement | null
  imgSize: { w: number; h: number }
  loading: boolean
  loadError: string | null
}

type ImageLoadAction =
  | { type: "loadStart" }
  | { type: "loadSuccess"; img: HTMLImageElement; w: number; h: number }
  | { type: "loadError"; error: string }

function imageLoadReducer(state: ImageLoadState, action: ImageLoadAction): ImageLoadState {
  switch (action.type) {
    case "loadStart":
      return { ...state, img: null, loading: true, loadError: null }
    case "loadSuccess":
      return { img: action.img, imgSize: { w: action.w, h: action.h }, loading: false, loadError: null }
    case "loadError":
      return { ...state, img: null, loading: false, loadError: action.error }
  }
}

// 画布视图相关状态（含旋转）
interface ViewState {
  stageSize: { w: number; h: number }
  scale: number
  pos: { x: number; y: number }
  rotation: number // 0 | 90 | 180 | 270
}

type ViewAction =
  | { type: "resize"; w: number; h: number }
  | { type: "setScale"; scale: number }
  | { type: "setPos"; x: number; y: number }
  | { type: "setScaleAndPos"; scale: number; x: number; y: number; rotation?: number }
  | { type: "rotate" }

function viewReducer(state: ViewState, action: ViewAction): ViewState {
  switch (action.type) {
    case "resize":
      return { ...state, stageSize: { w: action.w, h: action.h } }
    case "setScale":
      return { ...state, scale: action.scale }
    case "setPos":
      return { ...state, pos: { x: action.x, y: action.y } }
    case "setScaleAndPos":
      return {
        stageSize: state.stageSize,
        scale: action.scale,
        pos: { x: action.x, y: action.y },
        rotation: action.rotation ?? state.rotation,
      }
    case "rotate":
      return { ...state, rotation: (state.rotation + 90) % 360 }
  }
}

export function FullscreenViewer({
  entries,
  currentIndex,
  onClose,
  onIndexChange,
  onEdit,
}: FullscreenViewerProps) {
  const setView = useAppStore((s) => s.setView)
  const setEditingFile = useAppStore((s) => s.setEditingFile)

  const [imgLoad, dispatchImgLoad] = useReducer(imageLoadReducer, {
    img: null, imgSize: { w: 0, h: 0 }, loading: false, loadError: null,
  })
  const [view, dispatchView] = useReducer(viewReducer, {
    stageSize: { w: window.innerWidth, h: window.innerHeight },
    scale: 1,
    pos: { x: 0, y: 0 },
    rotation: 0,
  })
  const [toolbarVisible, setToolbarVisible] = useState(true)
  const [showHint, setShowHint] = useState(true) // 首次进入提示

  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const hideTimerRef = useRef<number | null>(null)
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null)
  const metaCacheRef = useRef<Map<string, { size: number; format: string; width: number; height: number }>>(new Map())

  const current = entries[currentIndex]

  // ─── 加载原图 ───
  useEffect(() => {
    if (!current) return
    let cancelled = false
    dispatchImgLoad({ type: "loadStart" })
    // 切换图片时重置旋转
    dispatchView({ type: "setScaleAndPos", scale: 1, x: 0, y: 0, rotation: 0 })
    const url = convertFileSrc(current.path)
    const i = new window.Image()
    i.onload = () => {
      if (cancelled) return
      dispatchImgLoad({ type: "loadSuccess", img: i, w: i.naturalWidth, h: i.naturalHeight })
    }
    i.onerror = () => {
      if (cancelled) return
      console.error("[FullscreenViewer] 图片加载失败:", current.path)
      dispatchImgLoad({ type: "loadError", error: "图片加载失败，请检查文件是否被移动或删除" })
    }
    i.src = url
    return () => {
      cancelled = true
      i.src = ""
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

  // ─── 适应窗口缩放（考虑旋转）───
  const fitToWindow = useCallback(() => {
    if (!imgLoad.img || !view.stageSize.w || !view.stageSize.h) return
    const padding = 40
    const rotated = view.rotation % 180 !== 0
    const dw = rotated ? imgLoad.imgSize.h : imgLoad.imgSize.w
    const dh = rotated ? imgLoad.imgSize.w : imgLoad.imgSize.h
    const s = Math.min(
      (view.stageSize.w - padding * 2) / dw,
      (view.stageSize.h - padding * 2) / dh,
      1,
    )
    dispatchView({
      type: "setScaleAndPos",
      scale: s,
      x: (view.stageSize.w - dw * s) / 2,
      y: (view.stageSize.h - dh * s) / 2,
    })
  }, [imgLoad.img, imgLoad.imgSize, view.stageSize, view.rotation])

  // 加载完新图自动 fit
  useEffect(() => {
    if (imgLoad.img) fitToWindow()
  }, [imgLoad.img, fitToWindow])

  // ─── 旋转 ───
  const rotateCw = useCallback(() => {
    dispatchView({ type: "rotate" })
  }, [])

  // 旋转后 auto-fit
  useEffect(() => {
    if (imgLoad.img) {
      fitToWindow()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.rotation])

  // ─── 窗口尺寸 ───
  useEffect(() => {
    const onResize = () => dispatchView({ type: "resize", w: window.innerWidth, h: window.innerHeight })
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

  // ─── 首次提示：5 秒后淡出 ───
  useEffect(() => {
    if (!showHint) return
    const timer = setTimeout(() => setShowHint(false), HINT_DURATION)
    return () => clearTimeout(timer)
  }, [showHint])

  // ─── 翻页（循环） ───
  const total = entries.length
  const goPrev = useCallback(() => {
    onIndexChange(currentIndex === 0 ? total - 1 : currentIndex - 1)
  }, [currentIndex, total, onIndexChange])
  const goNext = useCallback(() => {
    onIndexChange(currentIndex === total - 1 ? 0 : currentIndex + 1)
  }, [currentIndex, total, onIndexChange])

  // ─── 缩放 ───
  const zoom = useCallback(
    (delta: number) => {
      dispatchView({ type: "setScale", scale: Math.max(0.1, Math.min(8, view.scale * (1 + delta))) })
    },
    [view.scale],
  )
  const zoomIn = useCallback(() => zoom(0.25), [zoom])
  const zoomOut = useCallback(() => zoom(-0.25), [zoom])
  const actualSize = useCallback(() => {
    if (!imgLoad.img) return
    dispatchView({ type: "setScaleAndPos", scale: 1,
      x: (view.stageSize.w - imgLoad.imgSize.w) / 2,
      y: (view.stageSize.h - imgLoad.imgSize.h) / 2,
    })
  }, [imgLoad.img, imgLoad.imgSize, view.stageSize])

  // ─── 左右半区点击翻页 ───
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleStageClick = useCallback((e: any) => {
    const stage = e.target?.getStage?.()
    if (!stage) return
    const containerRect = stage.container().getBoundingClientRect()
    const clickX = e.evt.clientX - containerRect.left
    const relX = clickX / containerRect.width
    if (relX < 0.35) {
      goPrev()
    } else if (relX > 0.65) {
      goNext()
    }
  }, [goPrev, goNext])

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
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault()
        rotateCw()
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
  }, [onClose, goPrev, goNext, zoomIn, zoomOut, actualSize, fitToWindow, rotateCw, entries, currentIndex, setEditingFile, setView, onEdit])

  if (!current) return null

  // 有效显示尺寸（考虑旋转）
  const rotated = view.rotation % 180 !== 0
  const dispW = rotated ? imgLoad.imgSize.h : imgLoad.imgSize.w
  const dispH = rotated ? imgLoad.imgSize.w : imgLoad.imgSize.h

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 select-none dark:bg-neutral-950 bg-neutral-100"
      onMouseDown={showToolbar}
    >
      {/* 顶部信息条（只显示文件名，无按钮） */}
      <div
        className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-center px-4 py-2 bg-gradient-to-b dark:from-black/70 from-white/70 to-transparent transition-opacity duration-200 ${
          toolbarVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <span className="dark:text-white text-black text-xs tabular-nums">
          {currentIndex + 1} / {entries.length} · {current.filename}
        </span>
      </div>

      {/* 画布 */}
      <Stage
        ref={stageRef}
        width={view.stageSize.w}
        height={view.stageSize.h}
        draggable
        x={view.pos.x}
        y={view.pos.y}
        scaleX={view.scale}
        scaleY={view.scale}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onDragEnd={(e) => {
          dispatchView({ type: "setPos", x: e.target.x(), y: e.target.y() })
        }}
        onWheel={(e) => {
          e.evt.preventDefault()
          zoom(e.evt.deltaY < 0 ? 0.1 : -0.1)
        }}
      >
        <Layer>
          {imgLoad.img && (
            <KonvaImage
              image={imgLoad.img}
              x={imgLoad.imgSize.w / 2}
              y={imgLoad.imgSize.h / 2}
              width={imgLoad.imgSize.w}
              height={imgLoad.imgSize.h}
              rotation={view.rotation}
              offsetX={imgLoad.imgSize.w / 2}
              offsetY={imgLoad.imgSize.h / 2}
            />
          )}
        </Layer>
      </Stage>

      {/* 底部工具栏 */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-t dark:from-black/70 from-white/70 to-transparent transition-opacity duration-200 ${
          toolbarVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="dark:text-white text-black hover:bg-white/20 size-9" onClick={onClose} aria-label="退出全屏" title="退出全屏 (Esc)">
            <X className="size-4" />
          </Button>
          <div className="w-px h-6 dark:bg-white/20 bg-black/20 mx-1" />
          <Button variant="ghost" size="icon" className="dark:text-white text-black hover:bg-white/20 size-9" onClick={rotateCw} aria-label="旋转" title="顺时针旋转 (R)">
            <RotateCw className="size-4" />
          </Button>
          <div className="w-px h-6 dark:bg-white/20 bg-black/20 mx-1" />
          <Button variant="ghost" size="icon" className="dark:text-white text-black hover:bg-white/20 size-9" onClick={goPrev} aria-label="上一张" title="上一张 (←)">
            <ChevronLeft className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" className="dark:text-white text-black hover:bg-white/20 size-9" onClick={goNext} aria-label="下一张" title="下一张 (→ / 空格)">
            <ChevronRight className="size-5" />
          </Button>
          <div className="w-px h-6 dark:bg-white/20 bg-black/20 mx-1" />
          <Button variant="ghost" size="icon" className="dark:text-white text-black hover:bg-white/20 size-9" onClick={zoomOut} aria-label="缩小" title="缩小 (-)">
            <ZoomOut className="size-4" />
          </Button>
          <span className="dark:text-white text-black text-xs tabular-nums w-12 text-center">
            {Math.round(view.scale * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="dark:text-white text-black hover:bg-white/20 size-9" onClick={zoomIn} aria-label="放大" title="放大 (+)">
            <ZoomIn className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="dark:text-white text-black hover:bg-white/20 size-9" onClick={fitToWindow} aria-label="适应窗口" title="适应窗口 (F)">
            <Maximize2 className="size-4" />
          </Button>
          <div className="w-px h-6 dark:bg-white/20 bg-black/20 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="dark:text-white text-black hover:bg-white/20 size-9"
            onClick={() => {
              const file = entries[currentIndex]
              if (file) {
                setEditingFile(file.path)
                setView("single")
                onEdit()
              }
            }}
            aria-label="编辑"
            title="在单图编辑中打开 (E)"
          >
            <Edit3 className="size-4" />
          </Button>
        </div>
      </div>

      {/* 首次进入提示 */}
      <div
        className={`absolute bottom-16 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 transition-opacity duration-700 ${
          showHint ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="bg-black/70 text-white/90 text-xs px-4 py-2.5 rounded-lg backdrop-blur-sm flex items-center gap-4 tabular-nums">
          <span><kbd className="text-primary">←</kbd> <kbd className="text-primary">→</kbd> 或 <kbd className="text-primary">空格</kbd> 翻页</span>
          <span className="text-white/30">|</span>
          <span><kbd className="text-primary">Esc</kbd> 退出全屏</span>
          <span className="text-white/30">|</span>
          <span><kbd className="text-primary">+</kbd> <kbd className="text-primary">-</kbd> 缩放</span>
          <span className="text-white/30">|</span>
          <span><kbd className="text-primary">R</kbd> 旋转</span>
          <span className="text-white/30">|</span>
          <span><kbd className="text-primary">E</kbd> 编辑</span>
        </div>
      </div>

      {/* 右下角元信息卡 */}
      <div
        className={`absolute bottom-16 right-3 z-10 bg-black/60 text-white text-xs px-3 py-2 rounded-md backdrop-blur-sm transition-opacity duration-200 ${
          toolbarVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {meta ? (
          <div className="space-y-0.5 tabular-nums">
            <div>{dispW} × {dispH} px</div>
            <div>{formatSize(meta.size)}</div>
            <div>{meta.format}</div>
          </div>
        ) : (
          <div className="opacity-60">…</div>
        )}
      </div>

      {/* 加载中 */}
      {imgLoad.loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-white/60 text-sm">
          加载中…
        </div>
      )}

      {/* 加载失败 */}
      {imgLoad.loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="bg-destructive/90 text-white text-sm px-4 py-2 rounded-md">
            {imgLoad.loadError}
          </div>
        </div>
      )}
    </div>
  )
}
