# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 2.x     | Yes       |
| 1.x     | No        |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's private [Security Advisories](https://github.com/bruhsb/paperclip-mcp/security/advisories/new) feature to report vulnerabilities confidentially.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested mitigations

**Response expectations (best-effort, OSS project):** We aim to acknowledge reports within 5 business days and provide a resolution timeline within 30 days. There is no guaranteed SLA — this is a community-maintained open-source package.

## Scope

This package is an MCP stdio server. Key security considerations:

- **API key handling** — `PAPERCLIP_API_KEY` is read from the environment at startup and injected as a Bearer token on every request. It is never logged or written to disk by this package.
- **Input validation** — All tool inputs are validated with Zod before reaching the API client. Invalid inputs are rejected with an `InvalidParams` MCP error. All schemas use `.strict()` — unknown fields are rejected at parse time.
- **No inbound network listeners** — The server communicates exclusively over stdio (stdin/stdout). It does not bind any network ports.
- **Local-trusted mode** — If you run the Paperclip API server (`PAPERCLIP_API_URL`) on a non-localhost address, ensure it is behind appropriate network access controls. The MCP server performs no additional auth beyond forwarding the bearer token — do not expose the Paperclip API on a public network without TLS and authentication.
- **Dependency vulnerabilities** — Run `npm audit` to check for known vulnerabilities in dependencies.
