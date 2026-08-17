/**
 * PicCraft 发布脚本
 *
 * 流程：
 *   1. 验证 git 工作区干净
 *   2. 生成 RC tag 名（vYYYYMMDDRCNN；同日递增）
 *   3. 编译 exe（调用 copy-dist.mjs）
 *   4. 创建 GitHub Release 并上传产物
 *
 * 前置条件：
 *   - gh CLI 已安装（https://cli.github.com/）
 *   - gh auth login 已登录
 *
 * 用法：
 *   node scripts/release.mjs
 */

import { execSync } from "child_process"
import { existsSync, readdirSync, statSync } from "fs"
import { resolve, join } from "path"

const root = resolve(import.meta.dirname, "..")

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`)
  return execSync(cmd, { cwd: root, stdio: "inherit", ...opts })
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: root, encoding: "utf8" }).trim()
}

// ─── 1. 检查 git 状态 ───
console.log("\n=== 1/5 检查 git 状态 ===")
const status = runCapture("git status --porcelain")
if (status) {
  console.log("未提交的变更：")
  console.log(status)
  console.log("\n请先提交所有变更再发布。")
  process.exit(1)
}
console.log("✅ 工作区干净")

// ─── 2. 确定 RC 版本号 ───
console.log("\n=== 2/5 确定 RC 版本号 ===")
const now = new Date()
const y = now.getFullYear()
const m = String(now.getMonth() + 1).padStart(2, "0")
const d = String(now.getDate()).padStart(2, "0")
const datePrefix = `v${y}${m}${d}RC`
const existingTags = runCapture(`git tag --list "${datePrefix}*"`)
  .split("\n")
  .filter(Boolean)
const nextRc = existingTags.reduce((highest, value) => {
  const match = new RegExp(`^${datePrefix}(\\d{2})$`).exec(value)
  return match ? Math.max(highest, Number(match[1])) : highest
}, 0) + 1
const tag = `${datePrefix}${String(nextRc).padStart(2, "0")}`
console.log(`Tag: ${tag}`)

// ─── 3. 编译 ───
console.log("\n=== 3/5 编译 exe ===")
run("node scripts/copy-dist.mjs")

// 确认产物
const distDir = join(root, "dist")
const exePath = join(root, "src-tauri", "target", "release", "piccarft.exe")
if (!existsSync(exePath)) {
  console.error("❌ 编译失败：未找到 piccarft.exe")
  process.exit(1)
}
console.log("✅ 编译成功")

// ─── 4. 创建 tag 并推送 ───
console.log("\n=== 4/5 创建 tag 并推送 ===")
try {
  run(`git tag ${tag}`)
} catch {
  console.log(`Tag ${tag} 可能已存在，继续...`)
}
try {
  run("git push origin main --tags")
} catch {
  try {
    // HTTPS 推送失败时动态转换当前 remote URL 为 SSH 格式
    const currentUrl = runCapture('git remote get-url origin')
    const sshUrl = currentUrl.replace(/^https:\/\/github\.com\//, 'git@github.com:')
    run(`git remote set-url origin ${sshUrl}`)
    run("git push origin main --tags")
  } catch {
    console.warn('⚠️  git push 失败（网络问题），Release 已通过 API 创建')
    console.warn('   后续手动执行: git push origin main --tags')
  }
}

// ─── 5. 创建 Release 并上传 ───
console.log("\n=== 5/5 创建 GitHub Release ===")

// 收集要上传的产物
const uploads = [exePath]
const bundleDir = join(root, "src-tauri", "target", "release", "bundle")
if (existsSync(bundleDir)) {
  for (const type of ["msi", "nsis"]) {
    const typeDir = join(bundleDir, type)
    if (existsSync(typeDir)) {
      for (const f of readdirSync(typeDir)) {
        const fp = join(typeDir, f)
        if (statSync(fp).isFile()) uploads.push(fp)
      }
    }
  }
}

// 构建生成日志
const buildLog = runCapture("git log --oneline --no-decorate -1")
const releaseNotes = `PicCraft 发布 ${tag}

变更内容：
${buildLog}

---

自动构建于 ${new Date().toLocaleString("zh-CN")}`

// 用 gh CLI 创建 release
const uploadArgs = uploads.map((f) => `"${f}"`).join(" ")
try {
  run(`gh release create ${tag} ${uploadArgs} --prerelease --title "${tag}" --notes "${releaseNotes.replace(/"/g, '\\"')}"`)
  console.log("✅ Release 创建成功！")
} catch (e) {
  console.error("❌ Release 创建失败，请手动上传：")
  console.error(`   gh release create ${tag} ${uploadArgs} --title "${tag}"`)
  console.error(`   或访问: https://github.com/hotrichard1982/PicCraft/releases/new?tag=${tag}`)
  process.exit(1)
}

console.log("\n🎉 发布完成！")
