import { execSync } from "child_process"
import { cpSync, mkdirSync, existsSync } from "fs"
import { resolve, join } from "path"

const root = resolve(import.meta.dirname, "..")
const srcTauri = join(root, "src-tauri")

const msvcBin = "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\bin\\Hostx64\\x64"
const sdkBin = "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64"
const sdkLib = "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\um\\x64"
const sdkUcrtLib = "C:\\Program Files (x86)\\Windows Kits\\10\\Lib\\10.0.26100.0\\ucrt\\x64"
const msvcLib = "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\lib\\x64"
const sdkInc = "C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\um"
const sdkUcrtInc = "C:\\Program Files (x86)\\Windows Kits\\10\\Include\\10.0.26100.0\\ucrt"
const msvcInc = "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\include"
const rcExe = "C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\rc.exe"

const env = {
  ...process.env,
  PATH: `${msvcBin};${sdkBin};${process.env.PATH}`,
  LIB: `${msvcLib};${sdkLib};${sdkUcrtLib}`,
  INCLUDE: `${msvcInc};${sdkInc};${sdkUcrtInc}`,
  RC: rcExe,
  RC_x86_64_pc_windows_msvc: rcExe,
}

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
