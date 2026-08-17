import { describe, expect, it } from "vitest"
import {
  imageReducer,
  editReducer,
  aspectHeightForWidth,
  aspectWidthForHeight,
  currentEditSize,
  canUndo,
  canRedo,
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
    history: [],
    redoStack: [],
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
      history: [{ tempPath: "/tmp/edited.png", width: 100, height: 100 }],
      redoStack: [],
    }
    const state = imageReducer(loaded, { type: "resetToOriginal" })
    expect(state.displayPath).toBe("D:/original.jpg")
    expect(state.tempPath).toBeNull()
    expect(state.cropRect).toBeNull()
    expect(state.history).toEqual([])
    expect(state.redoStack).toEqual([])
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

describe("currentEditSize（当前编辑图尺寸：temp 优先）", () => {
  const loaded: ImageState = {
    filePath: "D:/original.jpg",
    imageInfo: { path: "D:/original.jpg", width: 4000, height: 3000, format: "Jpeg", file_size: 1024 },
    displayPath: "D:/original.jpg",
    tempPath: null,
    cropRect: null,
    hasImage: true,
    isPng: false,
    history: [],
    redoStack: [],
  }

  it("无 temp 图时返回原图尺寸", () => {
    expect(currentEditSize(loaded)).toEqual({ width: 4000, height: 3000 })
  })

  it("有 temp 图时返回 temp 图尺寸", () => {
    const cropped = imageReducer(loaded, {
      type: "setTempPath",
      path: "/tmp/cropped.png",
      width: 1000,
      height: 500,
    })
    expect(currentEditSize(cropped)).toEqual({ width: 1000, height: 500 })
  })

  it("无图片信息时返回 null", () => {
    expect(currentEditSize({
      filePath: "",
      imageInfo: null,
      displayPath: null,
      tempPath: null,
      cropRect: null,
      hasImage: false,
      isPng: false,
      history: [],
      redoStack: [],
    })).toBeNull()
  })
})

describe("undoEdit / redoEdit（撤销与重做）", () => {
  const loaded: ImageState = {
    filePath: "D:/original.jpg",
    imageInfo: { path: "D:/original.jpg", width: 4000, height: 3000, format: "Jpeg", file_size: 1024 },
    displayPath: "D:/original.jpg",
    tempPath: null,
    cropRect: null,
    hasImage: true,
    isPng: false,
    history: [],
    redoStack: [],
  }

  const edit1 = (s: ImageState) => imageReducer(s, { type: "setTempPath", path: "/tmp/step1.png", width: 1000, height: 500 })
  const edit2 = (s: ImageState) => imageReducer(s, { type: "setTempPath", path: "/tmp/step2.png", width: 500, height: 250 })

  it("一步编辑后撤销应回到原图", () => {
    const undone = imageReducer(edit1(loaded), { type: "undoEdit" })
    expect(undone.tempPath).toBeNull()
    expect(undone.displayPath).toBe("D:/original.jpg")
    expect(undone.history).toEqual([])
    expect(canUndo(undone)).toBe(false)
  })

  it("两步编辑后撤销一次应回到上一步（非原图）", () => {
    const undone = imageReducer(edit2(edit1(loaded)), { type: "undoEdit" })
    expect(undone.tempPath).toBe("/tmp/step1.png")
    expect(undone.history).toEqual([{ tempPath: "/tmp/step1.png", width: 1000, height: 500 }])
    expect(canUndo(undone)).toBe(true)
    expect(currentEditSize(undone)).toEqual({ width: 1000, height: 500 })
  })

  it("连续撤销最终回到原图且状态稳定", () => {
    const undone2 = imageReducer(imageReducer(edit2(edit1(loaded)), { type: "undoEdit" }), { type: "undoEdit" })
    expect(undone2.tempPath).toBeNull()
    expect(undone2.displayPath).toBe("D:/original.jpg")
    const extra = imageReducer(undone2, { type: "undoEdit" })
    expect(extra).toEqual(undone2)
  })

  it("无编辑时不可撤销", () => {
    expect(canUndo(loaded)).toBe(false)
  })

  it("撤销后可重做，恢复被撤销的步骤", () => {
    const undone = imageReducer(edit1(loaded), { type: "undoEdit" })
    expect(canRedo(undone)).toBe(true)
    const redone = imageReducer(undone, { type: "redoEdit" })
    expect(redone.tempPath).toBe("/tmp/step1.png")
    expect(redone.history).toEqual([{ tempPath: "/tmp/step1.png", width: 1000, height: 500 }])
    expect(canRedo(redone)).toBe(false)
    expect(canUndo(redone)).toBe(true)
  })

  it("撤销后产生新编辑应清空重做栈", () => {
    const undone = imageReducer(edit2(edit1(loaded)), { type: "undoEdit" })
    expect(canRedo(undone)).toBe(true)
    const branched = imageReducer(undone, {
      type: "setTempPath", path: "/tmp/branch.png", width: 800, height: 400,
    })
    expect(canRedo(branched)).toBe(false)
    expect(imageReducer(branched, { type: "redoEdit" })).toEqual(branched)
  })

  it("重复记录同一临时图不新增无意义的撤销步骤", () => {
    const step1 = edit1(loaded)
    const duplicate = imageReducer(step1, {
      type: "setTempPath", path: "/tmp/step1.png", width: 1000, height: 500,
    })
    expect(duplicate.history).toHaveLength(1)
  })

  it("重做到原图分支后再撤销，回到原图而非崩溃", () => {
    // 两步：undo undo redo redo，应回到 step2
    const undone2 = imageReducer(imageReducer(edit2(edit1(loaded)), { type: "undoEdit" }), { type: "undoEdit" })
    const redone1 = imageReducer(undone2, { type: "redoEdit" })
    const redone2 = imageReducer(redone1, { type: "redoEdit" })
    expect(redone2.tempPath).toBe("/tmp/step2.png")
  })
})

describe("BUG-003 回归：等比换算应基于当前编辑图", () => {
  const loaded: ImageState = {
    filePath: "D:/original.jpg",
    imageInfo: { path: "D:/original.jpg", width: 4000, height: 3000, format: "Jpeg", file_size: 1024 },
    displayPath: "D:/original.jpg",
    tempPath: null,
    cropRect: null,
    hasImage: true,
    isPng: false,
    history: [],
    redoStack: [],
  }

  it("裁剪后改宽度，高度按裁剪后比例换算（而非原图）", () => {
    const cropped = imageReducer(loaded, {
      type: "setTempPath",
      path: "/tmp/cropped.png",
      width: 1000,
      height: 500,
    })
    const size = currentEditSize(cropped)
    expect(aspectHeightForWidth(500, size!.width, size!.height)).toBe(250)
  })
})
