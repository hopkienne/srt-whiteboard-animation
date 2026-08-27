import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const python = process.platform === "win32"
  ? resolve(repo, ".venv/Scripts/python.exe")
  : resolve(repo, ".venv/bin/python");

if (!existsSync(python)) {
  console.error(`Không tìm thấy Python venv tại ${python}. Hãy chạy scripts/prepare_env.py trước.`);
  process.exit(1);
}

const child = spawn(python, [resolve(here, "local_render_server.py")], {
  cwd: repo,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
