import React, { useRef, useState, useEffect, useCallback, useReducer } from "react"
import { Stage, Layer, Image as KonvaImage, Rect, Transformer, Group } from "react-konva"
import { convertFileSrc } from "@tauri-apps/api/core"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { FlipHorizontal, FlipVertical, RotateCw, RotateCcw } from "lucide-react"
import type Konva from "konva"
import { createReducer } from "@/lib/state-utils"

type TransformMode = "flip-h" | "flip-v" | "rot-cw" | "rot-ccw"

// 静态工具栏按钮（模块作用域，避免每次渲染重建）
const TOOLBAR_BUTTONS: { mode: TransformMode; label: string; icon: typeof FlipHorizontal }[] = [
  { mode: "flip-h",  label: "水平翻转",   icon: FlipHorizontal },
  { mode: "flip-v",  label: "垂直翻转",   icon: FlipVertical },
  { mode: "rot-ccw", label: "逆时针 90°", icon: RotateCcw },
  { mode: "rot-cw",  label: "顺时针 90°", icon: RotateCw },
]

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

// oxlint-disable-next-line react-doctor/only-export-components
export function calculateOverlayRects( // eslint-disable-line react-refresh/only-export-components
  stageSize: { width: number; height: number },
  cropBox: CropRect,
): [CropRect, CropRect, CropRect, CropRect] {
  const { width: stageWidth, height: stageHeight } = stageSize
  const { x, y, width, height } = cropBox

  return [
    { x: 0, y: 0, width: stageWidth, height: Math.max(0, y) },
    { x: 0, y: y + height, width: stageWidth, height: Math.max(0, stageHeight - y - height) },
    { x: 0, y, width: Math.max(0, x), height },
    { x: x + width, y, width: Math.max(0, stageWidth - x - width), height },
  ]
}

interface CropCanvasProps {
  imagePath: string | null
  onCropChange: (rect: CropRect | null) => void
  onFileDrop: (path: string) => void
  cropRect: CropRect | null
  onApplyTransform?: (params: { rotations: number; flipH: boolean; flipV: boolean }) => void
}

