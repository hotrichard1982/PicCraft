import { describe, expect, it } from "vitest"
import { dirReducer, type DirState } from "@/views/BrowseView"

describe("dirReducer", () => {
  const initialState: DirState = {
    entries: [],
    loading: false,
    error: null,
  }

  it("loadStart 应设置 loading=true 并清除错误", () => {
    const state = dirReducer(initialState, { type: "loadStart" })
    expect(state.loading).toBe(true)
    expect(state.error).toBeNull()
  })

  it("loadSuccess 应设置条目并清除 loading", () => {
    const entries = [
      { path: "D:/a.jpg", filename: "a.jpg", width: 100, height: 80, format: "Jpeg", file_size: 1024, created_at: null, modified_at: null },
    ]
    const state = dirReducer(
      { entries: [], loading: true, error: null },
      { type: "loadSuccess", entries },
    )
    expect(state.entries).toEqual(entries)
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })

  it("loadError 应设置错误信息并清除条目和 loading", () => {
    const state = dirReducer(
      { entries: [], loading: true, error: null },
      { type: "loadError", error: "权限不足" },
    )
    expect(state.entries).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.error).toBe("权限不足")
  })

  it("clear 应重置所有状态", () => {
    const state = dirReducer(
      { entries: [{ path: "x", filename: "x", width: 1, height: 1, format: "Png", file_size: 1, created_at: null, modified_at: null }], loading: true, error: "旧错误" },
      { type: "clear" },
    )
    expect(state.entries).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })
})
