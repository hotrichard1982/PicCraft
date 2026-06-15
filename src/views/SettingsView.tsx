import { useCallback } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Settings, HelpCircle, Info, Check } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
import { useAppStore } from "@/store"

// ─── 5 个支持的图片格式（CONTEXT.md §8）───
const FORMATS = ["jpg", "jpeg", "png", "webp", "bmp"] as const

// ─── 子 Tab 1：设置 ───
function SettingsSubTab() {
  const fileAssoc = useAppStore((s) => s.settings.fileAssoc)
  const setSettings = useAppStore((s) => s.setSettings)

  const toggle = useCallback(
    (ext: string, checked: boolean) => {
      const next = checked
        ? Array.from(new Set([...fileAssoc, ext]))
        : fileAssoc.filter((e) => e !== ext)
      setSettings({ fileAssoc: next })
    },
    [fileAssoc, setSettings],
  )

  return (
    <div className="flex justify-center pt-8 px-6">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">关联图片格式</h3>
            <p className="text-xs text-muted-foreground mt-1">
              勾选要关联给 Windows 的图片格式（在文件资源管理器双击图片时由 PicCraft 打开）。
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            {FORMATS.map((ext) => {
              const checked = fileAssoc.includes(ext)
              return (
                <label
                  key={ext}
                  onClick={() => toggle(ext, !checked)}
                  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent cursor-pointer select-none"
                >
                  <span
                    role="checkbox"
                    aria-checked={checked}
                    className={
                      "size-4 rounded border flex items-center justify-center transition-colors " +
                      (checked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-input bg-background")
                    }
                  >
                    {checked && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="text-sm">.{ext}</span>
                </label>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── 子 Tab 2：帮助 ───
const HELP_ITEMS: Array<{ title: string; body: string; icon: React.ReactNode }> = [
  {
    title: "如何浏览图片",
    body: "点击工具栏「打开目录」选择文件夹，进入缩略图网格；按 Ctrl+A 可全选当前目录所有图片。",
    icon: <FolderIcon />,
  },
  {
    title: "如何加入队列",
    body: "在浏览视图右键点击缩略图（或选中的多张缩略图），选择「加入队列」；操作完成后会自动切换到批量编辑视图。",
    icon: <QueueIcon />,
  },
  {
    title: "如何编辑 / 批量处理",
    body: "单图编辑用 Konva 画布做裁剪、翻转、旋转；批量编辑视图左侧是队列面板，可统一对队列中的图片执行缩放、压缩、格式转换。",
    icon: <EditIcon />,
  },
  {
    title: "双击图片的关联行为",
    body: "在 Windows 资源管理器双击 .jpg 默认进入浏览视图并全屏看图；右键「打开方式 → 用图轻剪编辑」则进入单图编辑视图。两种入口由 OS 触发源区分。",
    icon: <OpenIcon />,
  },
]

function HelpSubTab() {
  return (
    <div className="flex justify-center pt-8 px-6 pb-8">
      <div className="w-full max-w-lg space-y-2">
        {HELP_ITEMS.map((item) => (
          <details
            key={item.title}
            className="group rounded-lg border bg-card text-card-foreground open:bg-accent/30"
          >
            <summary className="flex items-center gap-3 cursor-pointer list-none px-4 py-3 select-none">
              <span className="text-muted-foreground">{item.icon}</span>
              <span className="text-sm font-medium flex-1">{item.title}</span>
              <span className="text-muted-foreground text-xs transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="px-4 pb-3 text-sm text-muted-foreground leading-relaxed">
              {item.body}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

// ─── 帮助子 Tab 用到的 lucide 替身（保持轻量）───
function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  )
}
function QueueIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}
function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}
function OpenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

// ─── 子 Tab 3：关于（从 AboutTab.tsx 迁移）───
function AboutSubTab() {
  return (
    <div className="flex flex-col items-center justify-start pt-8 px-8 gap-6 max-w-lg mx-auto">
      <img src="/logo.png" alt="PicCraft" className="size-32 rounded-2xl shadow-lg" />

      <div className="text-center">
        <h2 className="text-2xl font-bold">图轻剪 PicCraft</h2>
        <p className="text-sm text-muted-foreground mt-1">v2026.06</p>
      </div>

      <Separator />

      <Card className="w-full">
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold mb-3 text-center">技术栈</h3>
          <div className="space-y-2 text-sm">
            {([
              ["框架", "Tauri v2 + React 19"],
              ["语言", "Rust + TypeScript"],
              ["图像处理", "image crate + imagequant"],
              ["Canvas", "Konva.js"],
              ["UI", "Tailwind CSS + shadcn/ui"],
            ] as const).map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold mb-3 text-center">开源信息</h3>
          <p className="text-sm text-center">
            <span className="text-muted-foreground">协议：</span>
            MIT License
          </p>
          <div className="flex justify-center mt-3">
            <a
              href="https://github.com/hotrichard1982/PicCraft"
              onClick={(e) => {
                e.preventDefault()
                void openUrl("https://github.com/hotrichard1982/PicCraft")
              }}
              className="text-sm text-primary hover:underline cursor-pointer"
            >
              ⭐ GitHub 求Star
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold mb-3 text-center">联系方式</h3>
          <div className="space-y-2 text-sm">
            {([
              ["公司", "重庆三人众科技有限公司"],
              ["官网", "https://www.cq30.com/"],
              ["QQ", "7602069"],
              ["邮箱", "7602069@qq.com"],
            ] as const).map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                {value.startsWith("http") ? (
                  <a
                    href={value}
                    onClick={(e) => {
                      e.preventDefault()
                      void openUrl(value)
                    }}
                    className="text-primary hover:underline cursor-pointer"
                  >
                    {value}
                  </a>
                ) : (
                  <span>{value}</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center pb-8">
        © 重庆三人众科技有限公司
      </p>
    </div>
  )
}

// ─── 主视图：3 个子 Tab ───
export function SettingsView() {
  return (
    <div className="h-full flex flex-col">
      <Tabs
        defaultValue="settings"
        className="h-full flex flex-col"
      >
        <div className="flex justify-center border-b bg-background px-4">
          <TabsList className="h-10 -mb-px">
            <TabsTrigger value="settings" className="px-5 gap-1.5">
              <Settings className="size-3.5" />
              设置
            </TabsTrigger>
            <TabsTrigger value="help" className="px-5 gap-1.5">
              <HelpCircle className="size-3.5" />
              帮助
            </TabsTrigger>
            <TabsTrigger value="about" className="px-5 gap-1.5">
              <Info className="size-3.5" />
              关于
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="settings"
          className="flex-1 min-h-0 overflow-auto m-0 data-[state=inactive]:hidden"
        >
          <SettingsSubTab />
        </TabsContent>
        <TabsContent
          value="help"
          className="flex-1 min-h-0 overflow-auto m-0 data-[state=inactive]:hidden"
        >
          <HelpSubTab />
        </TabsContent>
        <TabsContent
          value="about"
          className="flex-1 min-h-0 overflow-auto m-0 data-[state=inactive]:hidden"
        >
          <AboutSubTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