const IMG_EXTS = ["jpg", "jpeg", "png", "webp", "bmp"]
const MIN_CROP = 5
const STROKE_COLOR = "#ef4444"
const STROKE_WIDTH = 2
const OVERLAY_COLOR = "rgba(0,0,0,0.45)"
const EMPTY_OVERLAY_RECT: CropRect = { x: 0, y: 0, width: 0, height: 0 }
const CROP_ANCHORS: string[] = ["top-left", "top-center", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-center", "bottom-right"]

const boundBoxFn = (oldBox: { x: number; y: number; width: number; height: number; rotation: number }, newBox: { x: number; y: number; width: number; height: number; rotation: number }) =>
  (newBox.width < MIN_CROP || newBox.height < MIN_CROP) ? oldBox : newBox

// 变换状态（旋转/翻转，纯前端预览）
export interface TransformState {
  rotations: number  // 顺时针 90° 次数 (0-3)
  flipH: boolean
  flipV: boolean
}

export type TransformAction =
  | { type: "rotateCW" }
  | { type: "rotateCCW" }
  | { type: "flipH" }
  | { type: "flipV" }
  | { type: "reset" }

// oxlint-disable-next-line react-doctor/only-export-components
export const transformReducer = createReducer<TransformState, TransformAction>({ // eslint-disable-line react-refresh/only-export-components
  rotateCW: (state) => ({ ...state, rotations: (state.rotations + 1) % 4 }),
  rotateCCW: (state) => ({ ...state, rotations: (state.rotations + 3) % 4 }),
  flipH: (state) => ({ ...state, flipH: !state.flipH }),
  flipV: (state) => ({ ...state, flipV: !state.flipV }),
  reset: () => ({ rotations: 0, flipH: false, flipV: false }),
})

function CropCanvasInner({ imagePath, onCropChange, onFileDrop, cropRect, onApplyTransform }: CropCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const rectRef = useRef<Konva.Rect>(null)
  const overlayRef = useRef<Konva.Group>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 图片加载相关状态
  interface ImgLoadState {
    image: HTMLImageElement | null
    imageSize: { width: number; height: number }
  }
  type ImgLoadAction =
    | { type: "loaded"; image: HTMLImageElement; width: number; height: number }
    | { type: "clear" }

  const imgLoadReducer = createReducer<ImgLoadState, ImgLoadAction>({
    loaded: (_state, action) => ({ image: action.image, imageSize: { width: action.width, height: action.height } }),
    clear: () => ({ image: null, imageSize: { width: 0, height: 0 } }),
  })
  const [imgLoad, dispatchImgLoad] = useReducer(imgLoadReducer, { image: null, imageSize: { width: 0, height: 0 } })

  // UI 状态
  interface UIState {
    isDragOver: boolean
    toolbarVisible: boolean
  }
  type UIAction =
    | { type: "setDragOver"; value: boolean }
    | { type: "setToolbarVisible"; value: boolean }

  const uiReducer = createReducer<UIState, UIAction>({
    setDragOver: (state, action) => ({ ...state, isDragOver: action.value }),
    setToolbarVisible: (state, action) => ({ ...state, toolbarVisible: action.value }),
  })
  const [ui, dispatchUI] = useReducer(uiReducer, { isDragOver: false, toolbarVisible: false })

  // 变换状态（旋转/翻转，纯前端预览）
  const [transform, dispatchTransform] = useReducer(transformReducer, { rotations: 0, flipH: false, flipV: false })

  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })

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
  useEffect(() => { isDragOverRef.current = ui.isDragOver }, [ui.isDragOver])

  // ─── Drag & Drop (Tauri v2 webview-level API) ───
  useEffect(() => {
    let cancelled = false
    let unlistenFn: (() => void) | null = null

    const webview = getCurrentWebview()
    webview.onDragDropEvent((event) => {
      const { type } = event.payload
      if (type === "drop") {
        dispatchUI({ type: "setDragOver", value: false })
        const path = event.payload.paths[0]
        if (path) {
          const ext = path.split(".").pop()?.toLowerCase() || ""
          if (IMG_EXTS.includes(ext)) onFileDropRef.current(path)
        }
      } else if (type === "over") {
        dispatchUI({ type: "setDragOver", value: true })
      } else if (type === "leave") {
        dispatchUI({ type: "setDragOver", value: false })
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

  // ─── Transform: 即时预览（纯前端） ───
  const handleTransform = useCallback((mode: "flip-h" | "flip-v" | "rot-cw" | "rot-ccw") => {
    if (!imagePath) return
    // 旋转/翻转时清除裁剪框（坐标映射在变换状态下不正确）
    if (cropRect) onCropChange(null)
    switch (mode) {
      case "rot-cw":  dispatchTransform({ type: "rotateCW" }); break
      case "rot-ccw": dispatchTransform({ type: "rotateCCW" }); break
      case "flip-h":  dispatchTransform({ type: "flipH" }); break
      case "flip-v":  dispatchTransform({ type: "flipV" }); break
    }
  }, [imagePath, cropRect, onCropChange])

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

  // ─── 图片路径变化时重置变换 ───
  useEffect(() => {
    dispatchTransform({ type: "reset" })
  }, [imagePath])

  // ─── Image Loading ───
  useEffect(() => {
    if (!imagePath) return
    let cancelled = false

    const assetUrl = imagePath.startsWith("http") || imagePath.startsWith("asset:") || imagePath.startsWith("blob:")
      ? imagePath
      : convertFileSrc(imagePath)

    const img = new window.Image()
    img.onload = () => {
      if (cancelled) return
      dispatchImgLoad({ type: "loaded", image: img, width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      console.error("[CropCanvas] Failed to load image from:", assetUrl)
    }
    img.src = assetUrl

    return () => {
      cancelled = true
      img.src = ""
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
  // 旋转 90°/270° 时宽高互换（用于 fit 计算）
  const isRotated = transform.rotations % 2 === 1
  const logicalW = isRotated ? imgLoad.imageSize.height : imgLoad.imageSize.width
  const logicalH = isRotated ? imgLoad.imageSize.width : imgLoad.imageSize.height
  const scale = imgLoad.image ? Math.min(aw / logicalW, ah / logicalH, 1) : 1
  // 视觉边界框的左上角（用于裁剪坐标映射）
  const offsetX = (stageSize.width - logicalW * scale) / 2
  const offsetY = (stageSize.height - logicalH * scale) / 2
  // 图片实际渲染尺寸（始终用原始尺寸，旋转由 Konva 处理）
  const imgW = imgLoad.imageSize.width * scale
  const imgH = imgLoad.imageSize.height * scale
  // 图片中心点（旋转围绕此点）
  const imgCX = offsetX + logicalW * scale / 2
  const imgCY = offsetY + logicalH * scale / 2

  useEffect(() => {
    scaleRef.current = scale
    offsetRef.current = { x: offsetX, y: offsetY }
  }, [scale, offsetX, offsetY])

  const stageToImage = useCallback((sx: number, sy: number) => {
    const s = scaleRef.current
    const o = offsetRef.current
    return { x: (sx - o.x) / s, y: (sy - o.y) / s }
  }, [])

  const updateOverlay = useCallback((cropBox: CropRect) => {
    const group = overlayRef.current
    if (!group) return

    const children = group.getChildren() as Konva.Rect[]
    if (children.length < 4) return

    calculateOverlayRects(stageSize, cropBox).forEach((attrs, index) => {
      children[index].setAttrs(attrs)
    })
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
    if (!imgLoad.image) return
    if (e.target !== e.target.getStage()) return
    const pos = e.target.getStage()!.getPointerPosition()
    if (!pos) return
    const img = stageToImage(pos.x, pos.y)
    drawStartRef.current = { x: img.x, y: img.y }
    isDrawingRef.current = true
    isShowingRef.current = false
    onCropChange(null)
  }, [imgLoad.image, stageToImage, onCropChange])

  const handleMouseMove = useCallback(() => {
    if (!isDrawingRef.current || !imgLoad.image) return
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
      const x2 = Math.min(imgLoad.imageSize.width, Math.max(ds.x, img.x))
      const y2 = Math.min(imgLoad.imageSize.height, Math.max(ds.y, img.y))
      const w = x2 - x1
      const h = y2 - y1
      if (w >= MIN_CROP && h >= MIN_CROP) {
        const s = scaleRef.current
        const o = offsetRef.current
        const sx = Math.round(x1) * s + o.x
        const sy = Math.round(y1) * s + o.y
        const sw = Math.round(w) * s
        const sh = Math.round(h) * s

        updateOverlay({ x: sx, y: sy, width: sw, height: sh })

        if (rectRef.current) {
          rectRef.current.setAttrs({ x: sx, y: sy, width: sw, height: sh })
        }

        showCropUI()
        const layer = rectRef.current?.getLayer()
        if (layer) layer.batchDraw()
      }
    })
  }, [imgLoad.image, stageToImage, imgLoad.imageSize, updateOverlay, showCropUI])

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
    if (r.x + r.width > imgLoad.imageSize.width) r.width = Math.max(MIN_CROP, imgLoad.imageSize.width - r.x)
    if (r.y + r.height > imgLoad.imageSize.height) r.height = Math.max(MIN_CROP, imgLoad.imageSize.height - r.y)
    onCropChangeRef.current(r)
  }, [imgLoad.imageSize])

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
    if (r.x + r.width > imgLoad.imageSize.width) {
      r.x = Math.max(0, imgLoad.imageSize.width - r.width)
      r.width = Math.min(r.width, imgLoad.imageSize.width - r.x)
    }
    if (r.y + r.height > imgLoad.imageSize.height) {
      r.y = Math.max(0, imgLoad.imageSize.height - r.height)
      r.height = Math.min(r.height, imgLoad.imageSize.height - r.y)
    }
    onCropChangeRef.current(r)
  }, [imgLoad.imageSize])

  // ─── RAF cleanup on unmount ───
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const stageCrop = cropRect ? {
    x: cropRect.x * scale + offsetX,
    y: cropRect.y * scale + offsetY,
    width: cropRect.width * scale,
    height: cropRect.height * scale,
  } : null
  const overlayRects = stageCrop ? calculateOverlayRects(stageSize, stageCrop) : null

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => dispatchUI({ type: "setToolbarVisible", value: true })}
      onMouseLeave={() => dispatchUI({ type: "setToolbarVisible", value: false })}
      className={`relative flex-1 bg-muted/30 m-3 rounded-xl overflow-hidden border-2 border-dashed transition-colors ${
        ui.isDragOver ? "border-primary border-solid bg-primary/5" : "border-muted-foreground/25"
      }`}
    >
      {/* Floating transform toolbar */}
      {imagePath && imgLoad.image && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 p-1 rounded-lg bg-card/95 border shadow-lg backdrop-blur-sm transition-all duration-200 ${
            ui.toolbarVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
          }`}
        >
          {TOOLBAR_BUTTONS.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleTransform(mode)}
              className="group relative p-2 rounded-md hover:bg-accent transition-colors"
              aria-label={label}
            >
              <Icon className="size-4" />
              <span className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 text-[10px] whitespace-nowrap rounded bg-foreground text-background opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {label}
              </span>
            </button>
          ))}
          {(transform.rotations !== 0 || transform.flipH || transform.flipV) && (
            <button
              type="button"
              onClick={() => {
                onApplyTransform?.({
                  rotations: transform.rotations,
                  flipH: transform.flipH,
                  flipV: transform.flipV,
                })
                dispatchTransform({ type: "reset" })
              }}
              className="px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              应用
            </button>
          )}
        </div>
      )}

      {imagePath && imgLoad.image ? (
        <Stage ref={stageRef} width={stageSize.width} height={stageSize.height}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
          <Layer listening={false}>
            <KonvaImage image={imgLoad.image}
              x={imgCX} y={imgCY}
              width={imgW} height={imgH}
              offsetX={imgW / 2} offsetY={imgH / 2}
              rotation={transform.rotations * 90}
              scaleX={transform.flipH ? -1 : 1}
              scaleY={transform.flipV ? -1 : 1}
            />
          </Layer>
          <Layer>
            <Group ref={overlayRef} visible={false}>
              <Rect {...(overlayRects?.[0] ?? EMPTY_OVERLAY_RECT)} fill={OVERLAY_COLOR} />
              <Rect {...(overlayRects?.[1] ?? EMPTY_OVERLAY_RECT)} fill={OVERLAY_COLOR} />
              <Rect {...(overlayRects?.[2] ?? EMPTY_OVERLAY_RECT)} fill={OVERLAY_COLOR} />
              <Rect {...(overlayRects?.[3] ?? EMPTY_OVERLAY_RECT)} fill={OVERLAY_COLOR} />
            </Group>

            <Rect ref={rectRef} visible={false}
              x={stageCrop?.x ?? 0} y={stageCrop?.y ?? 0}
              width={stageCrop?.width ?? 0} height={stageCrop?.height ?? 0}
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
