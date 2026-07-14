import { describe, expect, it } from "vitest"
import { asyncReducer, type AsyncState } from "@/lib/state-utils"
import type { DirEntry } from "@/views/BrowseView"

describe("asyncReducer (BrowseView dir state)", () => {
  const initialState: AsyncState<DirEntry[]> = {
    data: [],
    loading: false,
    error: null,
  }

  it("loadStart 应设置 loading=true 并清除错误", () => {
    const state = asyncReducer(initialState, { type: "loadStart" })
    expect(state.loading).toBe(true)
    expect(state.error).toBeNull()
  })

  it("loadSuccess 应设置条目并清除 loading", () => {
    const entries: DirEntry[] = [
      { path: "D:/a.jpg", filename: "a.jpg", width: 100, height: 80, format: "Jpeg", file_size: 1024, created_at: null, modified_at: null },
    ]
    const state = asyncReducer(
      { data: [], loading: true, error: null },
      { type: "loadSuccess", data: entries },
    )
    expect(state.data).toEqual(entries)
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })

  it("loadError 应设置错误信息并保持现有 data，清除 loading", () => {
    const state = asyncReducer(
      { data: [], loading: true, error: null },
      { type: "loadError", error: "权限不足" },
    )
    expect(state.data).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.error).toBe("权限不足")
  })

  it("clear 应重置所有状态", () => {
    const state = asyncReducer(
      { data: [{ path: "x", filename: "x", width: 1, height: 1, format: "Png", file_size: 1, created_at: null, modified_at: null }], loading: true, error: "旧错误" },
      { type: "clear", initialData: [] },
    )
    expect(state.data).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })
})
