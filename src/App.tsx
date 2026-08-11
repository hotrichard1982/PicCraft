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
import { applyRoutePlan, finderOpenedToRoute, resolveRoute, type StartupRouteArgs } from "@/lib/startup-route"
import { BrowseView } from "@/views/BrowseView"
import { SettingsView } from "@/views/SettingsView"

function App() {
  const currentView = useAppStore((s) => s.currentView)
  const setView = useAppStore((s) => s.setView)
  const hydrate = useAppStore((s) => s.hydrate)

  const [ready, setReady] = useState(false)

  // ─── 启动：hydrate 持久化 + 读启动参数 + 路由 ───
  useEffect(() => {
    let cancelled = false
    // 4) 检查文件关联状态（延迟执行，不阻塞启动；非 Windows 由 Rust 端返回 open_ok=true 直接放行）
    // setTimeout 在 effect 顶层创建，便于 effect 清理（react-doctor/effect-needs-cleanup）
    const assocTimer = setTimeout(() => {
      void (async () => {
        if (cancelled) return
        try {
          const assoc = await invoke<{ open_ok: boolean; current_open_cmd: string | null; expected_open_cmd: string }>("check_file_assoc")
          if (cancelled) return
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
      })()
    }, 1500)

    ;(async () => {
      // 1) 先 hydrate（拿到 lastFolder）
      await hydrate()

      // 2) 读启动参数
      let args: StartupRouteArgs | null = null
      try {
        args = await invoke<StartupRouteArgs>("read_startup_args")
        console.info("[App] startup args:", args)
      } catch (e) {
        console.warn("[App] read_startup_args failed:", e)
      }

      if (cancelled) return

      // 3) 根据 args 路由（与 startup-args-updated / finder-opened 共用同一语义）
      applyRoutePlan(
        resolveRoute(args ?? { mode: "cold", file: null, folder: null }, useAppStore.getState().lastFolder),
      )

      setReady(true)
    })()
    return () => {
      cancelled = true
      clearTimeout(assocTimer)
    }
  }, [hydrate])

  // ─── 监听 single-instance 转发（第二次启动）与 Finder 打开事件（macOS）───
  useEffect(() => {
    const unlistens: Array<() => void> = []
    ;(async () => {
      // single-instance argv 转发（payload：StartupRouteArgs）
      unlistens.push(
        await listen<StartupRouteArgs>("startup-args-updated", (event) => {
          applyRoutePlan(resolveRoute(event.payload, useAppStore.getState().lastFolder))
        }),
      )
      // Finder 打开事件（WORK-004-01 约定：payload 为完整路径数组，原顺序）
      unlistens.push(
        await listen<string[]>("finder-opened", (event) => {
          applyRoutePlan(resolveRoute(finderOpenedToRoute(event.payload), useAppStore.getState().lastFolder))
        }),
      )
    })()
    return () => {
      unlistens.forEach((u) => u())
    }
  }, [])

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
