# CareKaki

**AI-assisted caregiver matching and respite-care operations for Malaysia**

[**🌐 Open the live CareKaki demo**](https://carekaki.netlify.app/dashboard) · [Deployment guide](DEPLOY.md) · [Source code](https://github.com/boon-boon/CareKaki)

> **Demo disclaimer:** CareKaki currently uses fictional provider data. It is an operations prototype, not a live care booking service. Recommendations, quotations, job orders, and contact previews do not reserve a caregiver or create a real-world appointment.

## Overview

CareKaki brings together two components:

- **CareKaki Pro:** An Angular 22 operations dashboard for intake, caregiver discovery, matching, pricing, quotations, and simulated job orders.
- **CareKaki MCP Server:** A TypeScript/Node.js Model Context Protocol (MCP) server with nine tools for provider data, validation, deterministic matching, explanations, and optional Google Gemini assistance.

The project explores how a care-operations assistant can guide intake, validate requirements, compare candidates, and prepare a human-reviewed handoff without allowing AI output to bypass eligibility or confirmation rules.

## Live demo

**Website:** https://carekaki.netlify.app/dashboard

The Netlify deployment hosts the Angular application and exposes serverless MCP and health endpoints:

| Path | Purpose |
| --- | --- |
| [`/dashboard`](https://carekaki.netlify.app/dashboard) | Main operations dashboard |
| [`/intake`](https://carekaki.netlify.app/intake) | New care request and clarification |
| [`/matching`](https://carekaki.netlify.app/matching) | Provider matching and comparison |
| [`/roster`](https://carekaki.netlify.app/roster) | Caregiver catalogue |
| [`/quotations`](https://carekaki.netlify.app/quotations) | Demo quotation |
| [`/job-orders`](https://carekaki.netlify.app/job-orders) | Simulated operations handoff |
| [`/pricing`](https://carekaki.netlify.app/pricing) | Pricing reference view |
| [`/health`](https://carekaki.netlify.app/health) | Service health endpoint |
| `/mcp` | Streamable HTTP MCP endpoint (for MCP clients) |

The deployment is configured in [`netlify.toml`](netlify.toml), with Netlify Functions under [`netlify/functions/`](netlify/functions/). The live service may depend on hosting status, network connectivity, and optional API credentials.

## Main features

| Feature | Details |
| --- | --- |
| **Guided care intake** | Structured or free-text requests, clarification prompts, input validation, and explicit user confirmation |
| **Recurring schedules** | `weekday` means Monday–Friday; `weekend` means Saturday–Sunday; explicit individual days are also supported |
| **Caregiver matching** | Hard eligibility checks for location, all required services, verification, availability, and total budget |
| **Ranked recommendations** | Eligible candidates scored by rating (50%), affordability (35%), and language preference (15%) |
| **Top-five alternatives** | When there are no fully eligible providers, show up to five *review-only* candidates with failed checks and date coverage |
| **AI assistance** | Optional Gemini interpretation, recommendation ranking, and explanations; hard checks remain deterministic |
| **In-progress session** | Retains intake and selected-provider context across routes and refreshes in the same browser tab |
| **Quotations** | Uses the selected MCP provider's hourly rate for the live quote; calculates hours, scheduled visits, and demo tax |
| **Operations dashboard** | Caregiver roster, pricing, job-order preview, and demonstration messaging views |

### Matching rules

An **eligible match** must pass all five checks:

1. **Location:** provider's city must match the request.
2. **Services:** provider must offer every required service.
3. **Verification:** provider's demo `verified` flag must be true.
4. **Availability:** the requested time interval must be covered for every requested occurrence.
5. **Budget:** total estimated care cost must not exceed the supplied **total** MYR budget.

**Estimated matching cost = hourly rate × duration per visit × number of visits.** A preferred language affects scoring, but is not a hard eligibility requirement.

If no provider passes every check, the server can return the top five alternatives. They are **not bookable or confirmed**: some may fail important requirements, including verification or availability. The interface exposes the failed checks for human review instead of silently presenting these providers as valid matches.

### Scheduling and validation

- Recurring weekday/weekend requests expand to a **maximum of 12 upcoming occurrences** unless explicit dates are provided.
- The selected first date must fall on a requested scheduled day.
- Validation uses **Asia/Kuala_Lumpur** local time and rejects dates/times in the past.
- An individual visit cannot extend past midnight.
- The matching screen can check the entire schedule or inspect an individual date.
- The included fictional CSV has limited availability records; a multi-date schedule may produce no complete matches even when individual dates have candidates.

### Quotation and workflow state

The application retains one unfinished demo booking using an Angular session service and browser `sessionStorage`. Intake selections can carry forward to matching, quotations, and job orders without re-entering the request; this is not persistent production booking storage.

For an active MCP-selected provider, the quotation screen requests the provider record through `carekaki_get_provider` and uses its `hourly_rate` rather than replacing it with a fixed provider-specific price. It then calculates the line items from the selected services, hours, and dates, including configured demo SST (currently 8%). If the quotation screen is opened directly without a session, it can display reference/sample data instead.

**Human confirmation remains required:** selecting or comparing a caregiver in this prototype does not automatically confirm a real assignment.

## Architecture

~~~text
              Browser / Angular 22 application
     Dashboard • Intake • Roster • Matching • Quotes
                           |
               JSON-RPC / Streamable HTTP
                           |
                           v
               CareKaki MCP Server (Node.js)
             ├─ 6 matching/validation tools
             ├─ 3 optional Gemini AI tools
             ├─ deterministic eligibility and ranking
             └─ fictional provider CSV catalogue
~~~

**Development:** Angular at `http://127.0.0.1:4200` proxies `/mcp` and `/health` to the MCP server at `http://127.0.0.1:3000`.

**Node deployment:** one Node server can host the built Angular SPA at `/` plus MCP at `/mcp` and a health probe at `/health`.

**Netlify deployment:** the static SPA is served by Netlify's CDN; Netlify Functions provide `/mcp` and `/health`. See [DEPLOY.md](DEPLOY.md).

## MCP tool catalogue

| Tool | Purpose |
| --- | --- |
| `carekaki_get_search_options` | Discover locations, services, supported dates, languages, and presets |
| `carekaki_validate_request` | Validate a partial request, ask for clarification, and request explicit confirmation |
| `carekaki_search_providers` | Apply five eligibility checks, score matching providers, and return alternatives if needed |
| `carekaki_list_providers` | Browse or filter the demo caregiver catalogue |
| `carekaki_get_provider` | Fetch a full provider record and its demo hourly rate |
| `carekaki_explain_matching` | Report provider-specific pass/fail diagnostics |
| `carekaki_ai_interpret_request` | Use optional Gemini inference to interpret free text into an **unconfirmed** draft |
| `carekaki_ai_recommend_providers` | Optionally rank candidates with Gemini, preserving deterministic eligibility |
| `carekaki_ai_explain_recommendation` | Explain or compare recommendations without overriding the eligibility rules |

All tools are exposed by the MCP server. The six non-AI catalogue/matching tools work without a Gemini API key; AI-related functionality is optional.

## Get started locally

### Requirements

- **Node.js 22+** (Node 22 or 24 recommended)
- npm
- Optional Google AI Studio API key, configured only on the server

### Install and build

~~~bash
git clone https://github.com/boon-boon/CareKaki.git
cd CareKaki
npm ci
npm run build
~~~

The root install script installs the Angular dependencies. If install scripts were disabled, run `npm --prefix carekaki-ux ci` separately.

### Run the development services

In one terminal (MCP server):

~~~bash
npm run http
~~~

In another terminal (Angular frontend):

~~~bash
npm run ux:start
~~~

Open **http://127.0.0.1:4200**. The server health endpoint is **http://127.0.0.1:3000/health**.

### Try a demonstration request

1. Open **New Intake** and enter the care location, required services, date, time, hours, and **total budget**.
2. Answer any missing-field prompts and confirm the complete requirements.
3. View eligible results or inspect the diagnostics for review-only alternatives.
4. Confirm an eligible caregiver and examine the demo quotation and job-order screens.

Because this project uses fictional provider records, **no real caregiver is contacted or booked**.

## Optional Gemini configuration

Copy [.env.example](.env.example) to `.env` in the project root. The latter should remain untracked.

~~~dotenv
GEMINI_API_KEY=your_server_side_key
CAREKAKI_LLM_MODE=on
GEMINI_MODEL=gemini-2.5-flash
~~~

| `CAREKAKI_LLM_MODE` | Behavior |
| --- | --- |
| `off` (default) | Deterministic workflow; no live Gemini inference |
| `shadow` | Calls Gemini for comparison but preserves deterministic results |
| `on` | Enables Gemini-assisted intake and eligibility-safe provider ranking |

Keep credentials in server-side environment variables or hosting secrets. **Do not commit API keys** or place them in Angular, `public/`, browser storage, or frontend code.

## External MCP clients

After running `npm run build`, clients supporting `stdio` may use a configuration similar to:

~~~json
{
  "mcpServers": {
    "carekaki": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/dist/index.js"],
      "env": {
        "CAREKAKI_PROVIDERS_CSV": "<ABSOLUTE_PATH_TO_REPO>/carekaki_providers_demo.csv"
      }
    }
  }
}
~~~

Replace the placeholder paths with your local absolute paths. HTTP clients can instead connect to `http://127.0.0.1:3000/mcp` after starting `npm run http`.

MCP calls are stateless: the integrating client or application needs to preserve draft fields, show follow-up questions, collect consent, and send the accumulated confirmed request back to the tools.

## Build, test, and deploy

| Command | What it does |
| --- | --- |
| `npm run build` | Compile the TypeScript MCP server |
| `npm run typecheck` | Type-check the MCP server |
| `npm run smoke` | Run compiled domain/transport smoke tests (build first) |
| `npm run ux:build` | Compile the Angular frontend |
| `npm run build:all` | Build the backend/frontend and sync assets |
| `npm run serve:prod` | Serve SPA and MCP on a single Node port |
| `npm run build:netlify` | Prepare TypeScript and provider data for Netlify Functions |
| `npm run verify:netlify` | Locally verify Netlify Functions |

For one-port Node hosting:

~~~bash
npm run build:all
npm run serve:prod
~~~

For Netlify deployment, consult [DEPLOY.md](DEPLOY.md) and [netlify.toml](netlify.toml). The repository tracks a prebuilt frontend in `public/`, so changing Angular source requires building and syncing it before deploying. The Netlify demo is available at **https://carekaki.netlify.app/dashboard**.

## Repository structure

~~~text
CareKaki/
├── README.md
├── DEPLOY.md
├── .env.example
├── carekaki_providers_demo.csv
├── src/
│   ├── server.ts           MCP tool registrations
│   ├── validate.ts         Intake and recurrence validation
│   ├── match.ts            Eligibility and ranking
│   ├── ai/gemini.ts        Optional Gemini integration
│   ├── http.ts             HTTP transport and SPA hosting
│   └── smoke.ts            Domain/transport tests
├── carekaki-ux/            Angular application
│   └── src/app/
│       ├── core/           Models and MCP/session services
│       └── features/       User-facing operation screens
├── netlify/                Netlify Functions and bundled provider data
├── netlify.toml
├── scripts/                Build and deployment helpers
└── public/                 Prebuilt frontend assets
~~~

## Security and limitations

This repository is a **fictional-data prototype**. Provider verification flags do not replace independent credential checks, and catalogue availability does not represent live caregiver schedules. No real booking, payment processing, or provider notification is performed automatically.

Before using real care-recipient information or deploying as a public service, add authentication, authorization, privacy controls, request rate limiting, verified provider integrations, real-time availability, secure HTTPS, auditing, and appropriate human approval. In particular, avoid enabling a paid AI endpoint on an unauthenticated public demo.

---

**CareKaki — a human-reviewed AI-assisted care-operations prototype.** [Launch the demo](https://carekaki.netlify.app/dashboard) · [Deployment instructions](DEPLOY.md)

