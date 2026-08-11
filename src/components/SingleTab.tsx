import { useState, useCallback, useEffect, useReducer, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open, save, ask } from "@tauri-apps/plugin-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { CropCanvas } from "@/components/CropCanvas"
import { useAppStore } from "@/store"
import {
  imageReducer,
  editReducer,
  aspectHeightForWidth,
  aspectWidthForHeight,
  type ImageInfo,
} from "@/lib/single-tab-state"
import { getPlatform, matchSaveShortcut, saveShortcutHint } from "@/lib/platform"
import { FolderOpen, RotateCcw, Save, Download, ListPlus } from "lucide-react"

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

  const [img, dispatchImg] = useReducer(imageReducer, {
    filePath: "", imageInfo: null, displayPath: null, tempPath: null, cropRect: null, hasImage: false, isPng: false,
  })
  const [edit, dispatchEdit] = useReducer(editReducer, {
    width: "800", height: "600", keepAspect: true, quality: "85",
  })
  const [statusText, setStatusText] = useState("")

  // ─── Store (editingFile 来自外部入口；currentFolder 用于找下一张) ───
  const editingFile = useAppStore((s) => s.editingFile)
  const setEditingFile = useAppStore((s) => s.setEditingFile)
  const enqueue = useAppStore((s) => s.enqueue)
  const currentFolder = useAppStore((s) => s.currentFolder)

  // ─── 目录列表缓存（避免 handleEnqueueAndNext 每次重新 read_dir）───
  const entriesRef = useRef<ImageInfo[]>([])
  useEffect(() => {
    if (!currentFolder) return
    invoke<ImageInfo[]>("read_dir", { folder: currentFolder })
      .then((entries) => { entriesRef.current = entries })
      .catch(() => { entriesRef.current = [] })
  }, [currentFolder])

  // ─── Load Image ───
  const loadImage = useCallback(async (path: string) => {
    if (!path) return
    try {
      const info = await invoke<ImageInfo>("get_image_info", { path })
      dispatchImg({ type: "loadImage", path, info })
      dispatchEdit({ type: "setSize", width: String(info.width), height: String(info.height) })
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
    if (!img.filePath || !img.cropRect) return
    try {
      const result = await invoke<ImageResult>("crop_image", {
        path: img.tempPath || img.filePath,
        x: img.cropRect.x,
        y: img.cropRect.y,
        width: img.cropRect.width,
        height: img.cropRect.height,
      })
      dispatchImg({ type: "setTempPath", path: result.temp_path, width: result.width, height: result.height })
      dispatchEdit({ type: "setSize", width: String(result.width), height: String(result.height) })
      setStatusText(`已裁剪至 ${result.width}×${result.height}`)
    } catch (e) {
      setStatusText(`裁剪失败：${e}`)
    }
  }, [img.filePath, img.tempPath, img.cropRect])

  const handleClearCrop = useCallback(() => dispatchImg({ type: "setCropRect", rect: null }), [])

  // ─── Resize ───
  const handleResize = useCallback(async () => {
    if (!img.filePath) return
    try {
      const tw = parseInt(edit.width) || 800
      const th = parseInt(edit.height) || 600

      let finalW = tw, finalH = th
      if (edit.keepAspect && img.imageInfo) {
        const ratio = Math.min(tw / img.imageInfo.width, th / img.imageInfo.height)
        finalW = Math.round(img.imageInfo.width * ratio)
        finalH = Math.round(img.imageInfo.height * ratio)
      }

      const result = await invoke<ImageResult>("resize_image", {
        path: img.tempPath || img.filePath,
        targetWidth: finalW,
        targetHeight: finalH,
      })

      dispatchImg({ type: "setTempPath", path: result.temp_path, width: result.width, height: result.height })
      dispatchEdit({ type: "setSize", width: String(result.width), height: String(result.height) })
      setStatusText(`已缩放至 ${result.width}×${result.height}`)
    } catch (e) {
      setStatusText(`缩放失败：${e}`)
    }
  }, [img.filePath, img.tempPath, img.imageInfo, edit.width, edit.height, edit.keepAspect])

  // ─── Aspect Ratio ───
  const handleWidthChange = useCallback((value: string) => {
    dispatchEdit({ type: "setWidth", value })
    if (edit.keepAspect && img.imageInfo) {
      const h = aspectHeightForWidth(parseInt(value), img.imageInfo.width, img.imageInfo.height)
      if (h !== null) dispatchEdit({ type: "setHeight", value: String(h) })
    }
  }, [edit.keepAspect, img.imageInfo])

  const handleHeightChange = useCallback((value: string) => {
    dispatchEdit({ type: "setHeight", value })
    if (edit.keepAspect && img.imageInfo) {
      const w = aspectWidthForHeight(parseInt(value), img.imageInfo.width, img.imageInfo.height)
      if (w !== null) dispatchEdit({ type: "setWidth", value: String(w) })
    }
  }, [edit.keepAspect, img.imageInfo])

  const handleAspectToggle = useCallback((checked: boolean) => {
    dispatchEdit({ type: "setKeepAspect", value: checked })
    if (checked && img.imageInfo) {
      const h = aspectHeightForWidth(parseInt(edit.width), img.imageInfo.width, img.imageInfo.height)
      if (h !== null) dispatchEdit({ type: "setHeight", value: String(h) })
    }
  }, [img.imageInfo, edit.width])

  // ─── Save As ───
  const handleSaveAs = useCallback(async () => {
    const source = img.tempPath || img.filePath
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
        quality: parseInt(edit.quality) || 85,
      })

      setStatusText(`已保存：${result.path} (${(result.file_size / 1024).toFixed(0)} KB)`)
    } catch (e) {
      setStatusText(`保存失败：${e}`)
    }
  }, [img.tempPath, img.filePath, edit.quality])

  // ─── Overwrite ───
  const handleOverwrite = useCallback(async () => {
    if (!img.tempPath || !img.filePath) return
    const confirmed = await ask("确定要覆盖原始图片吗？此操作不可撤销。", {
      title: "覆盖确认",
      kind: "warning",
      okLabel: "覆盖",
      cancelLabel: "取消",
    })
    if (!confirmed) return
    try {
      const ext = img.filePath.split(".").pop()?.toLowerCase() || "jpg"
      const fmt = ext === "jpeg" ? "jpg" : ext

      const result = await invoke<SaveResult>("save_image", {
        tempPath: img.tempPath,
        savePath: img.filePath,
        format: fmt,
        quality: parseInt(edit.quality) || 85,
      })

      setStatusText(`已覆盖：${result.path} (${(result.file_size / 1024).toFixed(0)} KB)`)
    } catch (e) {
      setStatusText(`覆盖失败：${e}`)
    }
  }, [img.tempPath, img.filePath, edit.quality])

  // ─── Reset ───
  const handleReset = useCallback(() => {
    if (img.filePath) {
      dispatchImg({ type: "resetToOriginal" })
      if (img.imageInfo) {
        dispatchEdit({ type: "setSize", width: String(img.imageInfo.width), height: String(img.imageInfo.height) })
      }
      setStatusText("已恢复原始图片")
    }
  }, [img.filePath, img.imageInfo])

  // ─── Enqueue & Open Next ───
  const handleEnqueueAndNext = useCallback(async () => {
    if (!img.filePath) return
    enqueue([img.filePath])

    if (!currentFolder) {
      setStatusText("已加入队列（无可用目录，无法打开下一张）")
      return
    }

    try {
      const entries = entriesRef.current
      const idx = entries.findIndex((e) => e.path === img.filePath)
      const next = idx >= 0 ? entries[idx + 1] : entries[0]
      if (!next) {
        setStatusText("已加入队列（已是当前目录最后一张）")
        return
      }
      await loadImage(next.path)
      setStatusText(`已加入队列，打开下一张：${next.path.split(/[/\\]/).pop()}`)
    } catch (e) {
      setStatusText(`已加入队列（读目录失败：${e}）`)
    }
  }, [img.filePath, currentFolder, enqueue, loadImage])

  // ─── Consume editingFile on mount / when set externally ───
  useEffect(() => {
    if (editingFile && editingFile !== img.filePath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadImage(editingFile)
      setEditingFile(null)
    }
  }, [editingFile, img.filePath, loadImage, setEditingFile])

  // ─── Keyboard Shortcuts（平台化：macOS 用 Cmd，其余平台保持 Ctrl）───
  useEffect(() => {
    const platform = getPlatform()
    const handler = (e: KeyboardEvent) => {
      const kind = matchSaveShortcut(e, platform)
      if (kind === "saveAs") {
        e.preventDefault()
        handleSaveAs()
      } else if (kind === "overwrite") {
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
      <CropCanvas imagePath={img.displayPath} cropRect={img.cropRect}
        onCropChange={(rect) => dispatchImg({ type: "setCropRect", rect })} onFileDrop={loadImage}
        onApplyTransform={async (params) => {
          const source = img.tempPath || img.filePath
          if (!source) return
          try {
            setStatusText("正在应用变换...")
            const result = await invoke<ImageResult>("apply_transforms", {
              path: source,
              params: { rotations: params.rotations, flipH: params.flipH, flipV: params.flipV },
            })
            dispatchImg({ type: "setTempPath", path: result.temp_path, width: result.width, height: result.height })
            dispatchEdit({ type: "setSize", width: String(result.width), height: String(result.height) })
            const rotDesc = params.rotations > 0 ? `旋转 ${params.rotations * 90}°` : ""
            const flipDesc = [
              params.flipH ? "水平翻转" : "",
              params.flipV ? "垂直翻转" : "",
            ].filter(Boolean).join(" + ")
            setStatusText(`已应用变换：${[rotDesc, flipDesc].filter(Boolean).join(" + ") || "无变换"}`)
          } catch (e) {
            setStatusText(`变换失败：${e}`)
          }
        }}
      />

      {/* Right Panel */}
      <div className="w-72 border-l flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* File Select */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">选择图片</Label>
            <div className="flex gap-2">
              <Input
                value={img.filePath ? img.filePath.split(/[/\\]/).pop() : ""}
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

          {img.isPng && (
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
                <Input type="number" min="1" value={edit.width} onChange={(e) => handleWidthChange(e.target.value)} className="h-8 text-xs" disabled={!img.hasImage} />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs w-8">高度</Label>
                <Input type="number" min="1" value={edit.height} onChange={(e) => handleHeightChange(e.target.value)} className="h-8 text-xs" disabled={!img.hasImage} />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={edit.keepAspect} onChange={(e) => handleAspectToggle(e.target.checked)} className="rounded border-input" disabled={!img.hasImage} />
              <span className="text-xs">保持原图比例</span>
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">质量</Label>
                <span className="text-xs font-mono text-muted-foreground">{edit.quality}</span>
              </div>
              <Slider
                min={1}
                max={100}
                step={1}
                value={parseInt(edit.quality) || 85}
                onValueChange={(v) => dispatchEdit({ type: "setQuality", value: String(v) })}
                disabled={!img.hasImage}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>质量最差</span>
                <span>质量最高</span>
              </div>
            </div>

            <Button size="sm" className="w-full" disabled={!img.hasImage} onClick={handleResize}>应用缩放</Button>
          </div>

          <Separator />

          {/* Crop Section */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">自由裁剪</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "X", value: img.cropRect?.x ?? 0 },
                { label: "Y", value: img.cropRect?.y ?? 0 },
                { label: "宽", value: img.cropRect?.width ?? 0 },
                { label: "高", value: img.cropRect?.height ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-1">
                  <Label className="text-xs w-4">{label}</Label>
                  <Input className="h-8 text-xs" disabled value={String(value)} />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" disabled={!img.cropRect}
                onClick={handleApplyCrop}>应用裁剪</Button>
              <Button size="sm" variant="outline" className="flex-1" disabled={!img.cropRect}
                onClick={handleClearCrop}>清除</Button>
            </div>
          </div>

          <Separator />

          {/* Save */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" disabled={!img.hasImage} onClick={handleReset}>
                <RotateCcw className="size-3 mr-1" />重置
              </Button>
              <Button size="sm" className="flex-1" disabled={!img.tempPath} onClick={handleOverwrite}>
                <Save className="size-3 mr-1" />覆盖原图
              </Button>
            </div>
            <Button size="sm" variant="outline" className="w-full" disabled={!img.hasImage} onClick={handleSaveAs}>
              <Download className="size-3 mr-1" />另存为
            </Button>
            <Button size="sm" variant="outline" className="w-full" disabled={!img.hasImage} onClick={handleEnqueueAndNext}>
              <ListPlus className="size-3 mr-1" />加入队列并打开下一张
            </Button>
            <p className="text-[10px] text-muted-foreground text-right">{saveShortcutHint(getPlatform())}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
