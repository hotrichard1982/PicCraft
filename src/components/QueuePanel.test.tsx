import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { useAppStore } from "@/store"
import { QueuePanel } from "@/components/QueuePanel"

vi.mock("@/lib/platform", () => ({
  getPlatform: () => "macos",
  revealItemLabel: (platform: string) => (platform === "macos" ? "在 Finder 中显示" : "在资源管理器中显示"),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((p: string) => p),
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(),
}))

describe("QueuePanel 右键菜单文案（macOS）", () => {
  beforeEach(() => {
    useAppStore.setState({
      currentView: "batch",
      currentFolder: null,
      selected: new Set(),
      queue: [],
      editingFile: null,
      browseTargetFile: null,
      lastFolder: null,
      settings: { fileAssoc: ["jpg", "jpeg", "png", "webp", "bmp"] },
    })
  })

  it("macOS 平台右键菜单显示「在 Finder 中显示」", () => {
    useAppStore.getState().enqueue(["D:/photos/a.jpg"])
    render(<QueuePanel outputDir="" />)
    fireEvent.contextMenu(screen.getByText("a.jpg"))
    expect(screen.getByText("在 Finder 中显示")).toBeTruthy()
  })
})
