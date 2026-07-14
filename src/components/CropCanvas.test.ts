import { describe, expect, it } from "vitest"
import { calculateOverlayRects, type CropRect } from "@/components/CropCanvas"

const crop: CropRect = { x: 50, y: 80, width: 200, height: 160 }
const stageSize = { width: 500, height: 400 }

describe("calculateOverlayRects", () => {
  it("maps the initial crop hole into the four stage overlays", () => {
    expect(calculateOverlayRects(stageSize, crop)).toEqual([
      { x: 0, y: 0, width: 500, height: 80 },
      { x: 0, y: 240, width: 500, height: 160 },
      { x: 0, y: 80, width: 50, height: 160 },
      { x: 250, y: 80, width: 250, height: 160 },
    ])
  })

  it("moves the overlay hole with the crop rectangle", () => {
    const movedCrop = { ...crop, x: 110, y: 140 }

    expect(calculateOverlayRects(stageSize, movedCrop)).toEqual([
      { x: 0, y: 0, width: 500, height: 140 },
      { x: 0, y: 300, width: 500, height: 100 },
      { x: 0, y: 140, width: 110, height: 160 },
      { x: 310, y: 140, width: 190, height: 160 },
    ])
  })

  it("resizes the overlay hole with the crop rectangle", () => {
    const resizedCrop = { ...crop, width: 280, height: 220 }

    expect(calculateOverlayRects(stageSize, resizedCrop)).toEqual([
      { x: 0, y: 0, width: 500, height: 80 },
      { x: 0, y: 300, width: 500, height: 100 },
      { x: 0, y: 80, width: 50, height: 220 },
      { x: 330, y: 80, width: 170, height: 220 },
    ])
  })

  it("recomputes the overlays when the stage size changes", () => {
    const resizedStage = { width: 620, height: 520 }

    expect(calculateOverlayRects(resizedStage, crop)).toEqual([
      { x: 0, y: 0, width: 620, height: 80 },
      { x: 0, y: 240, width: 620, height: 280 },
      { x: 0, y: 80, width: 50, height: 160 },
      { x: 250, y: 80, width: 370, height: 160 },
    ])
  })
})
