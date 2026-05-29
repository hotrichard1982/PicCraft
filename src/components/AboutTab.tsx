import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export function AboutTab() {
  return (
    <div className="flex flex-col items-center justify-start pt-8 px-8 gap-6 max-w-lg mx-auto">
      {/* Logo */}
      <img src="/logo.png" alt="PicCraft" className="size-32 rounded-2xl shadow-lg" />

      {/* Title */}
      <div className="text-center">
        <h2 className="text-2xl font-bold">图轻剪 PicCraft</h2>
        <p className="text-sm text-muted-foreground mt-1">v2026.05</p>
      </div>

      <Separator />

      {/* Tech Stack */}
      <Card className="w-full">
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold mb-3 text-center">技术栈</h3>
          <div className="space-y-2 text-sm">
            {[
              ["框架", "Tauri v2 + React 19"],
              ["语言", "Rust + TypeScript"],
              ["图像处理", "image crate + imagequant"],
              ["Canvas", "Konva.js"],
              ["UI", "Tailwind CSS + shadcn/ui"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* License */}
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
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary hover:underline"
            >
              ⭐ GitHub 求Star
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card className="w-full">
        <CardContent className="pt-6">
          <h3 className="text-sm font-semibold mb-3 text-center">联系方式</h3>
          <div className="space-y-2 text-sm">
            {[
              ["公司", "重庆三人众科技有限公司"],
              ["官网", "https://www.cq30.com/"],
              ["QQ", "7602069"],
              ["邮箱", "7602069@qq.com"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span>{value}</span>
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
