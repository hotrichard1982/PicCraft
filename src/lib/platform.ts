/**
 * 平台检测与平台化文案（PRD-002）。
 *
 * 平台检测方案：Tauri v2 核心 API 不再提供 os.platform()（已移至
 * @tauri-apps/plugin-os，本项目未安装，按「不新增 npm 依赖」约束不引入），
 * 采用运行时 UA 检测——桌面 WebView 的 UA 始终携带宿主平台标识
 * （macOS WKWebView 含 "Macintosh"，Windows WebView2 含 "Windows"），
 * 纯函数形式便于单测。
 */

export type AppPlatform = "macos" | "windows" | "other"

/** 从 UA 字符串检测平台（纯函数） */
export function detectPlatform(ua: string): AppPlatform {
  const lower = ua.toLowerCase()
  if (
    lower.includes("mac") ||
    lower.includes("darwin") ||
    lower.includes("iphone") ||
    lower.includes("ipad")
  ) {
    return "macos"
  }
  if (lower.includes("win")) return "windows"
  return "other"
}

/** 当前运行平台 */
export function getPlatform(): AppPlatform {
  return detectPlatform(typeof navigator !== "undefined" ? navigator.userAgent : "")
}

/** 右键「在资源管理器中显示」的平台化文案 */
export function revealItemLabel(platform: AppPlatform): string {
  return platform === "macos" ? "在 Finder 中显示" : "在资源管理器中显示"
}

export type SaveShortcutKind = "overwrite" | "saveAs" | null

/**
 * 保存快捷键匹配：macOS 用 metaKey（Cmd），其余平台保持 ctrlKey 原行为
 * （Windows 行为与原来完全一致：Ctrl+S 覆盖保存、Ctrl+Shift+S 另存为）。
 */
export function matchSaveShortcut(
  e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; key: string },
  platform: AppPlatform,
): SaveShortcutKind {
  if (platform === "macos") {
    if (!e.metaKey) return null
    if (e.shiftKey && e.key === "S") return "saveAs"
    if (e.key === "s") return "overwrite"
    return null
  }
  if (!e.ctrlKey) return null
  if (e.shiftKey && e.key === "S") return "saveAs"
  if (e.key === "s") return "overwrite"
  return null
}

/** 保存快捷键提示文案（平台化修饰键） */
export function saveShortcutHint(platform: AppPlatform): string {
  const mod = platform === "macos" ? "Cmd" : "Ctrl"
  return `${mod}+S 覆盖原图 | ${mod}+Shift+S 另存为`
}
