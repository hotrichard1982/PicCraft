import { describe, expect, it } from "vitest"
import {
  detectPlatform,
  matchSaveShortcut,
  revealItemLabel,
  saveShortcutHint,
} from "@/lib/platform"

describe("detectPlatform（UA 平台检测）", () => {
  it("macOS WebView UA 识别为 macos", () => {
    expect(
      detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"),
    ).toBe("macos")
  })

  it("Windows WebView2 UA 识别为 windows", () => {
    expect(
      detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0"),
    ).toBe("windows")
    expect(detectPlatform("Mozilla/5.0 (win32) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/29.1.1")).toBe("windows")
  })

  it("未知平台返回 other", () => {
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("other")
    expect(detectPlatform("")).toBe("other")
  })
})

describe("revealItemLabel（资源管理器/Finder 文案平台化）", () => {
  it("macOS 显示「在 Finder 中显示」", () => {
    expect(revealItemLabel("macos")).toBe("在 Finder 中显示")
  })

  it("Windows/其它平台保持「在资源管理器中显示」", () => {
    expect(revealItemLabel("windows")).toBe("在资源管理器中显示")
    expect(revealItemLabel("other")).toBe("在资源管理器中显示")
  })
})

describe("matchSaveShortcut（保存快捷键平台化）", () => {
  const base = { ctrlKey: false, metaKey: false, shiftKey: false, key: "" }

  it("Windows：Ctrl+S 覆盖保存，Ctrl+Shift+S 另存为（原行为不变）", () => {
    expect(matchSaveShortcut({ ...base, ctrlKey: true, key: "s" }, "windows")).toBe("overwrite")
    expect(matchSaveShortcut({ ...base, ctrlKey: true, shiftKey: true, key: "S" }, "windows")).toBe("saveAs")
  })

  it("Windows：无修饰键 / 仅 Shift 不触发", () => {
    expect(matchSaveShortcut(base, "windows")).toBeNull()
    expect(matchSaveShortcut({ ...base, shiftKey: true, key: "S" }, "windows")).toBeNull()
  })

  it("macOS：Cmd+S 覆盖保存，Cmd+Shift+S 另存为", () => {
    expect(matchSaveShortcut({ ...base, metaKey: true, key: "s" }, "macos")).toBe("overwrite")
    expect(matchSaveShortcut({ ...base, metaKey: true, shiftKey: true, key: "S" }, "macos")).toBe("saveAs")
  })

  it("macOS：无 metaKey 不触发（含仅 Ctrl）", () => {
    expect(matchSaveShortcut(base, "macos")).toBeNull()
    expect(matchSaveShortcut({ ...base, ctrlKey: true, key: "s" }, "macos")).toBeNull()
  })
})

describe("saveShortcutHint（快捷键提示文案）", () => {
  it("macOS 显示 Cmd 修饰键", () => {
    expect(saveShortcutHint("macos")).toContain("Cmd+S")
    expect(saveShortcutHint("macos")).toContain("Cmd+Shift+S")
  })

  it("Windows 显示 Ctrl 修饰键", () => {
    expect(saveShortcutHint("windows")).toContain("Ctrl+S")
    expect(saveShortcutHint("windows")).toContain("Ctrl+Shift+S")
  })
})
