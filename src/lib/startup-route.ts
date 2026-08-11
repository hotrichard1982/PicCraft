import { useAppStore, type ViewName } from "@/store"

/**
 * 启动/打开事件路由（WORK-004-02）。
 *
 * 单一路由语义：argv 启动参数（read_startup_args / startup-args-updated）与
 * Finder 打开事件（finder-opened，WORK-004-01 约定 payload 为完整路径数组）
 * 都收敛到 resolveRoute → applyRoutePlan，避免多套实现。
 */

export interface StartupRouteArgs {
  mode: "cold" | "browse" | "edit"
  file: string | null
  folder: string | null
}

export interface RoutePlan {
  view: ViewName
  folder: string | null
  targetFile: string | null
  editingFile: string | null
}

/** 提取文件所在目录（保留 App.tsx 原语义：无目录分隔符返回 null） */
export function folderOfFile(file: string): string | null {
  const sep = file.lastIndexOf("\\") >= 0 ? "\\" : "/"
  const idx = file.lastIndexOf(sep)
  return idx <= 0 ? null : file.substring(0, idx)
}

/**
 * finder-opened 事件 payload（完整路径数组，原顺序）→ 路由参数。
 * 多文件只取第一个路径（按第一张图片所在目录浏览，不自动加入队列，PRD-002）。
 */
export function finderOpenedToRoute(paths: readonly string[]): StartupRouteArgs {
  const first = paths[0]
  return first
    ? { mode: "browse", file: first, folder: null }
    : { mode: "cold", file: null, folder: null }
}

/** 路由参数 → 导航计划（纯函数；lastFolder 由调用方传入） */
export function resolveRoute(args: StartupRouteArgs, lastFolder: string | null): RoutePlan {
  if (args.mode === "edit" && args.file) {
    return { view: "single", folder: null, targetFile: null, editingFile: args.file }
  }
  if (args.mode === "browse") {
    if (args.folder) {
      return { view: "browse", folder: args.folder, targetFile: null, editingFile: null }
    }
    if (args.file) {
      const folder = folderOfFile(args.file)
      if (folder) {
        return { view: "browse", folder, targetFile: args.file, editingFile: null }
      }
    }
  }
  // cold / 无可路由内容：回退上次打开的目录（无则保持现状）
  return { view: "browse", folder: lastFolder, targetFile: null, editingFile: null }
}

/** 导航计划应用到 store（folder 为 null 表示不动当前目录） */
export function applyRoutePlan(plan: RoutePlan): void {
  const s = useAppStore.getState()
  s.setView(plan.view)
  if (plan.editingFile !== null) s.setEditingFile(plan.editingFile)
  if (plan.folder !== null) s.setCurrentFolder(plan.folder)
  if (plan.targetFile !== null) s.setBrowseTargetFile(plan.targetFile)
}
