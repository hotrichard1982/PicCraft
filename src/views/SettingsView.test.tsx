import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SettingsView } from "@/views/SettingsView"

const platformMock = vi.hoisted(() => ({ value: "windows" }))

vi.mock("@/lib/platform", () => ({
  getPlatform: () => platformMock.value,
}))

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}))

describe("SettingsView 关于页版本号", () => {
  it("关于页展示 v0.3.0（与 package.json/Cargo.toml/tauri.conf.json 一致），不再显示日期式版本号", () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole("button", { name: "关于" }))
    expect(screen.getByText("v0.3.0")).toBeTruthy()
    expect(screen.queryByText("v2026.06")).toBeNull()
  })
})

describe("SettingsView 设置页平台分支（PRD-002）", () => {
  beforeEach(() => {
    platformMock.value = "windows"
  })

  it("macOS：只读展示支持格式与 Finder 教程，不渲染勾选框与保存按钮", () => {
    platformMock.value = "macos"
    render(<SettingsView />)
    // 默认激活「设置」子 Tab
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByRole("button", { name: "保存设置" })).toBeNull()
    // Finder 默认应用设置教程
    expect(screen.getByText(/显示简介/)).toBeTruthy()
    expect(screen.getByText(/全部更改/)).toBeTruthy()
  })

  it("macOS：五个支持格式全部只读列出", () => {
    platformMock.value = "macos"
    render(<SettingsView />)
    for (const ext of ["jpg", "jpeg", "png", "webp", "bmp"]) {
      expect(screen.getByText(`.${ext}`)).toBeTruthy()
    }
  })

  it("Windows：保留现有文件关联勾选 UI 与保存按钮", () => {
    render(<SettingsView />)
    expect(screen.getAllByRole("checkbox")).toHaveLength(5)
    expect(screen.getByRole("button", { name: "保存设置" })).toBeTruthy()
  })
})
