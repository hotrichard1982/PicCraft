import { createReducer } from "@/lib/state-utils"
import type { CropRect } from "@/components/CropCanvas"

export interface ImageInfo {
  path: string
  width: number
  height: number
  format: string
  file_size: number
}

/** 一次编辑步骤后的图片状态（temp 路径 + 该步产物尺寸） */
export interface EditSnapshot {
  tempPath: string
  width: number
  height: number
}

// 图片文件相关状态
export interface ImageState {
  filePath: string
  imageInfo: ImageInfo | null
  displayPath: string | null
  tempPath: string | null
  cropRect: CropRect | null
  hasImage: boolean
  isPng: boolean
  /** 已应用的编辑步骤栈（撤销用），不含原图 */
  history: EditSnapshot[]
  /** 已撤销的步骤栈（重做用） */
  redoStack: EditSnapshot[]
}

export type ImageAction =
  | { type: "loadImage"; path: string; info: ImageInfo }
  | { type: "setDisplayPath"; path: string }
  | { type: "setTempPath"; path: string; width: number; height: number }
  | { type: "setCropRect"; rect: CropRect | null }
  | { type: "resetToOriginal" }
  | { type: "undoEdit" }
  | { type: "redoEdit" }

export const imageReducer = createReducer<ImageState, ImageAction>({
  loadImage: (_state, action) => ({
    filePath: action.path,
    imageInfo: action.info,
    displayPath: action.path,
    tempPath: null,
    cropRect: null,
    hasImage: true,
    isPng: action.info.format.toLowerCase().includes("png"),
    history: [],
    redoStack: [],
  }),
  setDisplayPath: (state, action) => ({ ...state, displayPath: action.path }),
  setTempPath: (state, action) => {
    const snapshot = { tempPath: action.path, width: action.width, height: action.height }
    const current = state.history[state.history.length - 1]
    if (current?.tempPath === action.path && current.width === action.width && current.height === action.height) {
      return state
    }
    return {
      ...state,
      displayPath: action.path,
      tempPath: action.path,
      cropRect: null,
      history: [...state.history, snapshot],
      redoStack: [],
    }
  },
  setCropRect: (state, action) => ({ ...state, cropRect: action.rect }),
  resetToOriginal: (state) =>
    state.filePath
      ? { ...state, displayPath: state.filePath, tempPath: null, cropRect: null, history: [], redoStack: [] }
      : state,
  undoEdit: (state) => {
    if (state.history.length === 0) return state
    const history = state.history.slice(0, -1)
    const last = history[history.length - 1]
    const redoStack = [...state.redoStack, state.history[state.history.length - 1]]
    return {
      ...state,
      displayPath: last ? last.tempPath : state.filePath,
      tempPath: last ? last.tempPath : null,
      cropRect: null,
      history,
      redoStack,
    }
  },
  redoEdit: (state) => {
    if (state.redoStack.length === 0) return state
    const snapshot = state.redoStack[state.redoStack.length - 1]
    return {
      ...state,
      displayPath: snapshot.tempPath,
      tempPath: snapshot.tempPath,
      cropRect: null,
      history: [...state.history, snapshot],
      redoStack: state.redoStack.slice(0, -1),
    }
  },
})

/**
 * 当前编辑图尺寸：有 temp 图时按当前 tempPath 找对应快照，否则原图尺寸。
 * 由路径而非历史末位决定，避免撤销栈顺序与当前展示图产生隐式耦合。
 */
export function currentEditSize(state: ImageState): { width: number; height: number } | null {
  const snapshot = state.tempPath
    ? state.history.findLast((item) => item.tempPath === state.tempPath)
    : undefined
  if (snapshot) return { width: snapshot.width, height: snapshot.height }
  if (state.imageInfo) return { width: state.imageInfo.width, height: state.imageInfo.height }
  return null
}

/** 是否可撤销（至少应用过一步编辑） */
export function canUndo(state: ImageState): boolean {
  return state.history.length > 0
}

/** 是否可重做（撤销后未产生新编辑） */
export function canRedo(state: ImageState): boolean {
  return state.redoStack.length > 0
}

// 编辑参数相关状态
export interface EditState {
  width: string
  height: string
  keepAspect: boolean
  quality: string
}

export type EditAction =
  | { type: "setWidth"; value: string }
  | { type: "setHeight"; value: string }
  | { type: "setKeepAspect"; value: boolean }
  | { type: "setQuality"; value: string }
  | { type: "setSize"; width: string; height: string }

export const editReducer = createReducer<EditState, EditAction>({
  setWidth: (state, action) => ({ ...state, width: action.value }),
  setHeight: (state, action) => ({ ...state, height: action.value }),
  setKeepAspect: (state, action) => ({ ...state, keepAspect: action.value }),
  setQuality: (state, action) => ({ ...state, quality: action.value }),
  setSize: (_state, action) => ({ ..._state, width: action.width, height: action.height }),
})

// ─── 等比换算（保持原图比例）───

/**
 * 已知目标宽度，按基准图宽高比求对应高度。
 * 非法输入（宽 ≤ 0 或基准宽 ≤ 0）返回 null。
 */
export function aspectHeightForWidth(width: number, imageWidth: number, imageHeight: number): number | null {
  if (width <= 0 || imageWidth <= 0) return null
  return Math.round(width * imageHeight / imageWidth)
}

/**
 * 已知目标高度，按基准图宽高比求对应宽度。
 * 非法输入（高 ≤ 0 或基准高 ≤ 0）返回 null。
 */
export function aspectWidthForHeight(height: number, imageWidth: number, imageHeight: number): number | null {
  if (height <= 0 || imageHeight <= 0) return null
  return Math.round(height * imageWidth / imageHeight)
}
