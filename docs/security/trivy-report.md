# Trivy Security Scan Report — paperclip-mcp v2.0.0 (hardened)

## Scan metadata

| Field           | Value                                                                     |
| --------------- | ------------------------------------------------------------------------- |
| Scan date       | 2026-04-16                                                                |
| Image           | `paperclip-mcp:2.0.0`                                                     |
| Image ID        | `sha256:fa5fd77a15849a1f0ddd6624ec653ffa9b42cbf5ddc5b1573866bc4a38e41c37` |
| Runtime base    | `node:22-alpine` (musl, hardened)                                         |
| Builder base    | `node:22-slim` (glibc, build stage only — not shipped)                    |
| Scanner         | Trivy (Aqua Security)                                                     |
| Severity filter | HIGH, CRITICAL, MEDIUM, LOW                                               |

## Reproducibility

```bash
trivy image --severity HIGH,CRITICAL,MEDIUM,LOW --format table paperclip-mcp:2.0.0
```

## CVE breakdown

### Hardened image (v2.0.0 — alpine runtime)

| Severity  | Count |
| --------- | ----- |
| CRITICAL  | 0     |
| HIGH      | 1     |
| MEDIUM    | 2     |
| LOW       | 0     |
| **Total** | **3** |

### Baseline image (node:22-slim runtime, pre-hardening)

| Severity  | Count   |
| --------- | ------- |
| CRITICAL  | 1       |
| HIGH      | 8       |
| MEDIUM    | 41      |
| LOW       | 76      |
| **Total** | **126** |

### Delta

| Severity  | Baseline | Hardened | Delta    |
| --------- | -------- | -------- | -------- |
| CRITICAL  | 1        | 0        | -1       |
| HIGH      | 8        | 1        | -7       |
| MEDIUM    | 41       | 2        | -39      |
| LOW       | 76       | 0        | -76      |
| **Total** | **126**  | **3**    | **-123** |

## Remaining findings and remediation status

All 3 remaining CVEs are located in `npm`'s own bundled node_modules
(`/usr/local/lib/node_modules/npm/node_modules/`), which are part of the
`node:22-alpine` base image's bundled npm binary. They are **not** part of the
application's production dependency tree and are **not reachable** from the
application's code path in a stdio-only MCP server.

| CVE            | Package               | Severity | Location                 | Fixed in       | Notes                                                  |
| -------------- | --------------------- | -------- | ------------------------ | -------------- | ------------------------------------------------------ |
| CVE-2026-33671 | picomatch 4.0.3       | HIGH     | npm bundled node_modules | 4.0.4          | ReDoS via crafted extglob — npm internal only          |
| CVE-2026-33750 | brace-expansion 2.0.2 | MEDIUM   | npm bundled node_modules | 2.0.3 / 1.1.13 | DoS via zero step — npm internal only                  |
| CVE-2026-33672 | picomatch 4.0.3       | MEDIUM   | npm bundled node_modules | 4.0.4          | Method injection via POSIX bracket — npm internal only |

**Remediation path:** These will be resolved when the `node:22-alpine` base image is
updated to bundle a newer npm version that includes picomatch ≥ 4.0.4 and
brace-expansion ≥ 2.0.3. No application-level change is needed. Rebuild with
`npm run docker:build` after the upstream `node:22-alpine` image is updated.

## OS-layer CVE status

The Alpine Linux OS layer in `node:22-alpine` reports **0 CVEs** at the time of this scan.
The previous `node:22-slim` (Debian 12) runtime carried the following OS-layer findings
that have been eliminated:

| CVE                 | Package                | Severity | Notes                                                       |
| ------------------- | ---------------------- | -------- | ----------------------------------------------------------- |
| CVE-2023-45853      | zlib1g                 | CRITICAL | Integer overflow in zipOpenNewFileInZip4_6                  |
| CVE-2026-0861       | libc-bin / libc6       | HIGH     | glibc memalign integer overflow                             |
| CVE-2026-29111      | libsystemd0 / libudev1 | HIGH     | systemd arbitrary code exec / DoS                           |
| CVE-2025-69720      | ncurses                | HIGH     | ncurses buffer overflow                                     |
| GHSA-458j-xx4x-4375 | hono 4.12.12           | MEDIUM   | HTML injection in JSX SSR — resolved by updating to 4.12.14 |

## Notable eliminated CVE: GHSA-458j-xx4x-4375 (hono)

The `hono` package (a transitive dependency via `@modelcontextprotocol/sdk`) was updated
from 4.12.12 to 4.12.14 as part of this hardening pass. The GHSA advisory describes
an HTML injection vulnerability in Hono's JSX SSR renderer — this vector is irrelevant
for a stdio-only MCP server (no HTTP serving, no JSX rendering), but it is eliminated
from the scan output regardless.

## Continuous scanning recommendation

Consumers running `paperclip-mcp` in production should integrate a periodic Trivy scan
into their pipeline:

```bash
# Scan for HIGH and CRITICAL only (actionable threshold)
trivy image --severity HIGH,CRITICAL --exit-code 1 paperclip-mcp:2.0.0
```

Set `--exit-code 1` to fail the pipeline if new HIGH/CRITICAL CVEs appear after a base
image update.
