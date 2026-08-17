import { useEffect, useState, useCallback, useMemo, useReducer, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { FolderOpen } from "lucide-react"
import { useAppStore } from "@/store"
import { ThumbnailGrid } from "@/components/ThumbnailGrid"
import { StatusBar } from "@/components/StatusBar"
import { FullscreenViewer } from "@/components/FullscreenViewer"
import { Sidebar } from "@/components/Sidebar"
import { useAsyncState, createReducer } from "@/lib/state-utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

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

// ─── 地址栏状态（浏览模式可输入路径跳转）───

export interface AddressBarState {
  draft: string
  editing: boolean
  error: string | null
}

export type AddressBarAction =
  | { type: "startEdit"; folder: string | null }
  | { type: "setDraft"; value: string }
  | { type: "cancelEdit" }
  | { type: "submit" }
  | { type: "showError"; error: string }
  | { type: "folderChanged"; folder: string | null }

export const addressBarReducer = createReducer<AddressBarState, AddressBarAction>({ // eslint-disable-line react-refresh/only-export-components
  startEdit: (_state, action) => ({ draft: action.folder ?? "", editing: true, error: null }),
  setDraft: (state, action) => ({ ...state, draft: action.value }),
  cancelEdit: (state) => ({ ...state, draft: "", editing: false, error: null }),
  submit: (state) => ({ ...state, editing: false, error: null }),
  showError: (state, action) => ({ ...state, editing: false, error: action.error }),
  folderChanged: (state, action) => ({ ...state, draft: action.folder ?? "", error: null }),
})

const THUMB_DEFAULT = 300
const THUMB_MIN = 100
const THUMB_MAX = 800
const THUMB_STEP = 0.1 // ±10% / 步

export function BrowseView() {
  const currentFolder = useAppStore((s) => s.currentFolder)
  const setCurrentFolder = useAppStore((s) => s.setCurrentFolder)
  const browseTargetFile = useAppStore((s) => s.browseTargetFile)
  const setBrowseTargetFile = useAppStore((s) => s.setBrowseTargetFile)

  const [dir, dispatch] = useAsyncState<DirEntry[]>([])
  const [thumbSize, setThumbSize] = useState(THUMB_DEFAULT)
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null)
  const [bar, dispatchBar] = useReducer(addressBarReducer, { draft: "", editing: false, error: null })
  const addressSubmittingRef = useRef(false)

  // 切换目录时关闭全屏看图：render 阶段条件重置（React 官方模式），避免 effect 中 setState
  const [prevFolder, setPrevFolder] = useState(currentFolder)
  if (prevFolder !== currentFolder) {
    setPrevFolder(currentFolder)
    setFullscreenIndex(null)
  }

  // ─── 调 Rust read_dir 加载目录 ───
  const loadFolder = useCallback(async (folder: string) => {
    dispatch({ type: "loadStart" })
    try {
      const result = await invoke<DirEntry[]>("read_dir", { folder })
      dispatch({ type: "loadSuccess", data: result })
    } catch (e) {
      dispatch({ type: "loadError", error: String(e) })
    }
  }, [dispatch])

  useEffect(() => {
    if (currentFolder) {
      void loadFolder(currentFolder)
    } else {
      dispatch({ type: "clear", initialData: [] })
    }
  }, [currentFolder, loadFolder, dispatch])

  // ─── 双击／启动指定目标文件 → 自动进入全屏 ───
  useEffect(() => {
    if (browseTargetFile && dir.data.length > 0 && !dir.loading) {
      const idx = dir.data.findIndex((e) => e.path === browseTargetFile)
      if (idx >= 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFullscreenIndex(idx)
      }
      setBrowseTargetFile(null)
    }
  }, [browseTargetFile, dir.data, dir.loading, setBrowseTargetFile])

  // ─── 侧边栏选择目录 ───
  const handleSelectDirectory = useCallback(
    (path: string) => {
      if (path) setCurrentFolder(path)
    },
    [setCurrentFolder],
  )

  // ─── 地址栏提交：校验后跳转，失败显示错误 ───
  const handleAddressSubmit = useCallback(async () => {
    if (addressSubmittingRef.current) return
    const target = bar.draft.trim()
    if (!target) {
      dispatchBar({ type: "cancelEdit" })
      return
    }
    addressSubmittingRef.current = true
    dispatchBar({ type: "submit" })
    try {
      await invoke<DirEntry[]>("read_dir", { folder: target })
      setCurrentFolder(target)
    } catch (e) {
      dispatchBar({ type: "showError", error: String(e) })
    } finally {
      addressSubmittingRef.current = false
    }
  }, [bar.draft, setCurrentFolder])

  // 外部目录变化（侧边栏/启动）时同步地址栏草稿并清错误
  useEffect(() => {
    dispatchBar({ type: "folderChanged", folder: currentFolder })
  }, [currentFolder])

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

  const totalCount = useMemo(() => dir.data.length, [dir.data])

  return (
    <div className="h-full flex" onWheel={handleWheel}>
      {/* 侧边栏 */}
      <Sidebar
        currentFolder={currentFolder}
        onSelectDirectory={handleSelectDirectory}
      />

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 地址栏 + 缩略图大小控制条 */}
        <div className="flex items-center gap-2 px-4 py-1.5 border-b bg-card/30">
          <Input
            className="h-7 text-xs font-mono flex-1 min-w-0"
            value={bar.editing ? bar.draft : (currentFolder ?? "")}
            readOnly={!bar.editing}
            placeholder="输入目录路径后回车"
            onFocus={() => dispatchBar({ type: "startEdit", folder: currentFolder })}
            onChange={(e) => dispatchBar({ type: "setDraft", value: e.target.value })}
            onBlur={() => {
              if (bar.editing) void handleAddressSubmit()
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddressSubmit()
              if (e.key === "Escape") dispatchBar({ type: "cancelEdit" })
            }}
          />
          {bar.editing && (
            <Button variant="ghost" size="sm" className="h-7 px-2 shrink-0" onClick={() => void handleAddressSubmit()}>
              <ArrowRight className="size-3.5" />
            </Button>
          )}
          {bar.error && (
            <span className="text-xs text-destructive truncate max-w-40" title={bar.error}>{bar.error}</span>
          )}
          {currentFolder && !bar.editing && (
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">缩略图 {thumbSize}px</span>
          )}
        </div>

        {/* 主区 */}
        <div className="flex-1 min-h-0 overflow-auto p-3">
          {!currentFolder ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <FolderOpen className="size-16 opacity-30" />
              <p className="text-sm">在侧边栏中选择一个目录开始浏览</p>
            </div>
          ) : dir.loading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              加载中…
            </div>
          ) : dir.error ? (
            <div className="h-full flex items-center justify-center text-sm text-destructive">
              {dir.error}
            </div>
          ) : dir.data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              该目录没有图片
            </div>
          ) : (
            <ThumbnailGrid
              entries={dir.data}
              thumbSize={thumbSize}
              onOpenFullscreen={(i) => setFullscreenIndex(i)}
            />
          )}
        </div>

        {/* 全屏看图 */}
        {fullscreenIndex !== null && (
          <FullscreenViewer
            entries={dir.data}
            currentIndex={fullscreenIndex}
            onClose={() => setFullscreenIndex(null)}
            onIndexChange={setFullscreenIndex}
            onEdit={() => setFullscreenIndex(null)}
          />
        )}

        {/* 状态栏 */}
        <StatusBar totalCount={totalCount} />
      </div>
    </div>
  )
}
