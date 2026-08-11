import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { DirTree } from "@/components/DirTree"

describe("DirTree 根节点文案", () => {
  it("根节点使用平台中性名称「文件系统」（PRD-002）", () => {
    render(<DirTree currentFolder={null} onSelectDirectory={() => {}} />)
    expect(screen.getByText("文件系统")).toBeTruthy()
  })
})
