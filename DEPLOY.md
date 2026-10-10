# CareKaki — Single-Port Deployment

CareKaki ships as **one public HTTP service on one port**: the compiled Node MCP
server (`dist/http.js`) exposes the MCP Streamable HTTP endpoint at `/mcp`, a
health probe at `/health`, and serves the built Angular SPA from the same origin
so the browser talks to the API without any absolute URL or second port.

```
Browser ──▶ :$PORT ──┬─▶ /mcp     MCP Streamable HTTP (9 tools, 3 optional Gemini AI)
                      ├─▶ /health  JSON health probe
                      └─▶ /        Angular SPA (static + SPA fallback)
```

## Prerequisites

- **Node 22+** for the server (`engines.node >= 22`).
- The Angular build must be produced with the system Node toolchain; on this
  machine that is `C:\Program Files\nodejs\node.exe` (v24). Do **not** use the
  managed Node for `ng`.

## Build + run

From the repository root:

```bash
# 1. Install (once)
npm install
npm --prefix carekaki-ux install

# 2. Build both: MCP server (tsc) then the Angular SPA
npm run build:all
#    = npm run build && npm run ux:build

# 3. Run in production mode (binds 0.0.0.0, serves API + SPA on one port)
npm run serve:prod
```

`npm run serve:prod` runs `scripts/serve-prod.mjs`, a tiny cross-platform
launcher (no extra dependency) that sets `NODE_ENV=production`, loads `.env` if
present, then starts `dist/http.js`.

Equivalent explicit invocation:

```bash
# bash / macOS / Linux
NODE_ENV=production PORT=3000 node dist/http.js

# Windows PowerShell
$env:NODE_ENV="production"; $env:PORT="3000"; node dist/http.js
```

If you prefer the Angular CLI's own build command directly:

```bash
cd carekaki-ux
"C:\Program Files\nodejs\node.exe" ./node_modules/@angular/cli/bin/ng.js build
```

Output lands in `carekaki-ux/dist/carekaki-ux/browser/` (contains `index.html`,
`main-*.js`, `styles-*.css`, lazy `chunk-*.js`, `favicon.ico`).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | The single public HTTP port. |
| `NODE_ENV` | _(unset)_ | When `production`, the default bind host becomes `0.0.0.0` (public). Otherwise the default stays loopback `127.0.0.1`. |
| `HOST` | `127.0.0.1` (dev) / `0.0.0.0` (production) | Bind address. Overrides the default above. |
| `ALLOWED_ORIGINS` | _(none)_ | Comma-separated extra Origin hostnames allowed to call `/mcp` (e.g. `myapp.example.com,carekaki.example.com`). Loopback names are always allowed. Set `*` to disable the Origin guard entirely. |
| `ALLOWED_HOSTS` | _(none)_ | Comma-separated extra Host header hostnames accepted when binding off the loopback (DNS-rebinding protection). Set `*` to disable the Host guard entirely. `npm run serve:prod` sets `*` automatically when running publicly (see below). |
| `PUBLIC_URL` | _(none)_ | Full public URL of the deployment; its hostname is auto-added to `ALLOWED_HOSTS`. Preferred over `*` when you know the domain. |
| `CAREKAKI_STRICT_HOSTS` | _(none)_ | Set to `1` to keep the strict host/origin guard even behind a public proxy. |
| `CAREKAKI_PROVIDERS_CSV` | `./carekaki_providers_demo.csv` | Path to the provider CSV (relative paths resolve from the repo root). |

### Public hosting and the host guard

Because a hosted deployment binds `0.0.0.0`, the DNS-rebinding guard that
protects a loopback-only dev server would reject every request whose `Host`
header is not allow-listed — including the platform's own public hostname. To
avoid a deployed-but-unreachable service, `npm run serve:prod` disables the
guard by default (hosts/origins `*`) unless you provide `PUBLIC_URL` or
`ALLOWED_HOSTS`, or set `CAREKAKI_STRICT_HOSTS=1`.

The guard is a convenience, **not** authentication. The security note below
still applies in full: this demo has no auth and must not carry real data.

Runtime frontend override: set `globalThis.__CAREKAKI_MCP_URL__` before the app
boots to point the SPA at a different MCP endpoint. By default the SPA calls the
relative path `/mcp` (same origin) — in local `ng serve` this is proxied to
`127.0.0.1:3000` by `carekaki-ux/proxy.conf.json`.

## SPA fallback behaviour

The static middleware serves real files first. Any other **GET** that is not
`/mcp`, not `/health`, and not an existing file returns `index.html`, so Angular
router deep links such as `/matching` and `/quotations/...` survive a page
refresh. `/mcp` and `/health` are registered **before** the static/fallback
handlers and are never swallowed by it.

If the frontend build directory is missing, the server logs a clear warning and
keeps serving the API (`/mcp`, `/health`) instead of crashing — run
`npm run ux:build` to restore the SPA.

## Quick verification

```bash
curl -s localhost:3000/health
curl -s localhost:3000/ | head
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/matching   # 200 (SPA fallback)
curl -s -X POST localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

## Security note

This is a **fictional-data demo with no authentication**. `allowedOrigins`
host-header/origin validation is enabled, but it is *not* authentication. Before
any real use you MUST add authentication and terminate HTTPS in front of this
service (reverse proxy or platform TLS). Do not expose it publicly with real or
personal data.
