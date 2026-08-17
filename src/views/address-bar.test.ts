import { describe, expect, it } from "vitest"
import { addressBarReducer, type AddressBarState } from "@/views/BrowseView"

const initial: AddressBarState = { draft: "", editing: false, error: null }

describe("addressBarReducer", () => {
  it("startEdit 进入编辑态并带出当前目录", () => {
    const s = addressBarReducer(initial, { type: "startEdit", folder: "D:/pics" })
    expect(s).toEqual({ draft: "D:/pics", editing: true, error: null })
  })

  it("setDraft 更新草稿", () => {
    const s = addressBarReducer({ draft: "", editing: true, error: null }, { type: "setDraft", value: "E:/" })
    expect(s.draft).toBe("E:/")
  })

  it("cancelEdit 退出编辑态并清错误", () => {
    const s = addressBarReducer({ draft: "x", editing: true, error: "bad" }, { type: "cancelEdit" })
    expect(s).toEqual({ draft: "", editing: false, error: null })
  })

  it("submit 返回解析后的路径并退出编辑态", () => {
    const s = addressBarReducer({ draft: "  D:/pics  ", editing: true, error: null }, { type: "submit" })
    expect(s.editing).toBe(false)
    expect(s.error).toBeNull()
  })

  it("submit 空路径不进入编辑提交流程（由调用方跳过）", () => {
    const s = addressBarReducer({ draft: "   ", editing: true, error: null }, { type: "submit" })
    expect(s.editing).toBe(false)
  })

  it("showError 保留用户输入，方便修正路径", () => {
    const s = addressBarReducer({ draft: "D:/nope", editing: true, error: null }, { type: "showError", error: "目录不存在" })
    expect(s).toEqual({ draft: "D:/nope", editing: false, error: "目录不存在" })
  })

  it("folderChanged 同步外部目录变化并清错误", () => {
    const s = addressBarReducer({ draft: "old", editing: false, error: "x" }, { type: "folderChanged", folder: "D:/new" })
    expect(s).toEqual({ draft: "D:/new", editing: false, error: null })
  })
})
