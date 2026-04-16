// Cross-platform husky setup guard. Skips silently if husky is absent
// (e.g., npm install on a consumer machine).
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
const isWindows = process.platform === "win32";
const bin = `node_modules/.bin/husky${isWindows ? ".cmd" : ""}`;
if (existsSync(bin)) {
  const result = spawnSync(bin, [], { stdio: "inherit" });
  if (result.status) process.exit(result.status);
}
