import { create } from "zustand"
import { Store } from "@tauri-apps/plugin-store"

// ─── 类型定义 ───

export type ViewName = "browse" | "single" | "batch" | "settings"

export interface QueueItem {
  path: string
  filename: string
  status: "pending" | "processing" | "done" | "failed"
  error?: string
}

export interface Settings {
  /** 关联给 OS 的图片扩展名 */
  fileAssoc: string[]
}

// ─── Persisted slice 形状（写到磁盘的部分）───

interface PersistedState {
  lastFolder: string | null
  settings: Settings
}

// ─── 整体 store 形状 ───

interface AppState extends PersistedState {
  /** 当前激活的视图（4 选 1）*/
  currentView: ViewName
  /** 当前浏览视图的目录（null = 未选目录）*/
  currentFolder: string | null
  /** 当前浏览视图下选中的图片（多选）*/
  selected: Set<string>
  /** 待处理队列 */
  queue: QueueItem[]
  /** 单图编辑视图的当前文件（启动参数或用户选图时设置）*/
  editingFile: string | null

  // ─── Actions ───
  setView: (v: ViewName) => void
  setCurrentFolder: (folder: string | null) => void
  setEditingFile: (file: string | null) => void
  enqueue: (paths: string[]) => void
  dequeue: (path: string) => void
  clearQueue: () => void
  updateQueueItem: (path: string, patch: Partial<QueueItem>) => void
  setSelected: (paths: Set<string>) => void
  toggleSelected: (path: string, additive: boolean) => void
  clearSelected: () => void
  setSettings: (patch: Partial<Settings>) => void
  /** 启动时调用：把磁盘状态 hydrate 到内存 */
  hydrate: () => Promise<void>
}

// ─── 持久化 store 句柄（懒加载）───

const STORE_FILE = "piccraft-state.json"
let _store: Store | null = null

async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await Store.load(STORE_FILE)
  }
  return _store
}

async function persistKey<T>(key: keyof PersistedState, value: T): Promise<void> {
  try {
    const s = await getStore()
    await s.set(key, value)
    await s.save()
  } catch (e) {
    console.warn(`[store] persist ${String(key)} failed:`, e)
  }
}

// ─── Store 创建 ───

export const useAppStore = create<AppState>((set, get) => ({
  // ─── 初始值（启动时由 hydrate() 覆盖）───
  lastFolder: null,
  currentView: "browse",
  currentFolder: null,
  selected: new Set(),
  queue: [],
  editingFile: null,
  settings: {
    fileAssoc: ["jpg", "jpeg", "png", "webp", "bmp"],
  },

  // ─── Actions ───

  setView: (v) => set({ currentView: v }),

  setCurrentFolder: (folder) => {
    set({ currentFolder: folder, lastFolder: folder, selected: new Set() })
    void persistKey("lastFolder", folder)
  },

  setEditingFile: (file) => set({ editingFile: file }),

  enqueue: (paths) => {
    const existing = new Set(get().queue.map((q) => q.path))
    const newItems: QueueItem[] = paths
      .filter((p) => !existing.has(p))
      .map((p) => ({
        path: p,
        filename: p.split(/[/\\]/).pop() || p,
        status: "pending",
      }))
    if (newItems.length > 0) {
      set((s) => ({ queue: [...s.queue, ...newItems] }))
    }
  },

  dequeue: (path) =>
    set((s) => ({ queue: s.queue.filter((q) => q.path !== path) })),

  clearQueue: () => set({ queue: [] }),

  updateQueueItem: (path, patch) =>
    set((s) => ({
      queue: s.queue.map((q) => (q.path === path ? { ...q, ...patch } : q)),
    })),

  setSelected: (paths) => set({ selected: paths }),

  toggleSelected: (path, additive) => {
    const cur = get().selected
    const next = additive ? new Set(cur) : new Set<string>()
    if (next.has(path)) next.delete(path)
    else next.add(path)
    set({ selected: next })
  },

  clearSelected: () => set({ selected: new Set() }),

  setSettings: (patch) => {
    set((s) => ({ settings: { ...s.settings, ...patch } }))
    void persistKey("settings", get().settings)
  },

  hydrate: async () => {
    try {
      const s = await getStore()
      const lastFolder = (await s.get<string>("lastFolder")) ?? null
      const settings = (await s.get<Settings>("settings")) ?? null
      set({
        lastFolder,
        currentFolder: lastFolder,
        settings: settings ?? {
          fileAssoc: ["jpg", "jpeg", "png", "webp", "bmp"],
        },
      })
    } catch (e) {
      console.warn("[store] hydrate failed:", e)
    }
  },
}))

// ─── 便利 selector（避免不必要的重新渲染）───

export const selectQueue = (s: AppState) => s.queue
export const selectCurrentView = (s: AppState) => s.currentView
export const selectCurrentFolder = (s: AppState) => s.currentFolder
export const selectSettings = (s: AppState) => s.settings
