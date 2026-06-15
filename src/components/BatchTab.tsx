import { useState, useCallback, useEffect, useReducer } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { open } from "@tauri-apps/plugin-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { FolderOpen, Play } from "lucide-react"
import { QueuePanel } from "@/components/QueuePanel"
import { useAppStore } from "@/store"

interface BatchProgress {
  current: number
  total: number
  filename: string
  error: string | null
}

const STORAGE_KEY_OUTPUT = "piccraft-batch-output"

// 批处理运行时状态
interface BatchRunState {
  processing: boolean
  progress: BatchProgress
  errors: string[]
  listenFailed: boolean
}

type BatchRunAction =
  | { type: "start" }
  | { type: "setProgress"; progress: BatchProgress; error?: string }
  | { type: "listenFailed" }
  | { type: "finish" }

function batchRunReducer(state: BatchRunState, action: BatchRunAction): BatchRunState {
  switch (action.type) {
    case "start":
      return { ...state, processing: true, errors: [], listenFailed: false, progress: { current: 0, total: 0, filename: "", error: null } }
    case "setProgress":
      return {
        ...state,
        progress: action.progress,
        errors: action.error ? [...state.errors, `${action.progress.filename}: ${action.error}`] : state.errors,
      }
    case "listenFailed":
      return { ...state, listenFailed: true }
    case "finish":
      return { ...state, processing: false }
  }
}

export function BatchTab() {
  const queue = useAppStore((s) => s.queue)
  const updateQueueItem = useAppStore((s) => s.updateQueueItem)

  const [outputDir, setOutputDir] = useState("")
  const [targetWidth, setTargetWidth] = useState("1000")
  const [quality, setQuality] = useState("60")
  const [run, dispatchRun] = useReducer(batchRunReducer, {
    processing: false, progress: { current: 0, total: 0, filename: "", error: null }, errors: [], listenFailed: false,
  })
  const [statusText, setStatusText] = useState("准备就绪")

  // 启动时从 localStorage 恢复上次的 outputDir
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_OUTPUT)
      if (saved) setOutputDir(saved)
    } catch {
      // ignore
    }
  }, [])

  // 写回 localStorage
  useEffect(() => {
    try {
      if (outputDir) localStorage.setItem(STORAGE_KEY_OUTPUT, outputDir)
    } catch {
      // ignore
    }
  }, [outputDir])

  const selectOutput = useCallback(async () => {
    const d = await open({ directory: true })
    if (d) setOutputDir(d as string)
  }, [])

  const handleStart = useCallback(async () => {
    if (queue.length === 0) {
      setStatusText("队列为空，请先在浏览视图加入图片")
      return
    }
    if (!outputDir) {
      setStatusText("请先选择输出文件夹")
      return
    }
    dispatchRun({ type: "start" })
    setStatusText("正在处理...")

    // 把队列全部标记为 processing
    queue.forEach((q) => updateQueueItem(q.path, { status: "processing", error: undefined }))

    let unlisten: UnlistenFn | undefined
    try {
      unlisten = await listen<BatchProgress>("batch-progress", (event) => {
        const p = event.payload
        dispatchRun({ type: "setProgress", progress: p, error: p.error ?? undefined })
        if (p.error) {
          // 标记该文件失败
          const item = queue.find((q) => q.path.endsWith(p.filename) || q.filename === p.filename)
          if (item) updateQueueItem(item.path, { status: "failed", error: p.error })
        } else {
          // 标记该文件完成
          const item = queue.find((q) => q.path.endsWith(p.filename) || q.filename === p.filename)
          if (item) updateQueueItem(item.path, { status: "done" })
        }
        setStatusText(`处理中... ${p.current}/${p.total}`)
      })
    } catch (listenErr) {
      dispatchRun({ type: "listenFailed" })
      console.error("batch-progress listen error:", listenErr)
    }

    try {
      const msg = await invoke<string>("batch_process_queue", {
        paths: queue.map((q) => q.path),
        outputDir,
        targetWidth: parseInt(targetWidth) || 1000,
        quality: parseInt(quality) || 60,
      })
      setStatusText(msg)
    } catch (e) {
      setStatusText(`批量处理失败：${e}`)
    } finally {
      dispatchRun({ type: "finish" })
      unlisten?.()
    }
  }, [queue, outputDir, targetWidth, quality, updateQueueItem])

  return (
    <div className="h-full flex">
      {/* 左侧：参数区 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl mx-auto space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">批量处理</h2>
            <p className="text-sm text-muted-foreground">
              当前队列 <span className="font-semibold text-foreground">{queue.length}</span> 张图片
              {queue.length === 0 && "（请到浏览视图右键图片 → 加入队列）"}
            </p>
          </div>

          <Separator />

          {/* 输出目录 */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">输出目录</Label>
            <div className="flex items-center gap-2">
              <Input value={outputDir} readOnly placeholder="选择输出文件夹" className="text-xs flex-1" />
              <Button variant="outline" size="sm" onClick={selectOutput} disabled={run.processing} className="shrink-0">
                <FolderOpen className="size-3" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">处理后的图片会按原文件名保存到此目录</p>
          </div>

          <Separator />

          {/* 处理参数 */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">处理参数</Label>
            <Separator />
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-xs">目标宽度</Label>
                <Input
                  type="number"
                  min="1"
                  value={targetWidth}
                  onChange={(e) => setTargetWidth(e.target.value)}
                  className="h-8 text-xs w-20"
                  disabled={run.processing}
                />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs">压缩质量</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className="h-8 text-xs w-16"
                  disabled={run.processing}
                />
                <span className="text-xs text-muted-foreground">1-100</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* 开始按钮 + 进度 */}
          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={handleStart}
              disabled={run.processing || queue.length === 0 || !outputDir}
            >
              <Play className="size-4 mr-2" />
              {run.processing ? "处理中..." : `开始处理（${queue.length} 张）`}
            </Button>
            {run.processing && run.progress.total > 0 && (
              <div className="space-y-1">
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${(run.progress.current / run.progress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">{statusText}</p>
              </div>
            )}
            {run.listenFailed && run.processing && (
              <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                进度监听不可用，处理仍在后台进行
              </p>
            )}
            {!run.processing && <p className="text-xs text-muted-foreground text-center">{statusText}</p>}
            {run.errors.length > 0 && (
              <div className="text-xs p-3 rounded bg-destructive/10 text-destructive max-h-32 overflow-y-auto">
                <p className="font-semibold mb-1">处理失败 ({run.errors.length})：</p>
                {run.errors.slice(0, 10).map((e, i) => (
                  <p key={i} className="truncate">
                    {e}
                  </p>
                ))}
                {run.errors.length > 10 && <p>...还有 {run.errors.length - 10} 条错误</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 右侧：队列面板 */}
      <div className="w-80 border-l flex flex-col min-h-0">
        <QueuePanel outputDir={outputDir} onChangeOutputDir={selectOutput} />
      </div>
    </div>
  )
}
