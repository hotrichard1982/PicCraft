import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { confirm } from "@tauri-apps/plugin-dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Header } from "@/components/Header"
import { SingleTab } from "@/components/SingleTab"
import { BatchTab } from "@/components/BatchTab"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { useAppStore, type ViewName } from "@/store"
import { BrowseView } from "@/views/BrowseView"
import { SettingsView } from "@/views/SettingsView"

interface StartupArgs {
  mode: "cold" | "browse" | "edit"
  file: string | null
  folder: string | null
}

function App() {
  const currentView = useAppStore((s) => s.currentView)
  const setView = useAppStore((s) => s.setView)
  const setCurrentFolder = useAppStore((s) => s.setCurrentFolder)
  const setEditingFile = useAppStore((s) => s.setEditingFile)
  const setBrowseTargetFile = useAppStore((s) => s.setBrowseTargetFile)
  const hydrate = useAppStore((s) => s.hydrate)

  const [ready, setReady] = useState(false)

  // ─── 启动：hydrate 持久化 + 读启动参数 + 路由 ───
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // 1) 先 hydrate（拿到 lastFolder）
      await hydrate()

      // 2) 读启动参数
      let args: StartupArgs | null = null
      try {
        args = await invoke<StartupArgs>("read_startup_args")
        console.info("[App] startup args:", args)
      } catch (e) {
        console.warn("[App] read_startup_args failed:", e)
      }

      if (cancelled) return

      // 3) 根据 args 路由
      if (args?.mode === "edit" && args.file) {
        setView("single")
        setEditingFile(args.file)
      } else if (args?.mode === "browse" && args.folder) {
        setView("browse")
        setCurrentFolder(args.folder)
      } else if (args?.mode === "browse" && args.file) {
        // 双击图片：用文件所在目录 + 标记目标文件自动全屏
        setView("browse")
        const sep = args.file.lastIndexOf("\\") >= 0 ? "\\" : "/"
        const folder = args.file.substring(0, args.file.lastIndexOf(sep))
        if (folder) {
          setCurrentFolder(folder)
          setBrowseTargetFile(args.file)
        }
      } else {
        // cold 或 browse 无指定目录：使用上次打开的目录
        setView("browse")
        const cur = useAppStore.getState().lastFolder
        if (cur) setCurrentFolder(cur)
      }

      setReady(true)

      // 4) 检查文件关联状态（延迟执行，不阻塞启动）
      setTimeout(async () => {
        try {
          const assoc = await invoke<{ open_ok: boolean; current_open_cmd: string | null; expected_open_cmd: string }>("check_file_assoc")
          if (!assoc.open_ok) {
            const fix = await confirm(
              `图片默认打开方式被修改了！\n\n当前：${assoc.current_open_cmd ?? "无"}\n期望：${assoc.expected_open_cmd}\n\n是否恢复为图轻剪？`,
              { title: "文件关联", kind: "warning" },
            )
            if (fix) {
              await invoke("register_file_assoc", { writeOpen: true, writeEdit: true })
            }
          }
        } catch (e) {
          console.warn("[App] file assoc check failed:", e)
        }
      }, 1500)
    })()
    return () => {
      cancelled = true
    }
  }, [hydrate, setView, setCurrentFolder, setEditingFile, setBrowseTargetFile])

  // ─── 监听 single-instance 转发（第二次启动）───
  useEffect(() => {
    let unlisten: (() => void) | null = null
    ;(async () => {
      const u = await listen<StartupArgs>("startup-args-updated", async (event) => {
        const a = event.payload
        if (a.mode === "edit" && a.file) {
          setView("single")
          setEditingFile(a.file)
        } else if (a.mode === "browse") {
          setView("browse")
          if (a.folder) {
            setCurrentFolder(a.folder)
          } else if (a.file) {
            const sep = a.file.lastIndexOf("\\") >= 0 ? "\\" : "/"
            const folder = a.file.substring(0, a.file.lastIndexOf(sep))
            if (folder) {
              setCurrentFolder(folder)
              setBrowseTargetFile(a.file)
            }
          }
        }
      })
      unlisten = u
    })()
    return () => {
      unlisten?.()
    }
  }, [setView, setCurrentFolder, setEditingFile, setBrowseTargetFile])

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        加载中…
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col bg-background">
        <Header />

        <Tabs
          value={currentView}
          onValueChange={(v) => setView(v as ViewName)}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="flex justify-center border-b px-4">
            <TabsList className="h-10 -mb-[1px]">
              <TabsTrigger value="browse" className="px-6">浏览</TabsTrigger>
              <TabsTrigger value="single" className="px-6">单图编辑</TabsTrigger>
              <TabsTrigger value="batch" className="px-6">批量编辑</TabsTrigger>
              <TabsTrigger value="settings" className="px-6">设置</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="browse" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
            <BrowseView />
          </TabsContent>
          <TabsContent value="single" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
            <SingleTab />
          </TabsContent>
          <TabsContent value="batch" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
            <BatchTab />
          </TabsContent>
          <TabsContent value="settings" className="flex-1 min-h-0 m-0 data-[state=inactive]:hidden">
            <SettingsView />
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  )
}

export default App
