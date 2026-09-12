const { execFileSync, execSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const nextDir = path.join(root, ".next");

try {
  const pids = execFileSync("powershell.exe", ["-NoProfile", "-Command", "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess"], { encoding: "utf8" }).trim().split(/\s+/).filter(Boolean);
  for (const pid of new Set(pids)) {
    if (/^\d+$/.test(pid)) {
      try { execFileSync("taskkill.exe", ["/PID", pid, "/F"], { stdio: "ignore" }); } catch {}
    }
  }
} catch {}

fs.rmSync(nextDir, { recursive: true, force: true });
execSync("npm run build", { cwd: root, stdio: "inherit", shell: true });
const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "start", "-p", "3000"], { cwd: root, stdio: "inherit" });
child.on("exit", code => process.exit(code ?? 0));
