import { Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/hooks/use-theme"
import { openUrl } from "@tauri-apps/plugin-opener"

export function Header() {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="titlebar flex items-center justify-between h-16 px-5 border-b bg-card/80 backdrop-blur-sm">
      {/* Left: Logo + Title */}
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="PicCraft" className="size-10 rounded-lg" />
        <div className="flex flex-col leading-tight">
          <span className="text-lg font-bold tracking-tight">图轻剪 PicCraft</span>
        </div>
      </div>

      {/* Right: Version + Theme + Links */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="text-xs">v0.2.0</span>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="size-8"
          aria-label="切换主题"
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        <a
          href="https://www.cq30.com/"
          onClick={(e) => { e.preventDefault(); openUrl("https://www.cq30.com/") }}
          className="text-xs hover:text-foreground transition-colors cursor-pointer"
        >
          官网
        </a>

        <a
          href="https://github.com/hotrichard1982/PicCraft"
          onClick={(e) => { e.preventDefault(); openUrl("https://github.com/hotrichard1982/PicCraft") }}
          className="text-xs hover:text-foreground transition-colors cursor-pointer"
        >
          GitHub
        </a>
      </div>
    </header>
  )
}
