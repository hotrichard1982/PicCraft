import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { SettingsView } from "@/views/SettingsView"

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}))

describe("SettingsView 关于页版本号", () => {
  it("关于页展示 v0.2.0（与 package.json/Cargo.toml/tauri.conf.json 一致），不再显示日期式版本号", () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole("button", { name: "关于" }))
    expect(screen.getByText("v0.2.0")).toBeTruthy()
    expect(screen.queryByText("v2026.06")).toBeNull()
  })
})
