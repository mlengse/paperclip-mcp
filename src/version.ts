import { createRequire } from "node:module";

const _require = createRequire(import.meta.url);
const _pkg = _require("../package.json") as { version: string };

/**
 * Server version read dynamically from package.json at startup.
 * The 2.0.0 bump happens in Stage 9 — do not hard-code a version here.
 */
export const SERVER_VERSION: string = _pkg.version;
