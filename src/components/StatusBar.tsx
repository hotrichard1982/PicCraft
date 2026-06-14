import { useAppStore } from "@/store"
import type { DirEntry } from "@/views/BrowseView"

interface StatusBarProps {
  totalCount: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatDate(unix: number | null): string {
  if (!unix) return "—"
  const d = new Date(unix * 1000)
  return d.toLocaleString("zh-CN", { hour12: false })
}

export function StatusBar({ totalCount }: StatusBarProps) {
  const selected = useAppStore((s) => s.selected)
  const queue = useAppStore((s) => s.queue)

  // 单选时显示该图的元信息（需要 entries 列表，本组件通过 store 间接获取）
  // 这里仅依赖 selected 集合；为简化，单独查 store 不优雅，我们改为通过 props 传入 entries
  // 但 M2 阶段不查具体文件元数据，只显示选中数 + 目录总数 + 队列数
  const selectedCount = selected.size

  return (
    <div className="flex items-center justify-between px-4 py-1 border-t bg-card/40 text-xs text-muted-foreground">
      <div>
        {selectedCount > 0
          ? `已选 ${selectedCount} 张`
          : "未选中"}
      </div>
      <div className="flex items-center gap-4">
        <span>队列 {queue.length}</span>
        <span>目录 {totalCount} 张</span>
      </div>
    </div>
  )
}

// 暴露 format 辅助供其他组件复用
export { formatSize, formatDate }
export type { DirEntry }
