import { createReducer } from "@/lib/state-utils"
import type { CropRect } from "@/components/CropCanvas"

export interface ImageInfo {
  path: string
  width: number
  height: number
  format: string
  file_size: number
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
}

export type ImageAction =
  | { type: "loadImage"; path: string; info: ImageInfo }
  | { type: "setDisplayPath"; path: string }
  | { type: "setTempPath"; path: string; width: number; height: number }
  | { type: "setCropRect"; rect: CropRect | null }
  | { type: "resetToOriginal" }

export const imageReducer = createReducer<ImageState, ImageAction>({
  loadImage: (_state, action) => ({
    filePath: action.path,
    imageInfo: action.info,
    displayPath: action.path,
    tempPath: null,
    cropRect: null,
    hasImage: true,
    isPng: action.info.format.toLowerCase().includes("png"),
  }),
  setDisplayPath: (state, action) => ({ ...state, displayPath: action.path }),
  setTempPath: (state, action) => ({ ...state, displayPath: action.path, tempPath: action.path, cropRect: null }),
  setCropRect: (state, action) => ({ ...state, cropRect: action.rect }),
  resetToOriginal: (state) =>
    state.filePath
      ? { ...state, displayPath: state.filePath, tempPath: null, cropRect: null }
      : state,
})

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
 * 已知目标宽度，按原图宽高比求对应高度。
 * 非法输入（宽 ≤ 0 或原图宽 ≤ 0）返回 null。
 */
export function aspectHeightForWidth(width: number, imageWidth: number, imageHeight: number): number | null {
  if (width <= 0 || imageWidth <= 0) return null
  return Math.round(width * imageHeight / imageWidth)
}

/**
 * 已知目标高度，按原图宽高比求对应宽度。
 * 非法输入（高 ≤ 0 或原图高 ≤ 0）返回 null。
 */
export function aspectWidthForHeight(height: number, imageWidth: number, imageHeight: number): number | null {
  if (height <= 0 || imageHeight <= 0) return null
  return Math.round(height * imageWidth / imageHeight)
}
