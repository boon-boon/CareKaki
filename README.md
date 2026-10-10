# CareKaki

CareKaki is an AI-assisted respite-care operations platform for Malaysia, combining:
1. **CareKaki MCP Server**: A standalone Model Context Protocol server exposing 6 care-matching and verification tools over `stdio` and `Streamable HTTP`.
2. **CareKaki Pro (Angular 22 UX)**: A modern operations dashboard for intake, caregiver rostering, AI matching, quotations, and job order tracking.

---

## Architecture Overview

```
                      ┌──────────────────────────────────────────────┐
                      │    CareKaki Pro (Angular 22 Web App)         │
                      │    http://127.0.0.1:4200                     │
                      │  • Intake Form (NLP extraction)              │
                      │  • Caregiver Roster & Catalogue              │
                      │  • Matching & Compare Drawer                 │
                      │  • Quotations (SST 8% compliant)             │
                      │  • Job Orders & Clock-In Tracker             │
                      └──────────────────────┬───────────────────────┘
                                             │ HTTP / Streamable MCP
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │    CareKaki MCP Server                       │
                      │    http://127.0.0.1:3000/mcp                 │
                      │  • 6 Analytical Tools                        │
                      │  • Clarification State Machine               │
                      │  • Multi-factor Ranking Algorithm            │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │    carekaki_providers_demo.csv               │
                      │    20 Fictional Malaysian Care Providers     │
                      └──────────────────────────────────────────────┘
```

---

## MCP Server Tools

| Tool | Purpose |
| :--- | :--- |
| `carekaki_get_search_options` | Discovers available Malaysian locations, service codes, dates, and budget/duration presets. |
| `carekaki_validate_request` | Validates intake parameters, generates clarification questions for missing data, and requests user confirmation. |
| `carekaki_search_providers` | Filters by eligibility (location, all requested services, verification, time window, budget) and ranks matches (Rating 50%, Affordability 35%, Language 15%). |
| `carekaki_list_providers` | Browses the demo catalogue with optional filters (city, service, rate, date). |
| `carekaki_get_provider` | Retrieves full profile details for a provider by ID (`CK001` - `CK020`). |
| `carekaki_explain_matching` | Returns a 5-check diagnostic explanation for why each provider passed or failed. |

---

## Getting Started

### Prerequisites
- Node.js `22.x` or `24.x`
- npm `10.x` or later

### Installation

```bash
# Clone the repository
git clone https://github.com/boon-boon/CareKaki.git
cd CareKaki

# Install MCP server dependencies
npm ci

# Install Angular UX dependencies
cd carekaki-ux && npm ci && cd ..
```

### Running the Services

```bash
# 1. Start the MCP Server (Streamable HTTP on port 3000)
npm run http

# 2. In a separate terminal, start the Angular UX (port 4200)
npm run ux:start

# 3. Open http://127.0.0.1:4200 in your browser
```

### Building & Verification

```bash
# Build the TypeScript MCP server
npm run build

# Run automated domain & transport smoke tests (all 9 checks)
npm run smoke

# Build the Angular UX for production
npm run ux:build
```

---

## MCP Client Configuration (stdio)

To connect AI assistants (e.g. Claude Desktop, Cursor, WorkBuddy) via `stdio`:

```json
{
  "mcpServers": {
    "carekaki": {
      "command": "node",
      "args": ["<PATH_TO_CAREKAKI>/dist/index.js"],
      "env": {
        "CAREKAKI_PROVIDERS_CSV": "<PATH_TO_CAREKAKI>/carekaki_providers_demo.csv"
      }
    }
  }
}
```

---

## Security & Demo Notice

- **Fictional Demo Data**: All 20 caregiver records are synthetic data for demonstration purposes.
- **Local Loopback Only**: The default HTTP transport binds exclusively to `127.0.0.1` / `localhost`.
- **Production Boundary**: A real-world production deployment requires external authentication, authorization, encrypted HTTPS endpoints, and real-time calendar synchronization.
