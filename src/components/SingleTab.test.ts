import { describe, expect, it } from "vitest"
import {
  imageReducer,
  editReducer,
  aspectHeightForWidth,
  aspectWidthForHeight,
  type ImageState,
  type EditState,
} from "@/lib/single-tab-state"

describe("imageReducer", () => {
  const initialState: ImageState = {
    filePath: "",
    imageInfo: null,
    displayPath: null,
    tempPath: null,
    cropRect: null,
    hasImage: false,
    isPng: false,
  }

  it("loadImage 应设置文件路径和信息", () => {
    const info = {
      path: "D:/test.jpg",
      width: 1920,
      height: 1080,
      format: "Jpeg",
      file_size: 1024,
    }
    const state = imageReducer(initialState, { type: "loadImage", path: "D:/test.jpg", info })
    expect(state.filePath).toBe("D:/test.jpg")
    expect(state.imageInfo).toBe(info)
    expect(state.displayPath).toBe("D:/test.jpg")
    expect(state.tempPath).toBeNull()
    expect(state.hasImage).toBe(true)
    expect(state.isPng).toBe(false)
  })

  it("loadImage 应检测 PNG 格式", () => {
    const info = {
      path: "D:/test.png",
      width: 800,
      height: 600,
      format: "Png",
      file_size: 512,
    }
    const state = imageReducer(initialState, { type: "loadImage", path: "D:/test.png", info })
    expect(state.isPng).toBe(true)
  })

  it("setTempPath 应更新显示路径和临时路径", () => {
    const state = imageReducer(initialState, {
      type: "setTempPath",
      path: "/tmp/edited.png",
      width: 400,
      height: 300,
    })
    expect(state.displayPath).toBe("/tmp/edited.png")
    expect(state.tempPath).toBe("/tmp/edited.png")
    expect(state.cropRect).toBeNull()
  })

  it("setCropRect 应设置裁剪区域", () => {
    const rect = { x: 10, y: 20, width: 100, height: 80 }
    const state = imageReducer(initialState, { type: "setCropRect", rect })
    expect(state.cropRect).toEqual(rect)
  })

  it("setCropRect 传 null 应清除裁剪区域", () => {
    const state1 = imageReducer(initialState, { type: "setCropRect", rect: { x: 0, y: 0, width: 50, height: 50 } })
    const state2 = imageReducer(state1, { type: "setCropRect", rect: null })
    expect(state2.cropRect).toBeNull()
  })

  it("resetToOriginal 应恢复到原始图片", () => {
    const loaded: ImageState = {
      filePath: "D:/original.jpg",
      imageInfo: { path: "D:/original.jpg", width: 1920, height: 1080, format: "Jpeg", file_size: 1024 },
      displayPath: "/tmp/edited.png",
      tempPath: "/tmp/edited.png",
      cropRect: { x: 10, y: 10, width: 100, height: 100 },
      hasImage: true,
      isPng: false,
    }
    const state = imageReducer(loaded, { type: "resetToOriginal" })
    expect(state.displayPath).toBe("D:/original.jpg")
    expect(state.tempPath).toBeNull()
    expect(state.cropRect).toBeNull()
  })

  it("resetToOriginal 无 filePath 时应返回原状态", () => {
    const state = imageReducer(initialState, { type: "resetToOriginal" })
    expect(state).toEqual(initialState)
  })
})

describe("editReducer", () => {
  const initialState: EditState = {
    width: "800",
    height: "600",
    keepAspect: true,
    quality: "85",
  }

  it("setWidth 应设置宽度", () => {
    const state = editReducer(initialState, { type: "setWidth", value: "1024" })
    expect(state.width).toBe("1024")
  })

  it("setHeight 应设置高度", () => {
    const state = editReducer(initialState, { type: "setHeight", value: "768" })
    expect(state.height).toBe("768")
  })

  it("setKeepAspect 应设置比例锁定", () => {
    const state = editReducer(initialState, { type: "setKeepAspect", value: false })
    expect(state.keepAspect).toBe(false)
  })

  it("setQuality 应设置质量", () => {
    const state = editReducer(initialState, { type: "setQuality", value: "60" })
    expect(state.quality).toBe("60")
  })

  it("setSize 应同时设置宽度和高度", () => {
    const state = editReducer(initialState, { type: "setSize", width: "1920", height: "1080" })
    expect(state.width).toBe("1920")
    expect(state.height).toBe("1080")
  })
})

describe("aspectHeightForWidth（等比换算：宽→高）", () => {
  it("按原图比例计算高度", () => {
    expect(aspectHeightForWidth(800, 1920, 1080)).toBe(450)
  })

  it("结果四舍五入", () => {
    expect(aspectHeightForWidth(1000, 3000, 1999)).toBe(666)
  })

  it("宽度为 0 或负数时返回 null", () => {
    expect(aspectHeightForWidth(0, 1920, 1080)).toBeNull()
    expect(aspectHeightForWidth(-10, 1920, 1080)).toBeNull()
  })

  it("原图宽度为 0 时返回 null", () => {
    expect(aspectHeightForWidth(800, 0, 1080)).toBeNull()
  })
})

describe("aspectWidthForHeight（等比换算：高→宽）", () => {
  it("按原图比例计算宽度", () => {
    expect(aspectWidthForHeight(1080, 1920, 1080)).toBe(1920)
  })

  it("结果四舍五入", () => {
    expect(aspectWidthForHeight(667, 3000, 1999)).toBe(1001)
  })

  it("高度为 0 或负数时返回 null", () => {
    expect(aspectWidthForHeight(0, 1920, 1080)).toBeNull()
    expect(aspectWidthForHeight(-10, 1920, 1080)).toBeNull()
  })

  it("原图高度为 0 时返回 null", () => {
    expect(aspectWidthForHeight(1080, 1920, 0)).toBeNull()
  })
})
