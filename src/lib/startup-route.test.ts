import { beforeEach, describe, expect, it } from "vitest"
import { useAppStore } from "@/store"
import {
  applyRoutePlan,
  finderOpenedToRoute,
  folderOfFile,
  resolveRoute,
} from "@/lib/startup-route"

describe("folderOfFile（提取文件所在目录）", () => {
  it("Windows 反斜杠路径", () => {
    expect(folderOfFile("D:\\photos\\a.jpg")).toBe("D:\\photos")
  })

  it("Windows 正斜杠路径", () => {
    expect(folderOfFile("D:/photos/a.jpg")).toBe("D:/photos")
  })

  it("macOS 路径", () => {
    expect(folderOfFile("/Users/alice/Pictures/a.jpg")).toBe("/Users/alice/Pictures")
  })

  it("无目录分隔符的路径返回 null", () => {
    expect(folderOfFile("a.jpg")).toBeNull()
  })

  it("根目录下文件（idx 0）返回 null", () => {
    expect(folderOfFile("/a.jpg")).toBeNull()
  })
})

describe("finderOpenedToRoute（Finder 打开事件 → 路由参数）", () => {
  it("单文件 → browse+file（定位该图）", () => {
    expect(finderOpenedToRoute(["/Users/alice/Pictures/a.jpg"])).toEqual({
      mode: "browse",
      file: "/Users/alice/Pictures/a.jpg",
      folder: null,
    })
  })

  it("多文件 → 只取第一个路径", () => {
    const paths = ["/Users/alice/Pictures/a.jpg", "/Users/alice/Pictures/b.png"]
    expect(finderOpenedToRoute(paths).file).toBe(paths[0])
  })

  it("空数组 → cold（无可打开内容）", () => {
    expect(finderOpenedToRoute([])).toEqual({ mode: "cold", file: null, folder: null })
  })
})

describe("resolveRoute（路由参数 → 导航计划）", () => {
  it("edit+file → single 视图 + editingFile", () => {
    const plan = resolveRoute({ mode: "edit", file: "D:/a.jpg", folder: null }, null)
    expect(plan).toEqual({ view: "single", folder: null, targetFile: null, editingFile: "D:/a.jpg" })
  })

  it("browse+folder → browse 视图 + folder（不设定位目标）", () => {
    const plan = resolveRoute({ mode: "browse", file: null, folder: "D:/Photos" }, null)
    expect(plan).toEqual({ view: "browse", folder: "D:/Photos", targetFile: null, editingFile: null })
  })

  it("browse+file → 所在目录浏览 + 目标文件全屏定位", () => {
    const plan = resolveRoute({ mode: "browse", file: "D:/Photos/a.jpg", folder: null }, null)
    expect(plan).toEqual({ view: "browse", folder: "D:/Photos", targetFile: "D:/Photos/a.jpg", editingFile: null })
  })

  it("browse+file 但文件无目录（如相对路径）→ 回退上次目录", () => {
    const plan = resolveRoute({ mode: "browse", file: "a.jpg", folder: null }, "D:/Last")
    expect(plan).toEqual({ view: "browse", folder: "D:/Last", targetFile: null, editingFile: null })
  })

  it("cold 有 lastFolder → browse + lastFolder", () => {
    const plan = resolveRoute({ mode: "cold", file: null, folder: null }, "D:/Last")
    expect(plan).toEqual({ view: "browse", folder: "D:/Last", targetFile: null, editingFile: null })
  })

  it("cold 无 lastFolder → browse + null（不切目录）", () => {
    const plan = resolveRoute({ mode: "cold", file: null, folder: null }, null)
    expect(plan).toEqual({ view: "browse", folder: null, targetFile: null, editingFile: null })
  })
})

describe("applyRoutePlan（导航计划应用到 store）", () => {
  beforeEach(() => {
    useAppStore.setState({
      currentView: "browse",
      currentFolder: null,
      selected: new Set(),
      queue: [],
      editingFile: null,
      browseTargetFile: null,
      lastFolder: null,
      settings: { fileAssoc: ["jpg", "jpeg", "png", "webp", "bmp"] },
    })
  })

  it("browse+folder 计划应切换视图并设置目录，不设定位目标", () => {
    applyRoutePlan({ view: "browse", folder: "D:/Photos", targetFile: null, editingFile: null })
    const s = useAppStore.getState()
    expect(s.currentView).toBe("browse")
    expect(s.currentFolder).toBe("D:/Photos")
    expect(s.browseTargetFile).toBeNull()
  })

  it("browse+targetFile 计划应设置全屏定位目标", () => {
    applyRoutePlan({ view: "browse", folder: "D:/Photos", targetFile: "D:/Photos/a.jpg", editingFile: null })
    expect(useAppStore.getState().browseTargetFile).toBe("D:/Photos/a.jpg")
  })

  it("edit 计划应切到 single 并设置编辑文件", () => {
    applyRoutePlan({ view: "single", folder: null, targetFile: null, editingFile: "D:/a.jpg" })
    const s = useAppStore.getState()
    expect(s.currentView).toBe("single")
    expect(s.editingFile).toBe("D:/a.jpg")
  })

  it("folder 为 null 的计划不应改动当前目录", () => {
    useAppStore.getState().setCurrentFolder("D:/Keep")
    applyRoutePlan({ view: "browse", folder: null, targetFile: null, editingFile: null })
    expect(useAppStore.getState().currentFolder).toBe("D:/Keep")
  })
})
