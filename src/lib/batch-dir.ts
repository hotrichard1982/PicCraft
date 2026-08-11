/**
 * 批量处理"输出目录 == 输入目录"判定（ADR-0004）。
 *
 * 队列项路径与输出目录均来自真实文件系统（Tauri dialog / read_dir），
 * 此处按 Windows 路径语义做稳健字符串比较：统一分隔符、忽略大小写与尾分隔符。
 */

/** 规范化目录路径：反斜杠统一为 /，去尾分隔符，转小写（Windows 语义） */
export function normalizeDirPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
}

/** 提取文件所在目录（正反斜杠统一为 /） */
export function dirNameOf(path: string): string {
  const norm = path.replace(/\\/g, "/")
  const idx = norm.lastIndexOf("/")
  return idx === -1 ? norm : norm.slice(0, idx)
}

/** Windows 路径语义下两个目录是否相同 */
export function isSameDir(a: string, b: string): boolean {
  return normalizeDirPath(a) === normalizeDirPath(b)
}

/**
 * 输出目录是否等于任一待处理图片所在目录（是则开始处理前需要覆盖二次确认）。
 * 队列为空或输出目录为空时返回 false。
 */
export function needsOverwriteConfirm(queuePaths: string[], outputDir: string): boolean {
  if (queuePaths.length === 0 || !outputDir) return false
  return queuePaths.some((p) => isSameDir(dirNameOf(p), outputDir))
}
