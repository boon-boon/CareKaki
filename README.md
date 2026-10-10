# CareKaki

CareKaki is an AI-assisted respite-care operations platform for Malaysia, combining:
1. **CareKaki MCP Server**: A standalone Model Context Protocol server exposing 9 care-matching, verification, and optional Gemini AI tools over `stdio` and `Streamable HTTP`.
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
| `carekaki_ai_interpret_request` | Uses Gemini to interpret a free-text care intake as a structured, unconfirmed patch; deterministic fallback when AI is disabled. |
| `carekaki_ai_recommend_providers` | Performs deterministic eligibility filtering first, then uses Gemini to rank the eligible provider pool or review-only alternatives. |
| `carekaki_ai_explain_recommendation` | Explains assessed provider suitability, while preserving the original eligibility boundaries. |

### Optional Gemini inference

Gemini inference is disabled by default. Set `GEMINI_API_KEY` and `CAREKAKI_LLM_MODE=on` in the server's ignored `.env` file or deployment secret environment, then restart the MCP service. The default model is `gemini-2.5-flash`; override with `GEMINI_MODEL` if desired.

- `CAREKAKI_LLM_MODE=off`: rule-based extraction and ranking, no Gemini calls.
- `CAREKAKI_LLM_MODE=shadow`: call Gemini for comparison but keep deterministic outputs.
- `CAREKAKI_LLM_MODE=on`: Angular uses Gemini for free-text intake and for ranking providers after server-side eligibility checks.

Never put the key in Angular, `public/`, browser storage, logs or Git. This unauthenticated fictional-data demo needs authentication and per-user rate limiting **before** publicly enabling a paid AI endpoint. Live Gemini inference requires a valid external key, network access and available API quota.

The existing CSV contains only one availability window per record. Multi-date weekday or weekend requests therefore frequently produce no fully eligible providers, independently of AI quality. Alternatives are always review-only, and the user must confirm requirements and provider selection; no booking is made automatically.

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
