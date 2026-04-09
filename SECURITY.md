# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

To report a vulnerability, email the maintainers directly (see the `authors` field in `package.json`), or use GitHub's private [Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) feature.

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Any suggested mitigations you are aware of

We aim to acknowledge reports within 3 business days and provide a resolution timeline within 14 days.

## Scope

This package is an MCP stdio server. Key security considerations:

- **API key handling** — `PAPERCLIP_API_KEY` is read from the environment at startup and injected as a Bearer token. It is never logged or written to disk by this package.
- **Input validation** — All tool inputs are validated with Zod before reaching the API client. Invalid inputs are rejected with an `InvalidParams` MCP error.
- **No inbound network listeners** — The server communicates exclusively over stdio (stdin/stdout). It does not bind any network ports.
- **Dependency vulnerabilities** — Run `npm audit` to check for known vulnerabilities in dependencies.
