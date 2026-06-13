import React, { useRef, useState, useEffect, useCallback } from "react"
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Group } from "react-konva"
import { convertFileSrc } from "@tauri-apps/api/core"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { invoke } from "@tauri-apps/api/core"
import { FlipHorizontal, FlipVertical, RotateCw, RotateCcw, Loader2 } from "lucide-react"
import type Konva from "konva"

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

interface CropCanvasProps {
  imagePath: string | null
  onCropChange: (rect: CropRect | null) => void
  onFileDrop: (path: string) => void
  cropRect: CropRect | null
  onTransformed?: (result: { temp_path: string; width: number; height: number }) => void
  onStatus?: (msg: string) => void
}

const IMG_EXTS = ["jpg", "jpeg", "png", "webp", "bmp"]
const MIN_CROP = 5
const STROKE_COLOR = "#ef4444"
const STROKE_WIDTH = 2
const OVERLAY_COLOR = "rgba(0,0,0,0.45)"
const CROP_ANCHORS: string[] = ["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"]

const boundBoxFn = (oldBox: { x: number; y: number; width: number; height: number; rotation: number }, newBox: { x: number; y: number; width: number; height: number; rotation: number }) =>
  (newBox.width < MIN_CROP || newBox.height < MIN_CROP) ? oldBox : newBox

