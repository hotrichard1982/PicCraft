import { useState, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { open } from "@tauri-apps/plugin-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { FolderOpen, Play } from "lucide-react"

interface BatchProgress {
  current: number
  total: number
  filename: string
  error: string | null
}

export function BatchTab() {
  const [inputDir, setInputDir] = useState("")
  const [outputDir, setOutputDir] = useState("")
  const [targetWidth, setTargetWidth] = useState("1000")
  const [quality, setQuality] = useState("60")
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<BatchProgress>({ current: 0, total: 0, filename: "", error: null })
  const [statusText, setStatusText] = useState("准备就绪")
  const [errors, setErrors] = useState<string[]>([])
  const [listenFailed, setListenFailed] = useState(false)

  const selectInput = useCallback(async () => {
    const d = await open({ directory: true })
    if (d) setInputDir(d as string)
  }, [])

  const selectOutput = useCallback(async () => {
    const d = await open({ directory: true })
    if (d) setOutputDir(d as string)
  }, [])

  const handleStart = useCallback(async () => {
    if (!inputDir || !outputDir) {
      setStatusText("请先选择输入和输出文件夹")
      return
    }
    setProcessing(true)
    setErrors([])
    setListenFailed(false)
    setStatusText("正在处理...")
    let unlisten: UnlistenFn | undefined
    try {
      unlisten = await listen<BatchProgress>("batch-progress", (event) => {
        setProgress(event.payload)
        if (event.payload.error) {
          setErrors((prev) => [...prev, `${event.payload.filename}: ${event.payload.error}`])
        }
        setStatusText(`处理中... ${event.payload.current}/${event.payload.total}`)
      })
    } catch (listenErr) {
      setListenFailed(true)
      console.error("batch-progress listen error:", listenErr)
    }
    try {
      const msg = await invoke<string>("batch_process", {
        inputDir, outputDir,
        targetWidth: parseInt(targetWidth) || 1000,
        quality: parseInt(quality) || 60,
      })
      setStatusText(msg)
    } catch (e) {
      setStatusText(`批量处理失败：${e}`)
    } finally {
      setProcessing(false)
      unlisten?.()
    }
  }, [inputDir, outputDir, targetWidth, quality])

  return (
    <div className="flex items-start justify-center pt-12 px-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">文件夹设置</Label>
          <Separator />
          <div className="flex items-center gap-2">
            <Label className="text-xs w-20 shrink-0">图片文件夹</Label>
            <Input value={inputDir} readOnly placeholder="选择图片文件夹" className="text-xs flex-1" />
            <Button variant="outline" size="sm" onClick={selectInput} disabled={processing} className="shrink-0"><FolderOpen className="size-3" /></Button>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs w-20 shrink-0">输出文件夹</Label>
            <Input value={outputDir} readOnly placeholder="选择输出文件夹" className="text-xs flex-1" />
            <Button variant="outline" size="sm" onClick={selectOutput} disabled={processing} className="shrink-0"><FolderOpen className="size-3" /></Button>
          </div>
        </div>
        <Separator />
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">处理参数</Label>
          <Separator />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs">目标宽度</Label>
              <Input type="number" min="1" value={targetWidth} onChange={(e) => setTargetWidth(e.target.value)} className="h-8 text-xs w-20" disabled={processing} />
              <span className="text-xs text-muted-foreground">px</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">压缩质量</Label>
              <Input type="number" min="1" max="100" value={quality} onChange={(e) => setQuality(e.target.value)} className="h-8 text-xs w-16" disabled={processing} />
              <span className="text-xs text-muted-foreground">1-100</span>
            </div>
          </div>
        </div>
        <Separator />
        <div className="space-y-3">
          <Button className="w-full" size="lg" onClick={handleStart} disabled={processing || !inputDir || !outputDir}>
            <Play className="size-4 mr-2" />{processing ? "处理中..." : "开始处理"}
          </Button>
          {processing && progress.total > 0 && (
            <div className="space-y-1">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }} />
              </div>
              <p className="text-xs text-muted-foreground text-center">{statusText}</p>
            </div>
          )}
          {listenFailed && processing && (
            <p className="text-xs text-center text-amber-600 dark:text-amber-400">进度监听不可用，处理仍在后台进行</p>
          )}
          {!processing && <p className="text-xs text-muted-foreground text-center">{statusText}</p>}
          {errors.length > 0 && (
            <div className="text-xs p-3 rounded bg-destructive/10 text-destructive max-h-32 overflow-y-auto">
              <p className="font-semibold mb-1">处理失败 ({errors.length})：</p>
              {errors.slice(0, 10).map((e, i) => <p key={i} className="truncate">{e}</p>)}
              {errors.length > 10 && <p>...还有 {errors.length - 10} 条错误</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
