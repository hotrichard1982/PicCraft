import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Header } from "@/components/Header"
import { SingleTab } from "@/components/SingleTab"
import { BatchTab } from "@/components/BatchTab"
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
      } else if (args?.mode === "browse") {
        setView("browse")
        if (args.folder) {
          setCurrentFolder(args.folder)
        } else if (args.file) {
          // 双击图片：用文件所在目录
          const sep = args.file.lastIndexOf("\\") >= 0 ? "\\" : "/"
          const folder = args.file.substring(0, args.file.lastIndexOf(sep))
          if (folder) setCurrentFolder(folder)
        }
        // 冷启动时：lastFolder 已在 hydrate 里设到 currentFolder
        if (!args.folder && !args.file) {
          const cur = useAppStore.getState().lastFolder
          if (cur) setCurrentFolder(cur)
        }
      } else {
        // cold：默认浏览视图，hydrate 阶段已设了 currentFolder（如有）
        setView("browse")
        const cur = useAppStore.getState().lastFolder
        if (cur) setCurrentFolder(cur)
      }

      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [hydrate, setView, setCurrentFolder, setEditingFile])

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
          if (a.folder) setCurrentFolder(a.folder)
        }
      })
      unlisten = u
    })()
    return () => {
      unlisten?.()
    }
  }, [setView, setCurrentFolder, setEditingFile])

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        加载中…
      </div>
    )
  }

  return (
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
  )
}

export default App
