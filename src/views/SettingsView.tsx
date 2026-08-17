import { useCallback, useState } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Settings, HelpCircle, Info, Check, Save, Folder, List, Pencil, ExternalLink } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { useAppStore } from "@/store"
import { getPlatform } from "@/lib/platform"

// ─── 5 个支持的图片格式（CONTEXT.md §8）───
const FORMATS = ["jpg", "jpeg", "png", "webp", "bmp"] as const

// ─── 侧边栏导航项 ───
type SubTab = "settings" | "help" | "about"

const NAV_ITEMS: Array<{ key: SubTab; label: string; icon: React.ReactNode }> = [
  { key: "settings", label: "设置", icon: <Settings className="size-4" /> },
  { key: "help", label: "帮助", icon: <HelpCircle className="size-4" /> },
  { key: "about", label: "关于", icon: <Info className="size-4" /> },
]

// ─── 子 Tab 1：设置（按平台分支：macOS 只读说明，Windows 勾选关联）───
function SettingsSubTab() {
  return getPlatform() === "macos" ? <MacOSFileAssocSubTab /> : <WindowsFileAssocSubTab />
}

// Windows：现有文件关联勾选 UI（保持不变）
function WindowsFileAssocSubTab() {
  const fileAssoc = useAppStore((s) => s.settings.fileAssoc)
  const setSettings = useAppStore((s) => s.setSettings)

  // 本地暂存，点击保存后才写入 store
  const [draft, setDraft] = useState<Set<string>>(() => new Set(fileAssoc))
  const [saved, setSaved] = useState(false)

  const toggle = useCallback((ext: string) => {
    setSaved(false)
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(ext)) next.delete(ext)
      else next.add(ext)
      return next
    })
  }, [])

  const handleSave = useCallback(() => {
    setSettings({ fileAssoc: Array.from(draft) })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [draft, setSettings])

  const fileAssocSet = new Set(fileAssoc)
  const isDirty = draft.size !== fileAssoc.length || [...draft].some((e) => !fileAssocSet.has(e))

  return (
    <div className="flex justify-center pt-8 px-6 pb-8">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-6 space-y-5">
          {/* 标题区 */}
          <div className="space-y-1">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Settings className="size-4 text-muted-foreground" />
              关联图片格式
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              勾选要关联给 Windows 的图片格式，勾选后在文件资源管理器双击图片时由 PicCraft 打开。
            </p>
          </div>

          <Separator />

          {/* 格式列表 */}
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((ext) => {
              const checked = draft.has(ext)
              return (
                <label
                  key={ext}
                  className={
                    "flex items-center gap-3 px-4 py-3 rounded-lg border transition-all cursor-pointer select-none " +
                    (checked
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/40")
                  }
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggle(ext)}
                  />
                  <span
                    className={
                      "size-5 rounded border-2 flex items-center justify-center transition-colors " +
                      (checked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/40")
                    }
                  >
                    {checked && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="text-sm font-medium">.{ext}</span>
                </label>
              )
            })}
          </div>

          <Separator />

          {/* 保存按钮 + 反馈 */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={!isDirty}
              className="flex-1"
            >
              <Save className="size-4 mr-2" />
              保存设置
            </Button>
            {saved && (
              <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1 animate-in fade-in slide-in-from-left-2 duration-300">
                <Check className="size-4" />
                已保存
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// macOS：只读展示支持格式 + Finder 默认应用设置教程（不提供假的动态关联勾选，PRD-002）
function MacOSFileAssocSubTab() {
  return (
    <div className="flex justify-center pt-8 px-6 pb-8">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-6 space-y-5">
          {/* 标题区 */}
          <div className="space-y-1">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Settings className="size-4 text-muted-foreground" />
              关联图片格式
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              PicCraft 支持以下图片格式。macOS 上通过 Finder 的「打开方式」设置默认打开应用。
            </p>
          </div>

          <Separator />

          {/* 支持格式（只读列表） */}
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((ext) => (
              <div
                key={ext}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-muted/30 select-none"
              >
                <span className="text-sm font-medium">.{ext}</span>
              </div>
            ))}
          </div>

          <Separator />

          {/* Finder 默认应用设置教程 */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <ExternalLink className="size-4 text-muted-foreground" />
              设置 Finder 默认打开方式
            </h4>
            <ol className="text-sm text-muted-foreground leading-relaxed list-decimal pl-5 space-y-1">
              <li>在 Finder 中右键点击图片</li>
              <li>选择「显示简介」</li>
              <li>在「打开方式」中选择 PicCraft</li>
              <li>点击「全部更改」应用到所有同格式图片</li>
            </ol>
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
    icon: <Folder className="size-4" />,
  },
  {
    title: "如何加入队列",
    body: "在浏览视图右键点击缩略图（或选中的多张缩略图），选择「加入队列」；操作完成后会自动切换到批量编辑视图。",
    icon: <List className="size-4" />,
  },
  {
    title: "如何编辑 / 批量处理",
    body: "单图编辑用 Konva 画布做裁剪、翻转、旋转；批量编辑视图左侧是队列面板，可统一对队列中的图片执行缩放、压缩、格式转换。",
    icon: <Pencil className="size-4" />,
  },
  {
    title: "双击图片的关联行为",
    body: "在 Windows 资源管理器双击 .jpg 默认进入浏览视图并全屏看图；右键「打开方式 → 用图轻剪编辑」则进入单图编辑视图。两种入口由 OS 触发源区分。",
    icon: <ExternalLink className="size-4" />,
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

// ─── 子 Tab 3：关于（从 AboutTab.tsx 迁移）───
function AboutSubTab() {
  return (
    <div className="flex flex-col items-center justify-start pt-8 px-8 gap-6 max-w-lg mx-auto">
      <img src="/logo.png" alt="PicCraft" className="size-32 rounded-2xl shadow-lg" />

      <div className="text-center">
        <h2 className="text-2xl font-bold">图轻剪 PicCraft</h2>
        <p className="text-sm text-muted-foreground mt-1">v0.3.1</p>
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

// ─── 主视图：侧边栏布局 ───
export function SettingsView() {
  const [active, setActive] = useState<SubTab>("settings")

  return (
    <div className="h-full flex">
      {/* 左侧导航栏 */}
      <nav className="w-44 shrink-0 border-r bg-muted/30 py-4 px-2 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => setActive(item.key)}
            className={
              "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left " +
              (active === item.key
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")
            }
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* 右侧内容区 */}
      <div className="flex-1 min-w-0 overflow-auto">
        {active === "settings" && <SettingsSubTab />}
        {active === "help" && <HelpSubTab />}
        {active === "about" && <AboutSubTab />}
      </div>
    </div>
  )
}
