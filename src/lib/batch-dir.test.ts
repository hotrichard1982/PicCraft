import { describe, expect, it } from "vitest"
import { dirNameOf, isSameDir, needsOverwriteConfirm } from "@/lib/batch-dir"

describe("dirNameOf", () => {
  it("正斜杠路径返回所在目录", () => {
    expect(dirNameOf("D:/photos/a.jpg")).toBe("D:/photos")
  })

  it("反斜杠路径统一为 / 后返回所在目录", () => {
    expect(dirNameOf("D:\\photos\\a.jpg")).toBe("D:/photos")
  })

  it("根目录下的文件返回盘符根", () => {
    expect(dirNameOf("D:/a.jpg")).toBe("D:")
  })

  it("无分隔符路径返回自身", () => {
    expect(dirNameOf("a.jpg")).toBe("a.jpg")
  })
})

describe("isSameDir（Windows 路径语义）", () => {
  it("相同目录返回 true", () => {
    expect(isSameDir("D:/photos", "D:/photos")).toBe(true)
  })

  it("正反斜杠混用视为相同", () => {
    expect(isSameDir("D:/photos", "D:\\photos")).toBe(true)
  })

  it("大小写不敏感", () => {
    expect(isSameDir("D:/Photos", "d:/photos")).toBe(true)
  })

  it("尾分隔符差异忽略", () => {
    expect(isSameDir("D:/photos/", "D:/photos")).toBe(true)
    expect(isSameDir("D:/photos", "D:/photos/\\")).toBe(true)
  })

  it("不同目录返回 false", () => {
    expect(isSameDir("D:/photos", "D:/output")).toBe(false)
  })

  it("前缀相似的目录不误判为相同", () => {
    expect(isSameDir("D:/photo", "D:/photos")).toBe(false)
  })
})

describe("needsOverwriteConfirm", () => {
  it("任一队列图片所在目录等于输出目录时返回 true", () => {
    expect(
      needsOverwriteConfirm(["D:/photos/a.jpg", "D:/other/b.jpg"], "D:\\Photos\\"),
    ).toBe(true)
  })

  it("全部图片所在目录不同于输出目录时返回 false", () => {
    expect(
      needsOverwriteConfirm(["D:/photos/a.jpg", "D:/other/b.jpg"], "D:/output"),
    ).toBe(false)
  })

  it("空队列返回 false", () => {
    expect(needsOverwriteConfirm([], "D:/photos")).toBe(false)
  })

  it("空输出目录返回 false", () => {
    expect(needsOverwriteConfirm(["D:/photos/a.jpg"], "")).toBe(false)
  })
})
