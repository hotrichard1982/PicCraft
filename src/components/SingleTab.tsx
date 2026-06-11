import { useState, useCallback, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open, save, ask } from "@tauri-apps/plugin-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { CropCanvas, type CropRect } from "@/components/CropCanvas"
import { FolderOpen, RotateCcw, Save, Download } from "lucide-react"

interface ImageInfo {
  path: string
  width: number
  height: number
  format: string
  file_size: number
}

interface ImageResult {
  temp_path: string
  width: number
  height: number
}

interface SaveResult {
  path: string
  file_size: number
}

const IMG_EXTS = ["jpg", "jpeg", "png", "webp", "bmp"]

export function SingleTab() {

  const [filePath, setFilePath] = useState("")
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null)
  const [displayPath, setDisplayPath] = useState<string | null>(null)
  const [tempPath, setTempPath] = useState<string | null>(null)
  const [cropRect, setCropRect] = useState<CropRect | null>(null)

  const [width, setWidth] = useState("800")
  const [height, setHeight] = useState("600")
  const [keepAspect, setKeepAspect] = useState(true)
  const [quality, setQuality] = useState("85")

  const [hasImage, setHasImage] = useState(false)
  const [statusText, setStatusText] = useState("")
  const [isPng, setIsPng] = useState(false)

  // ─── Load Image ───
  const loadImage = useCallback(async (path: string) => {
    if (!path) return
    try {
      const info = await invoke<ImageInfo>("get_image_info", { path })
      setFilePath(path)
      setImageInfo(info)
      // Use asset protocol to load local file in webview
      setDisplayPath(path)
      setTempPath(null)
      setWidth(String(info.width))
      setHeight(String(info.height))
      setHasImage(true)
      setCropRect(null)
      setIsPng(info.format.toLowerCase().includes("png"))
      setStatusText(`原图：${info.width}×${info.height} | ${(info.file_size / 1024).toFixed(0)} KB`)
    } catch (e) {
      setStatusText(`加载失败：${e}`)
    }
  }, [])

  // ─── Browse ───
  const handleBrowse = useCallback(async () => {
    const selected = await open({
      filters: [{ name: "图片文件", extensions: IMG_EXTS }],
    })
    if (selected) {
      loadImage(selected as string)
    }
  }, [loadImage])

  // ─── Crop ───
  const handleApplyCrop = useCallback(async () => {
    if (!filePath || !cropRect) return
    try {
      const result = await invoke<ImageResult>("crop_image", {
        path: tempPath || filePath,
        x: cropRect.x,
        y: cropRect.y,
        width: cropRect.width,
        height: cropRect.height,
      })
      setDisplayPath(result.temp_path)
      setTempPath(result.temp_path)
      setCropRect(null)
      setWidth(String(result.width))
      setHeight(String(result.height))
      setStatusText(`已裁剪至 ${result.width}×${result.height}`)
    } catch (e) {
      setStatusText(`裁剪失败：${e}`)
    }
  }, [filePath, tempPath, cropRect])

  const handleClearCrop = useCallback(() => setCropRect(null), [])

  // ─── Resize ───
  const handleResize = useCallback(async () => {
    if (!filePath) return
    try {
      const tw = parseInt(width) || 800
      const th = parseInt(height) || 600

      let finalW = tw, finalH = th
      if (keepAspect && imageInfo) {
        const ratio = Math.min(tw / imageInfo.width, th / imageInfo.height)
        finalW = Math.round(imageInfo.width * ratio)
        finalH = Math.round(imageInfo.height * ratio)
      }

      const result = await invoke<ImageResult>("resize_image", {
        path: tempPath || filePath,
        targetWidth: finalW,
        targetHeight: finalH,
      })

      // Use asset protocol for temp file
      setDisplayPath(result.temp_path)
      setTempPath(result.temp_path)
      setWidth(String(result.width))
      setHeight(String(result.height))
      setStatusText(`已缩放至 ${result.width}×${result.height}`)
    } catch (e) {
      setStatusText(`缩放失败：${e}`)
    }
  }, [filePath, tempPath, width, height, keepAspect, imageInfo])

  // ─── Aspect Ratio ───
  const handleWidthChange = useCallback((value: string) => {
    setWidth(value)
    if (keepAspect && imageInfo) {
      const w = parseInt(value)
      if (w > 0) {
        setHeight(String(Math.round(w * imageInfo.height / imageInfo.width)))
      }
    }
  }, [keepAspect, imageInfo])

  const handleHeightChange = useCallback((value: string) => {
    setHeight(value)
    if (keepAspect && imageInfo) {
      const h = parseInt(value)
      if (h > 0) {
        setWidth(String(Math.round(h * imageInfo.width / imageInfo.height)))
      }
    }
  }, [keepAspect, imageInfo])

  const handleAspectToggle = useCallback((checked: boolean) => {
    setKeepAspect(checked)
    if (checked && imageInfo) {
      const w = parseInt(width)
      if (w > 0) {
        setHeight(String(Math.round(w * imageInfo.height / imageInfo.width)))
      }
    }
  }, [imageInfo, width])

  // ─── Save As ───
  const handleSaveAs = useCallback(async () => {
    const source = tempPath || filePath
    if (!source) return
    try {
      const selected = await save({
        filters: [
          { name: "JPEG", extensions: ["jpg"] },
          { name: "PNG", extensions: ["png"] },
          { name: "WebP", extensions: ["webp"] },
          { name: "BMP", extensions: ["bmp"] },
        ],
      })
      if (!selected) return

      const ext = (selected as string).split(".").pop()?.toLowerCase() || "jpg"
      const fmt = ext === "jpeg" ? "jpg" : ext

      const result = await invoke<SaveResult>("save_image", {
        tempPath: source,
        savePath: selected,
        format: fmt,
        quality: parseInt(quality) || 85,
      })

      setStatusText(`已保存：${result.path} (${(result.file_size / 1024).toFixed(0)} KB)`)
    } catch (e) {
      setStatusText(`保存失败：${e}`)
    }
  }, [tempPath, filePath, quality])

  // ─── Overwrite ───
  const handleOverwrite = useCallback(async () => {
    if (!tempPath || !filePath) return
    const confirmed = await ask("确定要覆盖原始图片吗？此操作不可撤销。", {
      title: "覆盖确认",
      kind: "warning",
      okLabel: "覆盖",
      cancelLabel: "取消",
    })
    if (!confirmed) return
    try {
      const ext = filePath.split(".").pop()?.toLowerCase() || "jpg"
      const fmt = ext === "jpeg" ? "jpg" : ext

      const result = await invoke<SaveResult>("save_image", {
        tempPath,
        savePath: filePath,
        format: fmt,
        quality: parseInt(quality) || 85,
      })

      setStatusText(`已覆盖：${result.path} (${(result.file_size / 1024).toFixed(0)} KB)`)
    } catch (e) {
      setStatusText(`覆盖失败：${e}`)
    }
  }, [tempPath, filePath, quality])

  // ─── Reset ───
  const handleReset = useCallback(() => {
    if (filePath) {
      setTempPath(null)
      setDisplayPath(filePath)
      if (imageInfo) {
        setWidth(String(imageInfo.width))
        setHeight(String(imageInfo.height))
      }
      setStatusText("已恢复原始图片")
    }
  }, [filePath, imageInfo])

  // ─── Keyboard Shortcuts ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault()
        handleSaveAs()
      } else if (e.ctrlKey && e.key === "s") {
        e.preventDefault()
        handleOverwrite()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [handleSaveAs, handleOverwrite])

  return (
    <div className="flex h-full">
      {/* Canvas */}
      <CropCanvas imagePath={displayPath} cropRect={cropRect}
        onCropChange={setCropRect} onFileDrop={loadImage} />

      {/* Right Panel */}
      <div className="w-72 border-l flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* File Select */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">选择图片</Label>
            <div className="flex gap-2">
              <Input
                value={filePath ? filePath.split(/[/\\]/).pop() : ""}
                readOnly
                placeholder="未选择图片"
                className="text-xs flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleBrowse} className="shrink-0">
                <FolderOpen className="size-3" />
              </Button>
            </div>
          </div>

          <Separator />

          {statusText && (
            <p className="text-xs text-muted-foreground">{statusText}</p>
          )}

          {isPng && (
            <div className="text-xs p-2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
              PNG 为无损格式，压缩将使用调色板量化
            </div>
          )}

          <Separator />

          {/* Resize Section */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">尺寸缩放</Label>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs w-8">宽度</Label>
                <Input value={width} onChange={(e) => handleWidthChange(e.target.value)} className="h-8 text-xs" disabled={!hasImage} />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-8">高度</Label>
                <Input value={height} onChange={(e) => handleHeightChange(e.target.value)} className="h-8 text-xs" disabled={!hasImage} />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={keepAspect} onChange={(e) => handleAspectToggle(e.target.checked)} className="rounded border-input" disabled={!hasImage} />
              <span className="text-xs">保持原图比例</span>
            </label>

            <div className="flex items-center gap-2">
              <Label className="text-xs w-8">质量</Label>
              <Input value={quality} onChange={(e) => setQuality(e.target.value)} className="h-8 text-xs w-16" disabled={!hasImage} />
              <span className="text-xs text-muted-foreground">1-100</span>
            </div>

            <Button size="sm" className="w-full" disabled={!hasImage} onClick={handleResize}>应用缩放</Button>
          </div>

          <Separator />

          {/* Crop Section */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">自由裁剪</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "X", value: cropRect?.x ?? 0 },
                { label: "Y", value: cropRect?.y ?? 0 },
                { label: "宽", value: cropRect?.width ?? 0 },
                { label: "高", value: cropRect?.height ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-1">
                  <Label className="text-xs w-4">{label}</Label>
                  <Input className="h-8 text-xs" disabled value={String(value)} />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" disabled={!cropRect}
                onClick={handleApplyCrop}>应用裁剪</Button>
              <Button size="sm" variant="outline" className="flex-1" disabled={!cropRect}
                onClick={handleClearCrop}>清除</Button>
            </div>
          </div>

          <Separator />

          {/* Save */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" disabled={!hasImage} onClick={handleReset}>
                <RotateCcw className="size-3 mr-1" />重置
              </Button>
              <Button size="sm" className="flex-1" disabled={!tempPath} onClick={handleOverwrite}>
                <Save className="size-3 mr-1" />覆盖原图
              </Button>
            </div>
            <Button size="sm" variant="outline" className="w-full" disabled={!hasImage} onClick={handleSaveAs}>
              <Download className="size-3 mr-1" />另存为
            </Button>
            <p className="text-[10px] text-muted-foreground text-right">Ctrl+S 覆盖原图 | Ctrl+Shift+S 另存为</p>
          </div>
        </div>
      </div>
    </div>
  )
}
