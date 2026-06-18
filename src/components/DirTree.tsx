import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ChevronRight, Folder, FolderOpen, Loader2 } from "lucide-react"

export interface SubdirEntry {
  name: string
  path: string
}

interface DirTreeProps {
  currentFolder: string | null
  onSelectDirectory: (path: string) => void
}

const ROOT_KEY = ""

/**
 * 目录树组件 — 完整文件系统树，懒加载子节点，自动定位到当前目录
 */
export function DirTree({ currentFolder, onSelectDirectory }: DirTreeProps) {
  // Map<parentPath, SubdirEntry[] | null>  null = 未加载
  const [childrenMap, setChildrenMap] = useState<Map<string, SubdirEntry[] | null>>(() => new Map())
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set())
  const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const autoLocatingRef = useRef(false)

  // 加载子目录
  const loadChildren = useCallback(async (parentPath: string) => {
    if (childrenMap.get(parentPath) !== undefined && childrenMap.get(parentPath) !== null) return
    setLoadingSet((prev) => new Set(prev).add(parentPath))
    try {
      const result = await invoke<SubdirEntry[]>("list_subdirs", { path: parentPath || null })
      setChildrenMap((prev) => new Map(prev).set(parentPath, result))
    } catch {
      setChildrenMap((prev) => new Map(prev).set(parentPath, []))
    } finally {
      setLoadingSet((prev) => {
        const next = new Set(prev)
        next.delete(parentPath)
        return next
      })
    }
  }, [childrenMap])

  // 展开/收起
  const toggleExpand = useCallback((path: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
        // 如果子节点未加载，触发加载
        const existing = childrenMap.get(path)
        if (existing === undefined || existing === null) {
          // 延迟加载以避免在 state 更新循环中调用
          setTimeout(() => loadChildren(path), 0)
        }
      }
      return next
    })
  }, [childrenMap, loadChildren])

  // 选择目录
  const handleSelect = useCallback((path: string) => {
    setSelectedPath(path)
    onSelectDirectory(path)
  }, [onSelectDirectory])

  // ─── 自动定位到当前目录 ───
  useEffect(() => {
    if (!currentFolder || autoLocatingRef.current) return
    autoLocatingRef.current = true

    const segments = currentFolder.split(/[/\\]/).filter(Boolean)
    // 构建祖先路径列表
    const ancestorPaths: string[] = []
    if (/^[A-Z]:$/i.test(segments[0] ?? "")) {
      // Windows 驱动器
      ancestorPaths.push(`${segments[0]}\\`)
      let acc = `${segments[0]}\\`
      for (let i = 1; i < segments.length; i++) {
        acc = acc.endsWith("\\") ? `${acc}${segments[i]}` : `${acc}\\${segments[i]}`
        ancestorPaths.push(acc)
      }
    } else {
      // 非 Windows 路径
      let acc = "/"
      for (const seg of segments) {
        acc = acc === "/" ? `/${seg}` : `${acc}/${seg}`
        ancestorPaths.push(acc)
      }
    }

    // 逐层展开 — 每个路径确保加载后展开
    let idx = 0
    const expandNext = async () => {
      if (idx >= ancestorPaths.length) {
        setSelectedPath(currentFolder)
        // 滚动到选中节点
        requestAnimationFrame(() => {
          if (!treeRef.current) return
          const sel = treeRef.current.querySelector("[data-tree-selected]")
          sel?.scrollIntoView({ block: "nearest", behavior: "smooth" })
        })
        autoLocatingRef.current = false
        return
      }
      const p = ancestorPaths[idx]
      // 确保该路径的子节点已加载
      if (!childrenMap.has(p)) {
        setExpandedSet((prev) => new Set(prev).add(p))
        await loadChildren(p)
      } else {
        setExpandedSet((prev) => new Set(prev).add(p))
      }
      idx++
      // 延迟下一层展开，让 React 有时间渲染
      setTimeout(expandNext, 50)
    }
    expandNext()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolder])

  // ─── 渲染可见节点（扁平列表） ───
  const visibleNodes = useMemo(() => {
    const result: { path: string; name: string; depth: number }[] = []

    const walk = (parentPath: string, depth: number) => {
      const children = childrenMap.get(parentPath)
      if (!children) return
      for (const child of children) {
        result.push({ path: child.path, name: child.name, depth })
        if (expandedSet.has(child.path)) {
          walk(child.path, depth + 1)
        }
      }
    }

    walk(ROOT_KEY, 0)
    return result
  }, [childrenMap, expandedSet])

  return (
    <div ref={treeRef} className="text-sm overflow-y-auto overflow-x-hidden flex-1">
      {/* 根节点：此电脑 */}
      <div
        data-tree-root
        className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer select-none transition-colors hover:bg-accent/50`}
        onClick={() => {
          toggleExpand(ROOT_KEY)
        }}
      >
        {loadingSet.has(ROOT_KEY) ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
        ) : (
          <ChevronRight
            className={`size-3.5 shrink-0 transition-transform ${expandedSet.has(ROOT_KEY) ? "rotate-90" : ""}`}
          />
        )}
        <FolderOpen className="size-4 shrink-0 text-primary/70" />
        <span className="truncate font-medium">此电脑</span>
      </div>

      {/* 子节点 */}
      {visibleNodes.map((node) => {
        const isExpanded = expandedSet.has(node.path)
        const isLoading = loadingSet.has(node.path)
        const hasChildren = childrenMap.get(node.path) !== undefined
          ? childrenMap.get(node.path)!.length > 0
          : true // 未加载时默认可展开

        return (
          <div key={node.path}>
            <div
              data-tree-selected={node.path === selectedPath ? "true" : undefined}
              className={`flex items-center gap-1 px-2 py-1 cursor-pointer select-none transition-colors
                ${node.path === selectedPath ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50"}
              `}
              style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
              onClick={() => {
                handleSelect(node.path)
                if (hasChildren && !isLoading) {
                  toggleExpand(node.path)
                }
              }}
            >
              {isLoading ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
              ) : (
                <ChevronRight
                  className={`size-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  style={{ visibility: hasChildren ? "visible" : "hidden" }}
                />
              )}
              {isExpanded ? (
                <FolderOpen className="size-4 shrink-0 text-primary/70" />
              ) : (
                <Folder className="size-4 shrink-0 text-primary/50" />
              )}
              <span className="truncate">{node.name}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
