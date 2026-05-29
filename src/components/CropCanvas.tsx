import { useRef, useState, useEffect, useCallback, useMemo } from "react"
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from "react-konva"
import { convertFileSrc } from "@tauri-apps/api/core"
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
}

const MIN_CROP = 5
const STROKE_COLOR = "#ef4444"
const STROKE_WIDTH = 2

export function CropCanvas({ imagePath, onCropChange, onFileDrop, cropRect }: CropCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const rectRef = useRef<Konva.Rect>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 })

  const displayImage = useMemo(() => (imagePath ? image : null), [imagePath, image])

  // Resize observer
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

  // Load image
  useEffect(() => {
    if (!imagePath) return
    const img = new window.Image()
    img.onload = () => {
      setImage(img)
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
    const src = imagePath.startsWith("http") || imagePath.startsWith("asset:")
      ? imagePath
      : convertFileSrc(imagePath)
    img.src = src
    return () => { img.onload = null }
  }, [imagePath])

  // Attach/detach transformer
  useEffect(() => {
    if (cropRect && rectRef.current && transformerRef.current) {
      transformerRef.current.nodes([rectRef.current])
      transformerRef.current.getLayer()?.batchDraw()
    } else if (transformerRef.current) {
      transformerRef.current.nodes([])
    }
  }, [cropRect])

  // ESC to cancel crop
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCropChange(null)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onCropChange])

  const fitScale = () => {
    if (!image) return 1
    const padding = 40
    const aw = stageSize.width - padding * 2
    const ah = stageSize.height - padding * 2
    return Math.min(aw / imageSize.width, ah / imageSize.height, 1)
  }

  const scale = fitScale()
  const offsetX = (stageSize.width - imageSize.width * scale) / 2
  const offsetY = (stageSize.height - imageSize.height * scale) / 2

  const stageToImage = useCallback((sx: number, sy: number) => ({
    x: (sx - offsetX) / scale,
    y: (sy - offsetY) / scale,
  }), [offsetX, offsetY, scale])

  const imageToStage = useCallback((ix: number, iy: number) => ({
    x: ix * scale + offsetX,
    y: iy * scale + offsetY,
  }), [offsetX, offsetY, scale])

  const handleMouseDown = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!image) return
    if (e.target !== e.target.getStage()) return
    const pos = e.target.getStage()!.getPointerPosition()
    if (!pos) return
    const img = stageToImage(pos.x, pos.y)
    setDrawStart({ x: img.x, y: img.y })
    setIsDrawing(true)
    onCropChange(null)
  }, [image, stageToImage, onCropChange])

  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || !image) return
    const pos = e.target.getStage()!.getPointerPosition()
    if (!pos) return
    const img = stageToImage(pos.x, pos.y)
    const x1 = Math.max(0, Math.min(drawStart.x, img.x))
    const y1 = Math.max(0, Math.min(drawStart.y, img.y))
    const x2 = Math.min(imageSize.width, Math.max(drawStart.x, img.x))
    const y2 = Math.min(imageSize.height, Math.max(drawStart.y, img.y))
    const w = x2 - x1
    const h = y2 - y1
    if (w >= MIN_CROP && h >= MIN_CROP) {
      onCropChange({ x: Math.round(x1), y: Math.round(y1), width: Math.round(w), height: Math.round(h) })
    }
  }, [isDrawing, image, drawStart, stageToImage, imageSize, onCropChange])

  const handleMouseUp = useCallback(() => setIsDrawing(false), [])

  const handleTransformEnd = useCallback(() => {
    if (!rectRef.current) return
    const node = rectRef.current
    const sx = node.scaleX(); const sy = node.scaleY()
    node.scaleX(1); node.scaleY(1)

    const r: CropRect = {
      x: Math.round(Math.max(0, node.x())),
      y: Math.round(Math.max(0, node.y())),
      width: Math.round(Math.max(MIN_CROP, node.width() * sx)),
      height: Math.round(Math.max(MIN_CROP, node.height() * sy)),
    }
    if (r.x + r.width > imageSize.width) r.width = imageSize.width - r.x
    if (r.y + r.height > imageSize.height) r.height = imageSize.height - r.y
    onCropChange(r)
  }, [imageSize, onCropChange])

  const handleDragEnd = useCallback(() => {
    if (!rectRef.current) return
    const node = rectRef.current
    const r: CropRect = {
      x: Math.round(Math.max(0, node.x())),
      y: Math.round(Math.max(0, node.y())),
      width: node.width(),
      height: node.height(),
    }
    if (r.x + r.width > imageSize.width) r.x = Math.max(0, imageSize.width - r.width)
    if (r.y + r.height > imageSize.height) r.y = Math.max(0, imageSize.height - r.height)
    onCropChange(r)
  }, [imageSize, onCropChange])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files[0]
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase() || ""
      if (["jpg", "jpeg", "png", "webp", "bmp"].includes(ext)) {
        const path = (file as unknown as { path: string }).path
        if (path) onFileDrop(path)
      }
    }
  }, [onFileDrop])

  const stageCrop = cropRect ? imageToStage(cropRect.x, cropRect.y) : null

  return (
    <div ref={containerRef} className="flex-1 bg-muted/30 m-3 rounded-xl overflow-hidden border-2 border-dashed border-muted-foreground/25"
      onDragOver={handleDragOver} onDrop={handleDrop}>
      {displayImage ? (
        <Stage ref={stageRef} width={stageSize.width} height={stageSize.height}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
          <Layer>
            <KonvaImage image={displayImage} x={offsetX} y={offsetY}
              width={imageSize.width * scale} height={imageSize.height * scale} />

            {cropRect && stageCrop && (
              <>
                <Rect x={0} y={0} width={stageSize.width} height={Math.max(0, stageCrop.y)} fill="rgba(0,0,0,0.45)" />
                <Rect x={0} y={stageCrop.y + cropRect.height * scale} width={stageSize.width}
                  height={Math.max(0, stageSize.height - stageCrop.y - cropRect.height * scale)} fill="rgba(0,0,0,0.45)" />
                <Rect x={0} y={stageCrop.y} width={Math.max(0, stageCrop.x)} height={cropRect.height * scale} fill="rgba(0,0,0,0.45)" />
                <Rect x={stageCrop.x + cropRect.width * scale} y={stageCrop.y}
                  width={Math.max(0, stageSize.width - stageCrop.x - cropRect.width * scale)} height={cropRect.height * scale} fill="rgba(0,0,0,0.45)" />

                <Rect ref={rectRef} x={stageCrop.x} y={stageCrop.y}
                  width={cropRect.width * scale} height={cropRect.height * scale}
                  stroke={STROKE_COLOR} strokeWidth={STROKE_WIDTH} strokeScaleEnabled={false}
                  draggable onDragEnd={handleDragEnd} onTransformEnd={handleTransformEnd} />

                <Transformer ref={transformerRef}
                  boundBoxFunc={(oldBox, newBox) =>
                    (newBox.width < MIN_CROP * scale || newBox.height < MIN_CROP * scale) ? oldBox : newBox}
                  borderStroke={STROKE_COLOR} borderStrokeWidth={1}
                  anchorFill="#ffffff" anchorStroke={STROKE_COLOR}
                  anchorSize={8} anchorCornerRadius={2}
                  enabledAnchors={["top-left","top-center","top-right","middle-left","middle-right","bottom-left","bottom-center","bottom-right"]}
                  rotateEnabled={false} keepRatio={false} />
              </>
            )}
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