function CropCanvasInner({ imagePath, onCropChange, onFileDrop, cropRect, onTransformed, onStatus }: CropCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const rectRef = useRef<Konva.Rect>(null)
  const overlayRef = useRef<Konva.Group>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [isDragOver, setIsDragOver] = useState(false)
  const [toolbarVisible, setToolbarVisible] = useState(false)
  const [transforming, setTransforming] = useState(false)

  const isDrawingRef = useRef(false)
  const isShowingRef = useRef(false)
  const drawStartRef = useRef({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const onCropChangeRef = useRef(onCropChange)
  const onFileDropRef = useRef(onFileDrop)
  const isDragOverRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => { onCropChangeRef.current = onCropChange }, [onCropChange])
  useEffect(() => { onFileDropRef.current = onFileDrop }, [onFileDrop])
  useEffect(() => { isDragOverRef.current = isDragOver }, [isDragOver])

  // ─── Drag & Drop (Tauri v2 webview-level API) ───
  useEffect(() => {
    let cancelled = false
    let unlistenFn: (() => void) | null = null

    const webview = getCurrentWebview()
    webview.onDragDropEvent((event) => {
      const { type } = event.payload
      if (type === "drop") {
        setIsDragOver(false)
        const path = event.payload.paths[0]
        if (path) {
          const ext = path.split(".").pop()?.toLowerCase() || ""
          if (IMG_EXTS.includes(ext)) onFileDropRef.current(path)
        }
      } else if (type === "over") {
        setIsDragOver(true)
      } else if (type === "leave") {
        setIsDragOver(false)
      }
    }).then((fn) => {
      if (cancelled) fn()
      else unlistenFn = fn
    })

    return () => {
      cancelled = true
      if (unlistenFn) unlistenFn()
    }
  }, [])

  // ─── Transform: flip / rotate ───
  const handleTransform = useCallback(async (mode: "flip-h" | "flip-v" | "rot-cw" | "rot-ccw") => {
    const source = imagePath
    if (!source || transforming) return
    setTransforming(true)
    try {
      const result = await invoke<{ temp_path: string; width: number; height: number }>(
        "transform_image",
        { path: source, mode },
      )
      onTransformed?.(result)
      onStatus?.(
        mode === "flip-h" ? "已水平翻转"
        : mode === "flip-v" ? "已垂直翻转"
        : mode === "rot-cw" ? "已顺时针旋转 90°"
        : "已逆时针旋转 90°"
      )
    } catch (e) {
      onStatus?.(`变换失败：${e}`)
    } finally {
      setTransforming(false)
    }
  }, [imagePath, transforming, onTransformed, onStatus])

  // ─── Container Resize ───
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setStageSize({ width, height })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // ─── Image Loading ───
  useEffect(() => {
    if (!imagePath) return
    let cancelled = false
    let objectUrl: string | null = null

    const loadImage = async () => {
      try {
        const assetUrl = imagePath.startsWith("http") || imagePath.startsWith("asset:") || imagePath.startsWith("blob:")
          ? imagePath
          : convertFileSrc(imagePath)

        const response = await fetch(assetUrl)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const blob = await response.blob()
        if (cancelled) return

        objectUrl = URL.createObjectURL(blob)
        const img = new window.Image()
        img.onload = () => {
          if (cancelled) return
          setImage(img)
          setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
        }
        img.onerror = () => {
          console.error("[CropCanvas] Failed to load image from:", assetUrl)
        }
        img.src = objectUrl
      } catch (err) {
        console.error("[CropCanvas] Failed to fetch image:", err)
      }
    }

    loadImage()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [imagePath])

  // ─── CropRect → Transformer sync (with isDrawing guard) ───
  useEffect(() => {
    if (cropRect && rectRef.current && transformerRef.current) {
      transformerRef.current.nodes([rectRef.current])
      transformerRef.current.getLayer()?.batchDraw()
    } else if (transformerRef.current && !isDrawingRef.current) {
      transformerRef.current.nodes([])
    }
  }, [cropRect])

  // ─── Escape key ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCropChange(null)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onCropChange])

  const padding = 40
  const aw = stageSize.width - padding * 2
  const ah = stageSize.height - padding * 2
  const scale = image ? Math.min(aw / imageSize.width, ah / imageSize.height, 1) : 1
  const offsetX = (stageSize.width - imageSize.width * scale) / 2
  const offsetY = (stageSize.height - imageSize.height * scale) / 2

  useEffect(() => {
    scaleRef.current = scale
    offsetRef.current = { x: offsetX, y: offsetY }
  }, [scale, offsetX, offsetY])

  const stageToImage = useCallback((sx: number, sy: number) => {
    const s = scaleRef.current
    const o = offsetRef.current
    return { x: (sx - o.x) / s, y: (sy - o.y) / s }
  }, [])

  const updateOverlay = useCallback((cx: number, cy: number, cw: number, ch: number) => {
    const group = overlayRef.current
    if (!group) return
    const sw = stageSize.width
    const sh = stageSize.height

    const children = group.getChildren() as Konva.Rect[]
    if (children.length < 4) return

    children[0].setAttrs({ x: 0, y: 0, width: sw, height: Math.max(0, cy) })
    children[1].setAttrs({ x: 0, y: cy + ch, width: sw, height: Math.max(0, sh - cy - ch) })
    children[2].setAttrs({ x: 0, y: cy, width: Math.max(0, cx), height: ch })
    children[3].setAttrs({ x: cx + cw, y: cy, width: Math.max(0, sw - cx - cw), height: ch })
  }, [stageSize])

  const showCropUI = useCallback(() => {
    if (isShowingRef.current) return
    isShowingRef.current = true
    const group = overlayRef.current
    const rect = rectRef.current
    const tr = transformerRef.current
    if (group) group.visible(true)
    if (rect) rect.visible(true)
    if (tr && rect) {
      if (isDrawingRef.current) {
        tr.enabledAnchors([])
        tr.borderEnabled(false)
      } else {
        tr.enabledAnchors(CROP_ANCHORS as never[])
        tr.borderEnabled(true)
      }
      tr.nodes([rect])
    }
  }, [])

  const hideCropUI = useCallback(() => {
    isShowingRef.current = false
    const group = overlayRef.current
    const rect = rectRef.current
    const tr = transformerRef.current
    if (group) group.visible(false)
    if (rect) rect.visible(false)
    if (tr) {
      tr.enabledAnchors(CROP_ANCHORS as never[])
      tr.borderEnabled(true)
      tr.nodes([])
    }
  }, [])

  useEffect(() => {
    if (cropRect) {
      showCropUI()
    } else if (!isDrawingRef.current) {
      hideCropUI()
    }
  }, [cropRect, showCropUI, hideCropUI])

  // ─── Mouse Handlers ───
  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!image) return
    if (e.target !== e.target.getStage()) return
    const pos = e.target.getStage()!.getPointerPosition()
    if (!pos) return
    const img = stageToImage(pos.x, pos.y)
    drawStartRef.current = { x: img.x, y: img.y }
    isDrawingRef.current = true
    isShowingRef.current = false
    onCropChange(null)
  }, [image, stageToImage, onCropChange])

  const handleMouseMove = useCallback(() => {
    if (!isDrawingRef.current || !image) return
    if (isDragOverRef.current) return
    if (rafRef.current !== null) return

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const pos = stageRef.current?.getPointerPosition()
      if (!pos) return
      const img = stageToImage(pos.x, pos.y)
      const ds = drawStartRef.current
      const x1 = Math.max(0, Math.min(ds.x, img.x))
      const y1 = Math.max(0, Math.min(ds.y, img.y))
      const x2 = Math.min(imageSize.width, Math.max(ds.x, img.x))
      const y2 = Math.min(imageSize.height, Math.max(ds.y, img.y))
      const w = x2 - x1
      const h = y2 - y1
      if (w >= MIN_CROP && h >= MIN_CROP) {
        const s = scaleRef.current
        const o = offsetRef.current
        const sx = Math.round(x1) * s + o.x
        const sy = Math.round(y1) * s + o.y
        const sw = Math.round(w) * s
        const sh = Math.round(h) * s

        updateOverlay(sx, sy, sw, sh)

        if (rectRef.current) {
          rectRef.current.setAttrs({ x: sx, y: sy, width: sw, height: sh })
        }

        showCropUI()
        const layer = rectRef.current?.getLayer()
        if (layer) layer.batchDraw()
      }
    })
  }, [image, stageToImage, imageSize, updateOverlay, showCropUI])

  const handleMouseUp = useCallback(() => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    if (rectRef.current && rectRef.current.visible()) {
      const tr = transformerRef.current
      if (tr) {
        tr.enabledAnchors(CROP_ANCHORS as never[])
        tr.borderEnabled(true)
      }

      const s = scaleRef.current
      const o = offsetRef.current
      const node = rectRef.current
      const crop: CropRect = {
        x: Math.round(Math.max(0, (node.x() - o.x) / s)),
        y: Math.round(Math.max(0, (node.y() - o.y) / s)),
        width: Math.round(node.width() / s),
        height: Math.round(node.height() / s),
      }
      onCropChangeRef.current(crop)
    }
  }, [])

  const handleTransformEnd = useCallback(() => {
    if (!rectRef.current) return
    const node = rectRef.current
    const sx = node.scaleX(); const sy = node.scaleY()
    node.scaleX(1); node.scaleY(1)

    const s = scaleRef.current
    const o = offsetRef.current

    const r: CropRect = {
      x: Math.round(Math.max(0, (node.x() - o.x) / s)),
      y: Math.round(Math.max(0, (node.y() - o.y) / s)),
      width: Math.round(Math.max(MIN_CROP, node.width() * sx / s)),
      height: Math.round(Math.max(MIN_CROP, node.height() * sy / s)),
    }
    if (r.x + r.width > imageSize.width) r.width = imageSize.width - r.x
    if (r.y + r.height > imageSize.height) r.height = imageSize.height - r.y
    onCropChangeRef.current(r)
  }, [imageSize])

  const handleDragEnd = useCallback(() => {
    if (!rectRef.current) return
    const node = rectRef.current
    const s = scaleRef.current
    const o = offsetRef.current

    const r: CropRect = {
      x: Math.round(Math.max(0, (node.x() - o.x) / s)),
      y: Math.round(Math.max(0, (node.y() - o.y) / s)),
      width: Math.round(node.width() / s),
      height: Math.round(node.height() / s),
    }
    if (r.x + r.width > imageSize.width) r.x = Math.max(0, imageSize.width - r.width)
    if (r.y + r.height > imageSize.height) r.y = Math.max(0, imageSize.height - r.height)
    onCropChangeRef.current(r)
  }, [imageSize])

  // ─── RAF cleanup on unmount ───
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const stageCrop = cropRect ? {
    x: cropRect.x * scale + offsetX,
    y: cropRect.y * scale + offsetY,
  } : null

  const toolbarButtons = [
    { mode: "flip-h" as const, label: "水平翻转", icon: FlipHorizontal },
    { mode: "flip-v" as const, label: "垂直翻转", icon: FlipVertical },
    { mode: "rot-ccw" as const, label: "逆时针 90°", icon: RotateCcw },
    { mode: "rot-cw" as const, label: "顺时针 90°", icon: RotateCw },
  ]

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setToolbarVisible(true)}
      onMouseLeave={() => setToolbarVisible(false)}
      className={`relative flex-1 bg-muted/30 m-3 rounded-xl overflow-hidden border-2 border-dashed transition-colors ${
        isDragOver ? "border-primary border-solid bg-primary/5" : "border-muted-foreground/25"
      }`}
    >
      {/* Floating transform toolbar */}
      {imagePath && image && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 p-1 rounded-lg bg-card/95 border shadow-lg backdrop-blur-sm transition-all duration-200 ${
            toolbarVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
          }`}
        >
          {transforming ? (
            <div className="px-3 py-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              处理中...
            </div>
          ) : (
            toolbarButtons.map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleTransform(mode)}
                className="group relative p-2 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                disabled={transforming}
                aria-label={label}
              >
                <Icon className="size-4" />
                <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] whitespace-nowrap rounded bg-foreground text-background opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {label}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {imagePath && image ? (
        <Stage ref={stageRef} width={stageSize.width} height={stageSize.height}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
          <Layer listening={false}>
            <KonvaImage image={image} x={offsetX} y={offsetY}
              width={imageSize.width * scale} height={imageSize.height * scale} />
          </Layer>
          <Layer>
            <Group ref={overlayRef} visible={false}>
              <Rect fill={OVERLAY_COLOR} />
              <Rect fill={OVERLAY_COLOR} />
              <Rect fill={OVERLAY_COLOR} />
              <Rect fill={OVERLAY_COLOR} />
            </Group>

            <Rect ref={rectRef} visible={false}
              x={stageCrop?.x ?? 0} y={stageCrop?.y ?? 0}
              width={cropRect ? cropRect.width * scale : 0} height={cropRect ? cropRect.height * scale : 0}
              stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} strokeScaleEnabled={false}
              draggable onDragEnd={handleDragEnd} onTransformEnd={handleTransformEnd} />

            <Transformer ref={transformerRef}
              boundBoxFunc={boundBoxFn}
              borderStroke={STROKE_COLOR} borderStrokeWidth={1}
              anchorFill="#ffffff" anchorStroke={STROKE_COLOR}
              anchorSize={8} anchorCornerRadius={2}
              enabledAnchors={CROP_ANCHORS as never[]}
              rotateEnabled={false} keepRatio={false} />
          </Layer>
        </Stage>
      ) : (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <svg className="size-16 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <p className="text-sm">拖拽图片到此处，或点击浏览选择</p>
            <p className="text-xs opacity-50">支持 JPG / PNG / WebP / BMP</p>
          </div>
        </div>
      )}
    </div>
  )
}

export const CropCanvas = React.memo(CropCanvasInner)
