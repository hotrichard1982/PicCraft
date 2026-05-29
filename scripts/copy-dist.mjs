import { cpSync, mkdirSync, existsSync } from "fs";
import { resolve, join } from "path";

const root = resolve(import.meta.dirname, "..");
const distDir = join(root, "dist");
const bundleDir = join(root, "src-tauri", "target", "release", "bundle");
const exePath = join(root, "src-tauri", "target", "release", "piccarft.exe");

mkdirSync(distDir, { recursive: true });

if (existsSync(exePath)) {
  cpSync(exePath, join(distDir, "piccarft.exe"));
  console.log("✅ piccarft.exe → dist/");
}

if (existsSync(bundleDir)) {
  for (const type of ["msi", "nsis"]) {
    const typeDir = join(bundleDir, type);
    if (existsSync(typeDir)) {
      const dest = join(distDir, type);
      mkdirSync(dest, { recursive: true });
      cpSync(typeDir, dest, { recursive: true });
      console.log(`✅ bundle/${type}/ → dist/${type}/`);
    }
  }
}
