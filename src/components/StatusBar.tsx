import { useAppStore } from "@/store"

interface StatusBarProps {
  totalCount: number
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
