import { beforeEach, describe, expect, it } from "vitest"
import { useAppStore } from "@/store"

describe("useAppStore", () => {
  beforeEach(() => {
    // 每个测试前重置 store 到初始状态
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

  describe("enqueue", () => {
    it("应该添加新路径到队列", () => {
      useAppStore.getState().enqueue(["D:/photos/a.jpg", "D:/photos/b.png"])
      const queue = useAppStore.getState().queue
      expect(queue).toHaveLength(2)
      expect(queue[0].path).toBe("D:/photos/a.jpg")
      expect(queue[0].filename).toBe("a.jpg")
      expect(queue[0].status).toBe("pending")
    })

    it("应该跳过已存在的路径", () => {
      useAppStore.getState().enqueue(["D:/photos/a.jpg"])
      useAppStore.getState().enqueue(["D:/photos/a.jpg", "D:/photos/b.png"])
      const queue = useAppStore.getState().queue
      expect(queue).toHaveLength(2)
    })

    it("应该从路径中提取文件名", () => {
      useAppStore.getState().enqueue(["C:\\Users\\test\\图片\\photo.jpg"])
      const queue = useAppStore.getState().queue
      expect(queue[0].filename).toBe("photo.jpg")
    })
  })

  describe("dequeue", () => {
    it("应该移除指定路径", () => {
      useAppStore.getState().enqueue(["D:/a.jpg", "D:/b.png", "D:/c.webp"])
      useAppStore.getState().dequeue("D:/b.png")
      const queue = useAppStore.getState().queue
      expect(queue).toHaveLength(2)
      expect(queue.find((q) => q.path === "D:/b.png")).toBeUndefined()
    })

    it("路径不存在时不应报错", () => {
      useAppStore.getState().enqueue(["D:/a.jpg"])
      useAppStore.getState().dequeue("nonexistent")
      expect(useAppStore.getState().queue).toHaveLength(1)
    })
  })

  describe("toggleSelected", () => {
    it("非追加模式下应单选", () => {
      useAppStore.getState().toggleSelected("a.jpg", false)
      expect(useAppStore.getState().selected).toEqual(new Set(["a.jpg"]))
    })

    it("追加模式下应保留已有选择", () => {
      useAppStore.getState().toggleSelected("a.jpg", false)
      useAppStore.getState().toggleSelected("b.jpg", true)
      expect(useAppStore.getState().selected).toEqual(new Set(["a.jpg", "b.jpg"]))
    })

    it("追加模式下再次点击应取消选择", () => {
      useAppStore.getState().toggleSelected("a.jpg", false)
      useAppStore.getState().toggleSelected("a.jpg", true)
      expect(useAppStore.getState().selected).toEqual(new Set())
    })
  })

  describe("clearSelected", () => {
    it("应该清空选中集合", () => {
      useAppStore.getState().toggleSelected("a.jpg", false)
      useAppStore.getState().toggleSelected("b.jpg", true)
      useAppStore.getState().clearSelected()
      expect(useAppStore.getState().selected.size).toBe(0)
    })
  })

  describe("setCurrentFolder", () => {
    it("应该设置当前目录和 lastFolder", () => {
      useAppStore.getState().setCurrentFolder("D:/Photos")
      expect(useAppStore.getState().currentFolder).toBe("D:/Photos")
      expect(useAppStore.getState().lastFolder).toBe("D:/Photos")
    })

    it("切换目录时应清空 selected", () => {
      useAppStore.getState().toggleSelected("a.jpg", false)
      useAppStore.getState().setCurrentFolder("D:/NewFolder")
      expect(useAppStore.getState().selected.size).toBe(0)
    })
  })

  describe("clearQueue", () => {
    it("应该清空队列", () => {
      useAppStore.getState().enqueue(["D:/a.jpg", "D:/b.png"])
      useAppStore.getState().clearQueue()
      expect(useAppStore.getState().queue).toHaveLength(0)
    })
  })

  describe("updateQueueItem", () => {
    it("应该更新指定队列项的状态", () => {
      useAppStore.getState().enqueue(["D:/a.jpg"])
      useAppStore.getState().updateQueueItem("D:/a.jpg", { status: "done" })
      expect(useAppStore.getState().queue[0].status).toBe("done")
    })

    it("应该更新指定队列项的错误信息", () => {
      useAppStore.getState().enqueue(["D:/a.jpg"])
      useAppStore.getState().updateQueueItem("D:/a.jpg", { status: "failed", error: "编码失败" })
      expect(useAppStore.getState().queue[0].status).toBe("failed")
      expect(useAppStore.getState().queue[0].error).toBe("编码失败")
    })
  })
})
