/**
 * PicCraft 发布脚本
 *
 * 流程：
 *   1. 验证 git 工作区干净
 *   2. 生成 tag 名（vYYYYMMDD）
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

// ─── 2. 确定版本号 ───
console.log("\n=== 2/5 确定版本号 ===")
const now = new Date()
const y = now.getFullYear()
const m = String(now.getMonth() + 1).padStart(2, "0")
const d = String(now.getDate()).padStart(2, "0")
const tag = `v${y}${m}${d}`

// 检查 tag 是否已存在
const existingTags = runCapture("git tag --list").split("\n")
if (existingTags.includes(tag)) {
  console.log(`Tag ${tag} 已存在，使用 --force 覆盖？`)
  console.log("使用现有 tag，跳过创建。")
} else {
  console.log(`Tag: ${tag}`)
}

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
    // HTTPS 推送失败时切换 SSH
    run('git remote set-url origin git@github.com:hotrichard1982/PicCraft.git')
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
  run(`gh release create ${tag} ${uploadArgs} --title "${tag}" --notes "${releaseNotes.replace(/"/g, '\\"')}"`)
  console.log("✅ Release 创建成功！")
} catch (e) {
  console.error("❌ Release 创建失败，请手动上传：")
  console.error(`   gh release create ${tag} ${uploadArgs} --title "${tag}"`)
  console.error(`   或访问: https://github.com/hotrichard1982/PicCraft/releases/new?tag=${tag}`)
  process.exit(1)
}

console.log("\n🎉 发布完成！")
