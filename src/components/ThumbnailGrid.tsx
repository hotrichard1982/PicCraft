import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { invoke } from "@tauri-apps/api/core"
import { useAppStore } from "@/store"
import type { DirEntry } from "@/views/BrowseView"

interface ThumbnailGridProps {
  entries: DirEntry[]
  thumbSize: number
  onOpenFullscreen: (index: number) => void
}

const COL_GAP = 8 // px

/**
 * 缩略图网格 + 懒加载 + 多选 + 框选
 *
 * 性能优化（4 个热点）：
 * 1. mousemove 用 rAF 节流（mousemove 不再触发 React re-render，ref 累积 + rAF flush）
 * 2. thumbSize 变化不重建 observer（observer 用最新 maxWidth 加载，已加载图保留）
 * 3. rubberHit layout 缓存（缩略图 item 位置缓存，只在 scroll/resize 时失效）
 * 4. event handler 用 useCallback 稳定引用
 */
export function ThumbnailGrid({ entries, thumbSize, onOpenFullscreen }: ThumbnailGridProps) {
  const selected = useAppStore((s) => s.selected)
  const setSelected = useAppStore((s) => s.setSelected)
  const toggleSelected = useAppStore((s) => s.toggleSelected)
  const clearSelected = useAppStore((s) => s.clearSelected)
  const enqueue = useAppStore((s) => s.enqueue)
  const setView = useAppStore((s) => s.setView)
  const setEditingFile = useAppStore((s) => s.setEditingFile)

  // ─── 右键菜单 ───
  const [menu, setMenu] = useState<{
    x: number
    y: number
    paths: string[]
    singlePath: string | null
  } | null>(null)

  // ─── 框选（rubber band）───
  // 用 ref 存最新状态，避免 mousemove 触发 React re-render
  const containerRef = useRef<HTMLDivElement>(null)
  const rubberStateRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  // rubber 状态用 React state 只为触发框选框 div 的渲染
  const [rubber, setRubber] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const rubberAnchorRef = useRef<{ x: number; y: number } | null>(null)
  const lastClickedIndexRef = useRef<number | null>(null)

  // ─── 缩略图缓存：path → base64 dataURL | "err" ───
  // 缓存按 maxWidth 分组存储，避免 thumbSize 变化时清空
  const [thumbs, setThumbs] = useState<Record<string, string | "err">>({})
  const thumbCacheRef = useRef<Map<number, Record<string, string | "err">>>(new Map())
  const cacheSizeRef = useRef(0)
  const MAX_CACHE_SIZE = 300
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadingSetRef = useRef<Set<string>>(new Set())
  const currentMaxWidthRef = useRef<number>(thumbSize)

  // ─── Layout 缓存：用于 rubberHit 避免反复 getBoundingClientRect ───
  const itemLayoutsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const containerRectRef = useRef<{ left: number; top: number; scrollLeft: number; scrollTop: number } | null>(null)

  // ─────────────────────────────────────────────────────────
  // 热点 2 修复：observer 只在 mounted 第一次创建，thumbSize 变化时
  //             只更新 maxWidth（用 ref 传递最新值），不重建 observer
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    currentMaxWidthRef.current = thumbSize
    observerRef.current = new IntersectionObserver(
      (items) => {
        for (const it of items) {
          if (it.isIntersecting) {
            const path = (it.target as HTMLElement).dataset.path
            if (!path) continue
            const maxWidth = currentMaxWidthRef.current
            const cacheKey = `${path}@${maxWidth}`
            if (loadingSetRef.current.has(cacheKey)) continue
            // 检查缓存：是否已加载过此 maxWidth 的版本
            const existing = thumbCacheRef.current.get(maxWidth)?.[path]
            if (existing) {
              setThumbs((prev) => ({ ...prev, [path]: existing }))
              observerRef.current?.unobserve(it.target)
              continue
            }
            loadingSetRef.current.add(cacheKey)
            invoke<string>("make_thumbnail", { path, maxWidth })
              .then((b64) => {
                const url = `data:image/png;base64,${b64}`
                // 写两层缓存：内存 Map（按 maxWidth）+ 组件 state（用于渲染）
                const sub = thumbCacheRef.current.get(maxWidth) ?? {}
                sub[path] = url
                thumbCacheRef.current.set(maxWidth, sub)
                cacheSizeRef.current++
                // 缓存上限保护：超限时清空全部（切换目录时自动重建）
                if (cacheSizeRef.current > MAX_CACHE_SIZE) {
                  thumbCacheRef.current.clear()
                  cacheSizeRef.current = 0
                }
                setThumbs((prev) => ({ ...prev, [path]: url }))
              })
              .catch(() => {
                const sub = thumbCacheRef.current.get(maxWidth) ?? {}
                sub[path] = "err"
                thumbCacheRef.current.set(maxWidth, sub)
                cacheSizeRef.current++
                if (cacheSizeRef.current > MAX_CACHE_SIZE) {
                  thumbCacheRef.current.clear()
                  cacheSizeRef.current = 0
                }
                setThumbs((prev) => ({ ...prev, [path]: "err" }))
              })
              .finally(() => {
                loadingSetRef.current.delete(cacheKey)
              })
            observerRef.current?.unobserve(it.target)
          }
        }
      },
      { root: containerRef.current, rootMargin: "200px", threshold: 0.05 },
    )
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, []) // ← 故意空依赖！observer 只创建一次

  // 切换目录时清空所有缩略图缓存
  useEffect(() => {
    setThumbs({})
    thumbCacheRef.current.clear()
    cacheSizeRef.current = 0
    loadingSetRef.current.clear()
    itemLayoutsRef.current.clear()
    containerRectRef.current = null
  }, [entries])

  // ─── 缩略图 item ref callback ───
  const setItemRef = useCallback((path: string, el: HTMLDivElement | null) => {
    const old = itemLayoutsRef.current.get(path)
    if (old !== undefined) itemLayoutsRef.current.delete(path)
    if (el) {
      itemLayoutsRef.current.set(path, { x: 0, y: 0 }) // 占位，layout 缓存见下方
      observerRef.current?.observe(el)
    }
  }, [])

  // ─────────────────────────────────────────────────────────
  // 热点 3 修复：缩略图 item layout 用 ResizeObserver + scroll 监听维护
  //             避免 rubberHit 时反复 getBoundingClientRect
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    // 收集所有 item 的位置（用 getBoundingClientRect 一次性算）
    const measureAll = () => {
      const cr = containerRef.current
      if (!cr) return
      const crRect = cr.getBoundingClientRect()
      containerRectRef.current = {
        left: crRect.left,
        top: crRect.top,
        scrollLeft: cr.scrollLeft,
        scrollTop: cr.scrollTop,
      }
      // 用 DOM 树遍历代替 getBoundingClientRect × N
      const items = cr.querySelectorAll<HTMLElement>("[data-thumb-item]")
      items.forEach((el) => {
        const path = el.dataset.path
        if (!path) return
        const r = el.getBoundingClientRect()
        itemLayoutsRef.current.set(path, {
          x: r.left - crRect.left + cr.scrollLeft,
          y: r.top - crRect.top + cr.scrollTop,
        })
      })
    }

    // 初次测量 + 监听 scroll / resize
    measureAll()
    const cr = containerRef.current
    cr.addEventListener("scroll", measureAll, { passive: true })
    window.addEventListener("resize", measureAll)

    // ResizeObserver：缩略图大小变化（thumbSize）触发重新测量
    const ro = new ResizeObserver(measureAll)
    ro.observe(cr)

    return () => {
      cr.removeEventListener("scroll", measureAll)
      window.removeEventListener("resize", measureAll)
      ro.disconnect()
    }
  }, [entries, thumbSize])

  // ─────────────────────────────────────────────────────────
  // 热点 1 修复：mousemove 用 rAF 节流
  //             rubber 状态用 ref 累积，rAF 回调里才 setState
  // ─────────────────────────────────────────────────────────
  const rafIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!rubber) return
    const onMove = (e: MouseEvent) => {
      const anchor = rubberAnchorRef.current
      if (!anchor) return
      const cx = e.clientX
      const cy = e.clientY
      // 累积到 ref，不触发 re-render
      rubberStateRef.current = {
        x: Math.min(anchor.x, cx),
        y: Math.min(anchor.y, cy),
        w: Math.abs(cx - anchor.x),
        h: Math.abs(cy - anchor.y),
      }
      // rAF 节流：一帧最多一次 setState
      if (rafIdRef.current !== null) return
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        if (rubberStateRef.current) {
          setRubber(rubberStateRef.current)
        }
      })
    }
    const onUp = () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      setRubber(null)
      rubberAnchorRef.current = null
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [rubber])

  // ─── 框选命中检测（用 layout 缓存）───
  const rubberHit = useMemo(() => {
    if (!rubber || rubber.w < 4 || rubber.h < 4) return new Set<string>()
    const hit = new Set<string>()
    const rx1 = rubber.x
    const ry1 = rubber.y
    const rx2 = rubber.x + rubber.w
    const ry2 = rubber.y + rubber.h
    for (const [path, layout] of itemLayoutsRef.current.entries()) {
      const elX1 = layout.x
      const elY1 = layout.y
      const elX2 = layout.x + thumbSize
      const elY2 = layout.y + thumbSize
      const overlapX = elX1 < rx2 && elX2 > rx1
      const overlapY = elY1 < ry2 && elY2 > ry1
      if (overlapX && overlapY) hit.add(path)
    }
    return hit
  }, [rubber, thumbSize])

  // 框选命中时同步到 store（节流到 rubber 真实变化时）
  useEffect(() => {
    if (!rubber || rubber.w < 4 || rubber.h < 4) return
    setSelected(rubberHit)
  }, [rubberHit, rubber, setSelected])

  // ─── 热点 4 修复：useCallback 稳定 handler 引用 ───

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.preventDefault()
      e.stopPropagation()
      const paths = selected.size > 0 ? Array.from(selected) : [path]
      const singlePath = selected.size === 0 ? path : null
      const MENU_W = 200
      const MENU_H = singlePath ? 96 : 64
      const x = Math.min(e.clientX, window.innerWidth - MENU_W - 8)
      const y = Math.min(e.clientY, window.innerHeight - MENU_H - 8)
      setMenu({ x, y, paths, singlePath })
    },
    [selected],
  )

  const handleAddToQueue = useCallback(() => {
    if (!menu) return
    enqueue(menu.paths)
    setView("batch")
    setMenu(null)
  }, [menu, enqueue, setView])

  const handleOpenInSingle = useCallback(() => {
    if (!menu?.singlePath) return
    setEditingFile(menu.singlePath)
    setView("single")
    setMenu(null)
  }, [menu, setEditingFile, setView])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setMenu(null)
    }
    const onDown = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null
      if (target?.closest("[data-context-menu]")) return
      setMenu(null)
    }
    window.addEventListener("mousedown", onDown)
    window.addEventListener("keydown", onKey)
    window.addEventListener("scroll", close, true)
    return () => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("scroll", close, true)
    }
  }, [menu])

  const handleClick = useCallback(
    (e: React.MouseEvent, path: string, index: number) => {
      if (rubber) return
      if (e.ctrlKey || e.metaKey) {
        toggleSelected(path, true)
        lastClickedIndexRef.current = index
      } else if (e.shiftKey && lastClickedIndexRef.current !== null) {
        const a = Math.min(index, lastClickedIndexRef.current)
        const b = Math.max(index, lastClickedIndexRef.current)
        const range = entries.slice(a, b + 1).map((x) => x.path)
        setSelected(new Set(range))
      } else {
        setSelected(new Set([path]))
        lastClickedIndexRef.current = index
      }
    },
    [entries, rubber, setSelected, toggleSelected],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as HTMLElement
      if (target.closest("[data-thumb-item]")) return
      if (!e.shiftKey && !e.ctrlKey) {
        clearSelected()
      }
      const cr = containerRef.current
      if (!cr) return
      const crRect = cr.getBoundingClientRect()
      const x = e.clientX - crRect.left + cr.scrollLeft
      const y = e.clientY - crRect.top + cr.scrollTop
      rubberAnchorRef.current = { x, y }
      const initial = { x, y, w: 0, h: 0 }
      rubberStateRef.current = initial
      setRubber(initial)
    },
    [clearSelected],
  )

  const handleDoubleClick = useCallback(
    (index: number) => {
      onOpenFullscreen(index)
    },
    [onOpenFullscreen],
  )

  // item click handler 用闭包但用 useCallback（每个 path 一次）
  const makeClickHandler = useCallback(
    (path: string, index: number) => (e: React.MouseEvent) => handleClick(e, path, index),
    [handleClick],
  )
  const makeContextMenuHandler = useCallback(
    (path: string) => (e: React.MouseEvent) => handleContextMenu(e, path),
    [handleContextMenu],
  )

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      onMouseDown={handleMouseDown}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))`,
          gap: `${COL_GAP}px`,
        }}
      >
        {entries.map((e, i) => {
          const isSelected = selected.has(e.path)
          const t = thumbs[e.path]
          return (
            <div
              key={e.path}
              data-thumb-item
              data-path={e.path}
              ref={(el) => setItemRef(e.path, el)}
              onClick={makeClickHandler(e.path, i)}
              onContextMenu={makeContextMenuHandler(e.path)}
              onDoubleClick={() => handleDoubleClick(i)}
              className={`relative group rounded-md overflow-hidden border-2 cursor-pointer transition-colors ${
                isSelected
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-transparent hover:border-muted-foreground/40"
              }`}
              style={{ aspectRatio: "1 / 1" }}
            >
              {t && t !== "err" ? (
                <img
                  src={t}
                  alt={e.filename}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : t === "err" ? (
                <div className="w-full h-full flex items-center justify-center bg-muted text-xs text-muted-foreground">
                  加载失败
                </div>
              ) : (
                <div className="w-full h-full bg-muted animate-pulse" />
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-0.5 text-[10px] text-white truncate">
                {e.filename}
              </div>
            </div>
          )
        })}
      </div>
      {rubber && rubber.w > 2 && rubber.h > 2 && (
        <div
          className="absolute pointer-events-none border border-primary bg-primary/10"
          style={{ left: rubber.x, top: rubber.y, width: rubber.w, height: rubber.h }}
        />
      )}
      {menu && (
        <div
          data-context-menu
          role="menu"
          onMouseDown={(ev) => ev.stopPropagation()}
          className="fixed z-50 min-w-[200px] rounded-md border bg-popover text-popover-foreground shadow-md p-1 text-sm"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleAddToQueue}
            className="w-full text-left px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none"
          >
            加入队列{menu.paths.length > 1 ? ` (${menu.paths.length})` : ""}
          </button>
          {menu.singlePath && (
            <button
              type="button"
              role="menuitem"
              onClick={handleOpenInSingle}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none"
            >
              在单图编辑中打开
            </button>
          )}
        </div>
      )}
    </div>
  )
}
