// Windows 发布构建辅助脚本（WORK-003-05）
// MSVC / Windows SDK 路径不再硬编码版本号，按以下顺序解析：
//   1. 已配置 VS Developer 环境（VsDevCmd.bat / Developer PowerShell / CI msvc-dev-cmd action）→ 直接继承
//   2. 用 vswhere 定位 VS 安装，枚举最新 MSVC 与 Windows SDK 版本目录
//   3. 均失败 → 明确报错并给出安装指引（不再静默回退系统 PATH，避免用错编译器产出坏产物）
import { execSync } from "child_process"
import { cpSync, mkdirSync, existsSync, readdirSync } from "fs"
import { resolve, join } from "path"
import { fileURLToPath } from "url"

const root = resolve(import.meta.dirname, "..")
const srcTauri = join(root, "src-tauri")

// 取目录列表中版本号最大者（如 MSVC 14.44.35207 / SDK 10.0.26100.0），
// 过滤 arm64 / x64 等非版本目录。
function newestVersion(entries) {
  return entries
    .filter((e) => /^\d+(\.\d+)+$/.test(e))
    .sort((a, b) => {
      const pa = a.split(".").map(Number)
      const pb = b.split(".").map(Number)
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0)
        if (d !== 0) return d
      }
      return 0
    })
    .pop()
}

// 已处于 VS Developer 环境（VsDevCmd 会设置 VCToolsInstallDir）
function hasDeveloperEnv() {
  return Boolean(process.env.VCToolsInstallDir)
}

// 用 vswhere 定位 VS / BuildTools 安装路径
function findVsInstall() {
  const vswhere = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe"
  if (!existsSync(vswhere)) return null
  try {
    return execSync(
      `"${vswhere}" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`,
      { encoding: "utf8" },
    ).trim() || null
  } catch {
    return null
  }
}

// 解析 MSVC / SDK 并组装构建环境变量；导出便于本地验证与测试
export function resolveToolchainEnv() {
  if (hasDeveloperEnv()) {
    console.log("✅ 检测到已配置的 VS Developer 环境，直接继承")
    return process.env
  }

  const vs = findVsInstall()
  if (!vs) {
    throw new Error(
      "未找到 Visual Studio / Build Tools（vswhere 无结果）。\n" +
      "请安装 VS Build Tools（含 C++ 工作负载）后重试：\n" +
      "  winget install Microsoft.VisualStudio.2022.BuildTools\n" +
      "或在 VS Developer 命令提示符 / PowerShell 中运行本脚本。",
    )
  }

  const msvcRoot = join(vs, "VC", "Tools", "MSVC")
  const msvcVer = existsSync(msvcRoot) ? newestVersion(readdirSync(msvcRoot)) : undefined
  if (!msvcVer) throw new Error(`未在 ${msvcRoot} 找到任何 MSVC 版本目录`)
  const msvc = join(msvcRoot, msvcVer)

  const kitsRoot = "C:\\Program Files (x86)\\Windows Kits\\10"
  const sdkVer = existsSync(join(kitsRoot, "bin")) ? newestVersion(readdirSync(join(kitsRoot, "bin"))) : undefined
  if (!sdkVer) throw new Error(`未在 ${kitsRoot}\\bin 找到任何 Windows SDK 版本目录`)

  const msvcBin = join(msvc, "bin", "Hostx64", "x64")
  const sdkBin = join(kitsRoot, "bin", sdkVer, "x64")
  const rcExe = join(sdkBin, "rc.exe")
  for (const p of [msvcBin, sdkBin, rcExe]) {
    if (!existsSync(p)) throw new Error(`工具链路径不存在: ${p}`)
  }

  console.log(`✅ 探测到 MSVC ${msvcVer}（${msvc}）`)
  console.log(`✅ 探测到 Windows SDK ${sdkVer}（${kitsRoot}\\bin\\${sdkVer}）`)
  return {
    ...process.env,
    PATH: `${msvcBin};${sdkBin};${process.env.PATH}`,
    LIB: `${join(msvc, "lib", "x64")};${join(kitsRoot, "Lib", sdkVer, "um", "x64")};${join(kitsRoot, "Lib", sdkVer, "ucrt", "x64")}`,
    INCLUDE: `${join(msvc, "include")};${join(kitsRoot, "Include", sdkVer, "um")};${join(kitsRoot, "Include", sdkVer, "ucrt")}`,
    RC: rcExe,
    RC_x86_64_pc_windows_msvc: rcExe,
  }
}

function main() {
  const env = resolveToolchainEnv()

  console.log("🔨 Building PicCraft...")
  execSync("npx tauri build", { cwd: root, env, stdio: "inherit" })

  const distDir = join(root, "dist")
  const bundleDir = join(srcTauri, "target", "release", "bundle")
  const exePath = join(srcTauri, "target", "release", "piccarft.exe")

  mkdirSync(distDir, { recursive: true })

  if (existsSync(exePath)) {
    cpSync(exePath, join(distDir, "piccarft.exe"))
    console.log("✅ piccarft.exe → dist/")
  }

  if (existsSync(bundleDir)) {
    for (const type of ["msi", "nsis"]) {
      const typeDir = join(bundleDir, type)
      if (existsSync(typeDir)) {
        const dest = join(distDir, type)
        mkdirSync(dest, { recursive: true })
        cpSync(typeDir, dest, { recursive: true })
        console.log(`✅ bundle/${type}/ → dist/${type}/`)
      }
    }
  }
}

// Windows 下 argv[1] 与 import.meta.url 可能大小写/斜杠不一致（短路径、盘符大小写），
// 统一解析为绝对路径后做不区分大小写的比较，避免直接运行被误判为 import 而跳过构建。
const isMain = (() => {
  if (!process.argv[1]) return false
  return resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
})()
if (isMain) main()
