import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { BatchTab, batchRunReducer, type BatchRunState } from "@/components/BatchTab"
import { useAppStore } from "@/store"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { confirm, open } from "@tauri-apps/plugin-dialog"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((p: string) => p),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  confirm: vi.fn(),
  ask: vi.fn(),
  save: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    save: vi.fn(),
  }),
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}))

describe("batchRunReducer", () => {
  const initialState: BatchRunState = {
    processing: false,
    progress: { current: 0, total: 0, filename: "", path: "", error: null },
    errors: [],
    listenFailed: false,
  }

  it("start 进入 processing 并清空 errors/listenFailed/progress", () => {
    const state = batchRunReducer(
      { ...initialState, errors: ["a: x"], listenFailed: true },
      { type: "start" },
    )
    expect(state.processing).toBe(true)
    expect(state.errors).toEqual([])
    expect(state.listenFailed).toBe(false)
    expect(state.progress).toEqual({ current: 0, total: 0, filename: "", path: "", error: null })
  })

  it("setProgress 更新进度", () => {
    const state = batchRunReducer(initialState, {
      type: "setProgress",
      progress: { current: 1, total: 3, filename: "b.jpg", path: "D:/a/b.jpg", error: null },
    })
    expect(state.progress.current).toBe(1)
    expect(state.progress.total).toBe(3)
    expect(state.errors).toEqual([])
  })

  it("setProgress 带 error 时追加错误列表", () => {
    const state = batchRunReducer(initialState, {
      type: "setProgress",
      progress: { current: 1, total: 3, filename: "b.jpg", path: "D:/a/b.jpg", error: "失败原因" },
      error: "失败原因",
    })
    expect(state.errors).toEqual(["b.jpg: 失败原因"])
  })

  it("listenFailed 标记监听失败", () => {
    expect(batchRunReducer(initialState, { type: "listenFailed" }).listenFailed).toBe(true)
  })

  it("finish 退出 processing", () => {
    expect(batchRunReducer({ ...initialState, processing: true }, { type: "finish" }).processing).toBe(false)
  })
})

describe("BatchTab 输出目录等于输入目录的二次确认", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listen).mockResolvedValue(() => {})
    vi.mocked(invoke).mockResolvedValue("批量处理完成")
    useAppStore.setState({
      queue: [
        { path: "D:/photos/a.jpg", filename: "a.jpg", status: "pending" },
        { path: "D:/photos/b.jpg", filename: "b.jpg", status: "pending" },
      ],
    })
  })

  async function renderWithOutputDir(dir: string) {
    vi.mocked(open).mockResolvedValue(dir)
    render(<BatchTab />)
    fireEvent.click(screen.getByRole("button", { name: "选择输出目录" }))
    await waitFor(() => {
      expect((screen.getByPlaceholderText("选择输出文件夹") as HTMLInputElement).value).toBe(dir)
    })
  }

  it("同目录时点开始处理弹出不可恢复警告，且不调用 invoke", async () => {
    await renderWithOutputDir("D:/photos")
    fireEvent.click(screen.getByRole("button", { name: /开始处理/ }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("原图将被覆盖，此操作不可恢复"),
      expect.objectContaining({ kind: "warning" }),
    )
    expect(invoke).not.toHaveBeenCalled()
    expect(useAppStore.getState().queue.every((q) => q.status === "pending")).toBe(true)
  })

  it("警告中确认后调用 batch_process_queue 并传入队列与参数", async () => {
    vi.mocked(confirm).mockResolvedValue(true)
    await renderWithOutputDir("D:/photos")
    fireEvent.click(screen.getByRole("button", { name: /开始处理/ }))
    await waitFor(() => expect(invoke).toHaveBeenCalled())
    expect(invoke).toHaveBeenCalledWith("batch_process_queue", {
      paths: ["D:/photos/a.jpg", "D:/photos/b.jpg"],
      outputDir: "D:/photos",
      targetWidth: 1000,
      quality: 60,
    })
  })

  it("警告中取消后不调用 invoke，队列状态不进入 processing", async () => {
    vi.mocked(confirm).mockResolvedValue(false)
    await renderWithOutputDir("D:/photos")
    fireEvent.click(screen.getByRole("button", { name: /开始处理/ }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(invoke).not.toHaveBeenCalled()
    expect(useAppStore.getState().queue.every((q) => q.status === "pending")).toBe(true)
    expect(screen.getByRole("button", { name: /开始处理（2 张）/ })).toBeTruthy()
  })

  it("输出目录不同于输入目录时无确认直接处理（回归）", async () => {
    await renderWithOutputDir("D:/output")
    fireEvent.click(screen.getByRole("button", { name: /开始处理/ }))
    await waitFor(() => expect(invoke).toHaveBeenCalled())
    expect(confirm).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledWith("batch_process_queue", expect.objectContaining({ outputDir: "D:/output" }))
  })
})
