import { describe, expect, it } from "vitest"
import {
  imageLoadReducer,
  viewReducer,
  type ImageLoadState,
  type ViewState,
} from "@/components/FullscreenViewer"

describe("imageLoadReducer (FullscreenViewer)", () => {
  const initialState: ImageLoadState = {
    img: null,
    imgSize: { w: 0, h: 0 },
    loading: false,
    loadError: null,
  }

  it("loadStart 清除 img 与错误并进入 loading", () => {
    const state = imageLoadReducer(
      { img: {} as HTMLImageElement, imgSize: { w: 10, h: 10 }, loading: false, loadError: "旧错误" },
      { type: "loadStart" },
    )
    expect(state.img).toBeNull()
    expect(state.loading).toBe(true)
    expect(state.loadError).toBeNull()
  })

  it("loadSuccess 设置图片与尺寸并退出 loading", () => {
    const img = {} as HTMLImageElement
    const state = imageLoadReducer(initialState, { type: "loadSuccess", img, w: 1920, h: 1080 })
    expect(state.img).toBe(img)
    expect(state.imgSize).toEqual({ w: 1920, h: 1080 })
    expect(state.loading).toBe(false)
    expect(state.loadError).toBeNull()
  })

  it("loadError 设置错误并退出 loading", () => {
    const state = imageLoadReducer(
      { img: {} as HTMLImageElement, imgSize: { w: 1, h: 1 }, loading: true, loadError: null },
      { type: "loadError", error: "图片加载失败" },
    )
    expect(state.img).toBeNull()
    expect(state.loading).toBe(false)
    expect(state.loadError).toBe("图片加载失败")
  })
})

describe("viewReducer (FullscreenViewer)", () => {
  const initialState: ViewState = {
    stageSize: { w: 800, h: 600 },
    scale: 1,
    pos: { x: 0, y: 0 },
    rotation: 0,
  }

  it("resize 更新画布尺寸", () => {
    const state = viewReducer(initialState, { type: "resize", w: 1024, h: 768 })
    expect(state.stageSize).toEqual({ w: 1024, h: 768 })
    expect(state.scale).toBe(1)
  })

  it("setScale 更新缩放", () => {
    const state = viewReducer(initialState, { type: "setScale", scale: 2.5 })
    expect(state.scale).toBe(2.5)
  })

  it("setPos 更新位置", () => {
    const state = viewReducer(initialState, { type: "setPos", x: 100, y: -50 })
    expect(state.pos).toEqual({ x: 100, y: -50 })
  })

  it("setScaleAndPos 更新缩放与位置", () => {
    const state = viewReducer(initialState, { type: "setScaleAndPos", scale: 0.5, x: 10, y: 20 })
    expect(state.scale).toBe(0.5)
    expect(state.pos).toEqual({ x: 10, y: 20 })
  })

  it("setScaleAndPos 未传 rotation 时保留原旋转", () => {
    const state = viewReducer(
      { ...initialState, rotation: 180 },
      { type: "setScaleAndPos", scale: 1, x: 0, y: 0 },
    )
    expect(state.rotation).toBe(180)
  })

  it("setScaleAndPos 显式传 rotation 时更新旋转", () => {
    const state = viewReducer(
      { ...initialState, rotation: 180 },
      { type: "setScaleAndPos", scale: 1, x: 0, y: 0, rotation: 90 },
    )
    expect(state.rotation).toBe(90)
  })

  it("rotate 顺时针累加 90 度并在 360 后回绕", () => {
    let state = viewReducer(initialState, { type: "rotate" })
    expect(state.rotation).toBe(90)
    state = viewReducer(state, { type: "rotate" })
    expect(state.rotation).toBe(180)
    state = viewReducer(state, { type: "rotate" })
    expect(state.rotation).toBe(270)
    state = viewReducer(state, { type: "rotate" })
    expect(state.rotation).toBe(0)
  })
})
