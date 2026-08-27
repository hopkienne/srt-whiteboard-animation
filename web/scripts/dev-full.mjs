import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const npmCli = process.env.npm_execpath;

const api = spawn(process.execPath, [resolve(here, "start-api.mjs")], { cwd: webRoot, stdio: "inherit" });
const vite = npmCli
  ? spawn(process.execPath, [npmCli, "run", "dev"], { cwd: webRoot, stdio: "inherit" })
  : spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev"], { cwd: webRoot, stdio: "inherit", shell: process.platform === "win32" });

let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  api.kill("SIGTERM");
  vite.kill("SIGTERM");
  setTimeout(() => process.exit(code), 150).unref();
}

api.on("exit", (code) => close(code ?? 0));
vite.on("exit", (code) => close(code ?? 0));
process.on("SIGINT", () => close(0));
process.on("SIGTERM", () => close(0));
