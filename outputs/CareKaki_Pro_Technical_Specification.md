   1→# CareKaki Pro — System Development & Technical Specification
   2→
   3→**Agentic Operations Platform for Micro-Care Agencies in Malaysia**
   4→**Deployment Target:** Tencent WorkBuddy Workspace Environment
   5→**Document Version:** 1.0
   6→**Currency:** Malaysian Ringgit (MYR)
   7→**Tax Framework:** SST at 8% (current Malaysian Sales and Service Tax rate)
   8→
   9→---
  10→
  11→## Table of Contents
  12→
  13→1. [Architectural Overview & Agentic Workflow](#1-architectural-overview--agentic-workflow)
  14→2. [Workspace Directory & Data Schemas](#2-workspace-directory--data-schemas)
  15→3. [Custom WorkBuddy Skill / Agent Configuration](#3-custom-workbuddy-skill--agent-configuration)
  16→4. [Error Handling & Quality Assurance](#4-error-handling--quality-assurance)
  17→5. [24-Hour Development Roadmap](#5-24-hour-development-roadmap)
  18→
  19→---
  20→
  21→## 1. Architectural Overview & Agentic Workflow
  22→
  23→### 1.1 System Concept
  24→
  25→CareKaki Pro is an agentic operations platform that runs entirely within a Tencent WorkBuddy workspace. It enables micro-care agencies (typically 3–15 caregivers) to intake client requests via natural language, automatically match available caregivers against requirements, and generate formatted operational documents — quotations, job orders, and WhatsApp dispatch messages — without manual data entry.
  26→
  27→The platform leverages WorkBuddy's native skill system (SKILL.md packages), the Sheet Agent MCP toolset for CSV/XLSX querying, and workspace file operations for document generation.
  28→
  29→### 1.2 End-to-End Execution Flow
  30→
  31→The following diagram maps the complete execution flow triggered by a single natural language input — a client lead intake message:
  32→
  33→```
  34→┌─────────────────────────────────────────────────────────────────────────┐
  35→│                        USER NATURAL LANGUAGE INPUT                      │
  36→│                                                                         │
  37→│  "I need a certified nurse for my mother in Cheras, KL. She had       │
  38→│   a hip replacement 2 weeks ago. Shift is 8am–4pm, Monday to          │
  39→│  Friday. Starting next Monday."                                        │
  40→└──────────────────────────────────┬──────────────────────────────────────┘
  41→                                   │
  42→                                   ▼
  43→┌─────────────────────────────────────────────────────────────────────────┐
  44→│  STEP A: INTENT PARSING & ENTITY EXTRACTION                            │
  45→│  ─────────────────────────────────────────────────────────────────      │
  46→│  Agent: IntakeAndMatchAgent                                            │
  47→│  • Parse service type     → "nursing"                                  │
  48→│  • Parse location         → "Cheras, Kuala Lumpur"                     │
  49→│  • Parse shift hours      → 08:00–16:00, Mon–Fri                       │
  50→│  • Parse patient cond.    → "post-hip-replacement recovery"           │
  51→│  • Parse start date       → "next Monday" → resolve to concrete date   │
  52→│  • Validate completeness  → all 5 entity slots filled?                 │
  53→└──────────────────────────────────┬──────────────────────────────────────┘
  54→                                   │
  55→                                   ▼
  56→┌─────────────────────────────────────────────────────────────────────────┐
  57→│  STEP B: TOOL CALLING & LOCAL ROSTER SEARCH                             │
  58→│  ─────────────────────────────────────────────────────────────────      │
  59→│  Agent: IntakeAndMatchAgent                                            │
  60→│  Tools: mcp__sheetagent__read_table, mcp__sheetagent__search_data       │
  61→│  • Load /data/staff_roster.csv                                         │
  62→│  • Filter: primary_zone contains "Kuala Lumpur" OR "Cheras"           │
  63→│  • Filter: certifications contains "Nursing"                          │
  64→│  • Filter: availability_status = "available"                          │
  65→│  • Return: candidate subset (rows)                                     │
  66→└──────────────────────────────────┬──────────────────────────────────────┘
  67→                                   │
  68→                                   ▼
  69→┌─────────────────────────────────────────────────────────────────────────┐
  70→│  STEP C: MATCHING LOGIC & SCORING                                       │
  71→│  ─────────────────────────────────────────────────────────────────      │
  72→│  Agent: IntakeAndMatchAgent                                            │
  73→│  • Compute proximity score   (zone match weight: 40%)                  │
  74→│  • Compute skill score       (certification match weight: 35%)         │
  75→│  • Compute availability score (status weight: 25%)                     │
  76→│  • Rank candidates by total score descending                           │
  77→│  • Select top-N (default: 3) for recommendation                        │
  78→│  • Build JSON handoff payload with matched candidates                  │
  79→└──────────────────────────────────┬──────────────────────────────────────┘
  80→                                   │
  81→                                   ▼
  82→┌─────────────────────────────────────────────────────────────────────────┐
  83→│  STEP D: WORKSPACE ASSET GENERATION                                     │
  84→│  ─────────────────────────────────────────────────────────────────      │
  85→│  Agent: DocumentGeneratorAgent                                          │
  86→│  Tools: Read, Write, Edit                                               │
  87→│  • Load /data/pricing_matrix.json → compute rates                      │
  88→│  • Render /templates/client_quotation_template.md → quotation          │
  89→│  • Render /templates/caregiver_job_order_template.md → job order       │
  90→│  • Generate WhatsApp dispatch message copy                             │
  91→│  • Write all outputs to /outputs/ subdirectories                       │
  92→│  • Validate against schema before final write                          │
  93→└──────────────────────────────────┬──────────────────────────────────────┘
  94→                                   │
  95→                                   ▼
  96→┌─────────────────────────────────────────────────────────────────────────┐
  97→│  OUTPUT DELIVERED TO USER                                              │
  98→│  • Client Quotation  → /outputs/quotations/QT-20261010-001.md         │
  99→│  • Caregiver Job Order → /outputs/job_orders/JO-20261010-001.md        │
 100→│  • WhatsApp Dispatch Message → /outputs/dispatch_messages/WA-001.txt  │
 101→└─────────────────────────────────────────────────────────────────────────┘
 102→```
 103→
 104→### 1.3 Step A: Intent Parsing & Entity Extraction
 105→
 106→The IntakeAndMatchAgent receives the raw natural language input and performs structured entity extraction. The agent's system prompt instructs it to identify five mandatory entity slots before proceeding to Step B.
 107→
 108→**Extracted Entity Schema:**
 109→
 110→| Entity Slot | Field Name | Type | Required | Example Value |
 111→|---|---|---|---|---|
 112→| Service Type | `service_type` | enum: `home_care`, `nursing`, `transport`, `companionship` | Yes | `nursing` |
 113→| Location | `location` | string (Malaysian city/area) | Yes | `Cheras, Kuala Lumpur` |
 114→| Shift Hours | `shift_hours` | object: `{start, end, days[]}` | Yes | `{start: "08:00", end: "16:00", days: ["Mon","Tue","Wed","Thu","Fri"]}` |
 115→| Patient Conditions | `patient_conditions` | string (free-text clinical context) | Yes | `post-hip-replacement recovery, mobility assistance needed` |
 116→| Start Date | `start_date` | ISO 8601 date string | Yes | `2026-10-13` |
 117→
 118→**Relative date resolution rule:** When the user says "next Monday," "tomorrow," or similar relative references, the agent resolves these to absolute ISO 8601 dates using the current system time. The resolved date is shown back to the user for confirmation.
 119→
 120→**Entity extraction output (JSON):**
 121→
 122→```json
 123→{
 124→  "intake_id": "INT-20261010-001",
 125→  "timestamp": "2026-10-10T11:24:35+08:00",
 126→  "raw_input": "I need a certified nurse for my mother in Cheras, KL. She had a hip replacement 2 weeks ago. Shift is 8am-4pm, Monday to Friday. Starting next Monday.",
 127→  "entities": {
 128→    "service_type": "nursing",
 129→    "location": "Cheras, Kuala Lumpur",
 130→    "location_zone": "Kuala Lumpur",
 131→    "shift_hours": {
 132→      "start": "08:00",
 133→      "end": "16:00",
 134→      "duration_hours": 8,
 135→      "days": ["Mon", "Tue", "Wed", "Thu", "Fri"]
 136→    },
 137→    "patient_conditions": "post-hip-replacement recovery, mobility assistance needed",
 138→    "start_date": "2026-10-13",
 139→    "estimated_weeks": null
 140→  },
 141→  "completeness_check": "PASS",
 142→  "missing_slots": []
 143→}
 144→```
 145→
 146→### 1.4 Step B: Tool Calling & Local Roster Search
 147→
 148→With entities extracted, the IntakeAndMatchAgent queries the local `staff_roster.csv` file using the Sheet Agent MCP toolset.
 149→
 150→**Tool invocation sequence:**
 151→
 152→1. **`mcp__sheetagent__read_table`** — Load the full roster file to establish the working dataset.
 153→   - File path: `D:/WorkBuddy/Claw/CareKaki_Pro/data/staff_roster.csv`
 154→
 155→2. **`mcp__sheetagent__search_data`** — Execute filtered search with the following criteria:
 156→   - `primary_zone` contains `Kuala Lumpur` (the resolved zone from Step A)
 157→   - `certifications` contains `Nursing` (matched from `service_type = "nursing"`)
 158→   - `availability_status` equals `available`
 159→
 160→3. **Result handling:** The agent receives the filtered rows as structured data. If zero rows are returned, the fallback logic (Section 4) is triggered. If rows are returned, they proceed to Step C for scoring.
 161→
 162→**Search query payload example:**
 163→
 164→```json
 165→{
 166→  "tool": "mcp__sheetagent__search_data",
 167→  "params": {
 168→    "file_path": "D:/WorkBuddy/Claw/CareKaki_Pro/data/staff_roster.csv",
 169→    "filters": [
 170→      {"column": "primary_zone", "operator": "contains", "value": "Kuala Lumpur"},
 171→      {"column": "certifications", "operator": "contains", "value": "Nursing"},
 172→      {"column": "availability_status", "operator": "equals", "value": "available"}
 173→    ],
 174→    "return_columns": ["caregiver_id", "name", "certifications", "primary_zone", "hourly_rate_myr", "availability_status"]
 175→  }
 176→}
 177→```
 178→
 179→### 1.5 Step C: Matching Logic & Scoring
 180→
 181→Each candidate returned from the roster search is scored using a weighted multi-factor algorithm. The scoring system evaluates three dimensions:
 182→
 183→**Scoring Formula:**
 184→
 185→```
 186→Total_Score = (Proximity_Score × 0.40) + (Skill_Score × 0.35) + (Availability_Score × 0.25)
 187→```
 188→
 189→**Factor definitions:**
 190→
 191→| Factor | Weight | Score Logic | Score Range |
 192→|---|---|---|---|
 193→| Location Proximity | 40% | Exact zone match = 100; same state/district = 75; adjacent zone = 50; different state = 25 | 0–100 |
 194→| Skill/Certification Match | 35% | Exact certification for service_type = 100; multiple relevant certs = 100; partial match (related cert) = 60; no cert match = 0 | 0–100 |
 195→| Availability Status | 25% | `available` = 100; `on_assignment` = 50; `on_leave` = 0 | 0–100 |
 196→
 197→**Scoring example (3 candidates):**
 198→
 199→| Caregiver | Zone | Certifications | Status | Proximity (×0.40) | Skill (×0.35) | Availability (×0.25) | **Total** |
 200→|---|---|---|---|---|---|---|---|
 201→| CG-003 (Aisha) | Cheras, KL | Nursing, CPR, Wound Care | available | 100×0.40=40 | 100×0.35=35 | 100×0.25=25 | **100.0** |
 202→| CG-007 (Mei Ling) | Bukit Jalil, KL | Nursing, Geriatric Care | available | 75×0.40=30 | 100×0.35=35 | 100×0.25=25 | **90.0** |
 203→| CG-012 (Raj) | Petaling Jaya, Selangor | Nursing, Physiotherapy | available | 50×0.40=20 | 100×0.35=35 | 100×0.25=25 | **80.0** |
 204→
 205→**Selection rule:** The agent selects the **top 3** candidates by total score (descending). If fewer than 3 candidates exist, all available candidates are presented. Candidates scoring below 50.0 are excluded and the user is notified that the match pool is limited.
 206→
 207→**Handoff payload to DocumentGeneratorAgent:**
 208→
 209→```json
 210→{
 211→  "intake_id": "INT-20261010-001",
 212→  "entities": { "...": "Step A entities object" },
 213→  "matched_candidates": [
 214→    {
 215→      "rank": 1,
 216→      "caregiver_id": "CG-003",
 217→      "name": "Aisha binti Rahman",
 218→      "certifications": "Nursing, CPR, Wound Care",
 219→      "primary_zone": "Cheras, Kuala Lumpur",
 220→      "hourly_rate_myr": 28.00,
 221→      "total_score": 100.0
 222→    }
 223→  ],
 224→  "selected_caregiver_id": "CG-003",
 225→  "pricing_source": "D:/WorkBuddy/Claw/CareKaki_Pro/data/pricing_matrix.json"
 226→}
 227→```
 228→
 229→### 1.6 Step D: Workspace Asset Generation
 230→
 231→The DocumentGeneratorAgent receives the handoff payload and generates three output assets:
 232→
 233→| Asset | Template Source | Output Path | Format |
 234→|---|---|---|---|
 235→| Client Quotation | `/templates/client_quotation_template.md` | `/outputs/quotations/QT-{YYYYMMDD}-{NNN}.md` | Markdown |
 236→| Caregiver Job Order | `/templates/caregiver_job_order_template.md` | `/outputs/job_orders/JO-{YYYYMMDD}-{NNN}.md` | Markdown |
 237→| WhatsApp Dispatch Message | (inline generation) | `/outputs/dispatch_messages/WA-{NNN}.txt` | Plain text |
 238→
 239→**Pricing calculation flow:**
 240→
 241→1. Load `pricing_matrix.json` via the Read tool.
 242→2. Retrieve the `base_rate` for the matched `service_type` (e.g., `nursing` = RM 25.00/hour).
 243→3. Check the caregiver's `hourly_rate_myr` from the roster — use the higher of (base_rate, caregiver_rate) as the billable rate.
 244→4. Apply surcharges: night shift (after 10 PM), weekend, public holiday.
 245→5. Calculate: `subtotal = billable_rate × duration_hours × number_of_days`
 246→6. Apply SST: `sst_amount = subtotal × 0.08`
 247→7. Compute: `total = subtotal + sst_amount`
 248→
 249→---
 250→
 251→## 2. Workspace Directory & Data Schemas
 252→
 253→### 2.1 Directory Structure
 254→
 255→```
 256→D:/WorkBuddy/Claw/CareKaki_Pro/
 257→│
 258→├── /data/
 259→│   ├── staff_roster.csv              # Master caregiver roster (CSV)
 260→│   └── pricing_matrix.json           # Service rates and surcharge rules (JSON)
 261→│
 262→├── /templates/
 263→│   ├── client_quotation_template.md   # Quotation rendering template
 264→│   └── caregiver_job_order_template.md # Job order rendering template
 265→│
 266→├── /outputs/
 267→│   ├── /quotations/                  # Generated client quotations
 268→│   ├── /job_orders/                   # Generated caregiver job orders
 269→│   └── /dispatch_messages/           # Generated WhatsApp dispatch copies
 270→│
 271→└── /skills/
 272→    ├── /IntakeAndMatchAgent/
 273→    │   └── SKILL.md                   # Skill definition with system prompt
 274→    └── /DocumentGeneratorAgent/
 275→        └── SKILL.md                   # Skill definition with system prompt
 276→```
 277→
 278→### 2.2 staff_roster.csv — Schema & Mock Data
 279→
 280→**Field Definitions:**
 281→
 282→| Field | Type | Description | Constraints |
 283→|---|---|---|---|
 284→| `caregiver_id` | string | Unique identifier (format: `CG-###`) | Primary key, non-null |
 285→| `name` | string | Full legal name | Non-null |
 286→| `certifications` | string (pipe-delimited) | Qualifications held | At least one required |
 287→| `primary_zone` | string | Primary service area (Malaysian city/state) | Non-null |
 288→| `hourly_rate_myr` | decimal | Standard hourly rate in MYR | > 0, max 2 decimal places |
 289→| `availability_status` | enum | Current availability | `available`, `on_assignment`, `on_leave` |
 290→
 291→**Mock data (10 sample rows):**
 292→
 293→```csv
 294→caregiver_id,name,certifications,primary_zone,hourly_rate_myr,availability_status
 295→CG-001,Siti Nurhaliza binti Ibrahim,Nursing|CPR|Dementia Care,Kuala Lumpur,30.00,available
 296→CG-002,Tan Wei Ming,Home Care|CPR|First Aid,Petaling Jaya,22.00,available
 297→CG-003,Aisha binti Rahman,Nursing|CPR|Wound Care,Cheras,28.00,available
 298→CG-004,Leong Chee Kwong,Transport|First Aid|Wheelchair Cert,Shah Alam,18.00,on_assignment
 299→CG-005,Mahalakshmi a/p Subramaniam,Nursing|Geriatric Care|CPR,Ipoh,26.00,available
 300→CG-006,Nurul Huda binti Abdullah,Home Care|Companionship|CPR,Klang,20.00,available
 301→CG-007,Mei Ling Tan,Nursing|Geriatric Care,Bukit Jalil,27.00,available
 302→CG-008,Raj a/l Kumaran,Transport|First Aid|Wheelchair Cert,Penang,19.00,on_leave
 303→CG-009,Fatimah binti Yusof,Nursing|Palliative Care|CPR,Johor Bahru,32.00,available
 304→CG-010,Chong Siew Fang,Home Care|CPR|Dementia Care,Melaka,21.00,available
 305→CG-011,Balakrishnan a/l Raman,Home Care|Companionship,Seremban,17.00,available
 306→CG-012,Raj a/l Kumaran,Nursing|Physiotherapy,Petaling Jaya,29.00,available
 307→```
 308→
 309→### 2.3 pricing_matrix.json — Schema & Mock Values
 310→
 311→```json
 312→{
 313→  "version": "1.0",
 314→  "currency": "MYR",
 315→  "last_updated": "2026-10-10",
 316→  "service_base_rates": {
 317→    "home_care": {
 318→      "base_hourly_rate": 22.00,
 319→      "description": "General home care assistance — daily living, meal prep, light housekeeping"
 320→    },
 321→    "nursing": {
 322→      "base_hourly_rate": 25.00,
 323→      "description": "Certified nursing care — medication admin, wound dressing, vitals monitoring"
 324→    },
 325→    "transport": {
 326→      "base_hourly_rate": 18.00,
 327→      "description": "Patient transport — medical appointments, hospital discharge transfers"
 328→    },
 329→    "companionship": {
 330→      "base_hourly_rate": 16.00,
 331→      "description": "Companionship and social support — conversation, accompaniment, errands"
 332→    }
 333→  },
 334→  "surcharges": {
 335→    "night_shift": {
 336→      "applies_after": "22:00",
 337→      "applies_before": "06:00",
 338→      "multiplier": 1.50,
 339→      "description": "50% surcharge on base rate for night shift hours"
 340→    },
 341→    "weekend": {
 342→      "days": ["Saturday", "Sunday"],
 343→      "multiplier": 1.25,
 344→      "description": "25% surcharge on base rate for weekend shifts"
 345→    },
 346→    "public_holiday": {
 347→      "multiplier": 2.00,
 348→      "description": "100% surcharge on base rate for Malaysian public holidays",
 349→      "holiday_list_ref": "malaysia_public_holidays_2026.json"
 350→    }
 351→  },
 352→  "tax": {
 353→    "name": "SST",
 354→    "rate": 0.08,
 355→    "description": "Malaysian Sales and Service Tax at 8%"
 356→  },
 357→  "billing_rules": {
 358→    "minimum_shift_hours": 4,
 359→    "rounding": "2 decimal places",
 360→    "billable_rate_rule": "Use the higher of base_rate or caregiver_hourly_rate_myr"
 361→  }
 362→}
 363→```
 364→
 365→### 2.4 Client Quotation Template Schema
 366→
 367→**Template file:** `/templates/client_quotation_template.md`
 368→
 369→```markdown
 370→# CLIENT QUOTATION
 371→
 372→**Quotation ID:** {{quotation_id}}
 373→**Date Issued:** {{date_issued}}
 374→**Valid Until:** {{validity_period}}
 375→
 376→---
 377→
 378→## Client Details
 379→- **Client Name:** {{client_name}}
 380→- **Contact:** {{client_contact}}
 381→- **Service Address:** {{service_address}}
 382→
 383→## Service Summary
 384→- **Service Type:** {{service_type}}
 385→- **Assigned Caregiver:** {{caregiver_name}} ({{caregiver_id}})
 386→- **Certifications:** {{caregiver_certifications}}
 387→- **Shift Schedule:** {{shift_days}}, {{shift_start}}–{{shift_end}}
 388→- **Start Date:** {{start_date}}
 389→
 390→## Cost Breakdown
 391→
 392→| Item | Rate (MYR/hr) | Hours | Days | Subtotal (MYR) |
 393→|---|---|---|---|---|
 394→| {{line_item_description}} | {{rate}} | {{hours_per_day}} | {{num_days}} | {{line_subtotal}} |
 395→| {{surcharge_description}} | — | — | — | {{surcharge_amount}} |
 396→| **Subtotal** | | | | **{{subtotal}}** |
 397→| **SST (8%)** | | | | **{{sst_amount}}** |
 398→| **Total Payable** | | | | **{{total}}** |
 399→
 400→## Terms & Conditions
 401→1. Quotation valid for 7 days from issue date.
 402→2. Cancellation within 24 hours of shift start incurs 50% charge.
 403→3. Rates are inclusive of caregiver transport within primary zone.
 404→4. SST at 8% is applied per Malaysian tax regulations.
 405→
 406→**Prepared by:** CareKaki Pro Agentic System
 407→```
 408→
 409→### 2.5 Caregiver Job Order Template Schema
 410→
 411→**Template file:** `/templates/caregiver_job_order_template.md`
 412→
 413→```markdown
 414→# CAREGIVER JOB ORDER
 415→
 416→**Job Order ID:** {{job_order_id}}
 417→**Date Issued:** {{date_issued}}
 418→
 419→---
 420→
 421→## Caregiver Assignment
 422→- **Caregiver:** {{caregiver_name}} ({{caregiver_id}})
 423→- **Certifications:** {{caregiver_certifications}}
 424→
 425→## Patient/Client Details
 426→- **Client Name:** {{client_name}}
 427→- **Patient Condition:** {{patient_conditions}}
 428→- **Service Address:** {{service_address}}
 429→
 430→## Shift Schedule
 431→- **Days:** {{shift_days}}
 432→- **Hours:** {{shift_start}}–{{shift_end}} ({{duration_hours}} hours/day)
 433→- **Start Date:** {{start_date}}
 434→- **Expected Duration:** {{expected_duration}}
 435→
 436→## Special Instructions
 437→{{special_instructions}}
 438→
 439→## Equipment Needed
 440→{{equipment_list}}
 441→
 442→## Emergency Contacts
 443→1. {{emergency_contact_1_name}} — {{emergency_contact_1_phone}} ({{emergency_contact_1_relation}})
 444→2. {{emergency_contact_2_name}} — {{emergency_contact_2_phone}} ({{emergency_contact_2_relation}})
 445→
 446→## Patient Care Checklist
 447→- [ ] Confirm patient identity on arrival
 448→- [ ] Review patient condition and care plan
 449→- [ ] Administer scheduled medications (if applicable)
 450→- [ ] Monitor and record vitals
 451→- [ ] Assist with mobility and transfers
 452→- [ ] Document shift report before departure
 453→
 454→**Generated by:** CareKaki Pro Agentic System
 455→```
 456→
 457→---
 458→
 459→## 3. Custom WorkBuddy Skill / Agent Configuration
 460→
 461→### 3.1 IntakeAndMatchAgent — SKILL.md
 462→
 463→**File path:** `/skills/IntakeAndMatchAgent/SKILL.md`
 464→
 465→```yaml
 466→---
 467→name: IntakeAndMatchAgent
 468→description: >
 469→  Handles client lead intake for care agencies. Parses natural language
 470→  requests to extract service type, location, shift hours, and patient
 471→  conditions. Queries the local staff roster CSV via Sheet Agent tools,
 472→  scores candidates by proximity, skill match, and availability, and
 473→  selects the best caregiver for the assignment. This skill should be
 474→  used when a user submits a client care request, caregiver matching
 475→  request, or lead intake message in natural language.
 476→allowed-tools:
 477→  - Read
 478→  - Grep
 479→  - Glob
 480→  - mcp__sheetagent__read_table
 481→  - mcp__sheetagent__search_data
 482→  - mcp__sheetagent__get_cell_ranges
 483→disable: false
 484→agent_created: true
 485→---
 486→
 487→# IntakeAndMatchAgent
 488→
 489→## Purpose
 490→Receive a natural language client lead intake, extract structured
 491→entities, query the local staff roster, score and rank candidates, and
 492→produce a handoff payload for the DocumentGeneratorAgent.
 493→
 494→## Trigger Conditions
 495→Activate this skill when the user's message contains any of the
 496→following patterns:
 497→- A request for a caregiver, nurse, or care worker (service request)
 498→- A mention of a patient, elderly person, or care recipient
 499→- A location reference (Malaysian city, area, or state)
 500→- A shift or schedule description (hours, days, time ranges)
 501→- The phrase "I need", "looking for", "can you find", "match", or
 502→  "intake" in the context of care services
 503→
 504→## Workflow
 505→
 506→### Step 1: Entity Extraction
 507→Parse the natural language input and extract the following mandatory
 508→entities. If any slot is missing or ambiguous, re-prompt the user with
 509→a structured question listing only the missing fields.
 510→
 511→| Entity | Extraction Rule |
 512→|---|---|
 513→| service_type | Map keywords to enum: "nurse/nursing" → nursing, "home help/assist" → home_care, "transport/pickup" → transport, "companion/sit with" → companionship |
 514→| location | Extract Malaysian place names. Resolve to a canonical zone (state-level). |
 515→| shift_hours | Parse time ranges (8am-4pm, 08:00-16:00) and day lists (Mon-Fri, weekdays, weekends). |
 516→| patient_conditions | Extract any medical or mobility context as free text. |
 517→| start_date | Resolve relative dates ("next Monday", "tomorrow") to ISO 8601 using current date. |
 518→
 519→### Step 2: Roster Query
 520→Call `mcp__sheetagent__read_table` to load the roster file at:
 521→`D:/WorkBuddy/Claw/CareKaki_Pro/data/staff_roster.csv`
 522→
 523→Then call `mcp__sheetagent__search_data` with filters:
 524→- `primary_zone` contains the resolved zone
 525→- `certifications` contains the service-type-mapped certification keyword
 526→- `availability_status` equals "available"
 527→
 528→If the roster file is not found, follow the fallback rules in Section 4.
 529→
 530→### Step 3: Scoring & Ranking
 531→Apply the scoring formula:
 532→```
 533→Total = (Proximity × 0.40) + (Skill × 0.35) + (Availability × 0.25)
 534→```
 535→Rank candidates descending. Select top 3. Exclude any scoring below 50.0.
 536→
 537→### Step 4: Handoff
 538→Construct the JSON handoff payload (see Section 1.5) and delegate to the
 539→DocumentGeneratorAgent skill for document rendering.
 540→
 541→## Constraints
 542→1. MUST NOT proceed to roster search until all 5 entity slots are filled.
 543→2. MUST NOT hallucinate caregiver data — all caregiver information must
 544→   come from the roster file query results.
 545→3. MUST NOT modify the staff_roster.csv file — this skill is read-only
 546→   with respect to roster data.
 547→4. MUST present the selected candidate(s) to the user for confirmation
 548→   before handoff to document generation.
 549→5. MUST include the pricing_matrix.json file path in the handoff payload
 550→   so the DocumentGeneratorAgent can load pricing data.
 551→6. If no candidates match after fallback expansion, MUST report the gap
 552→   to the user with a clear explanation and suggested alternatives.
 553→```
 554→
 555→### 3.2 DocumentGeneratorAgent — SKILL.md
 556→
 557→**File path:** `/skills/DocumentGeneratorAgent/SKILL.md`
 558→
 559→```yaml
 560→---
 561→name: DocumentGeneratorAgent
 562→description: >
 563→  Renders formatted operational documents for care agency operations.
 564→  Generates client quotations, caregiver job orders, and WhatsApp
 565→  dispatch messages from a handoff payload provided by the
 566→  IntakeAndMatchAgent. Reads pricing data from pricing_matrix.json,
 567→  loads markdown templates, performs cost calculations, and writes
 568→  validated output files to the /outputs/ directory. This skill
 569→  should be used when document generation is needed after caregiver
 570→  matching has been completed.
 571→allowed-tools:
 572→  - Read
 573→  - Write
 574→  - Edit
 575→  - Glob
 576→disable: false
 577→agent_created: true
 578→---
 579→
 580→# DocumentGeneratorAgent
 581→
 582→## Purpose
 583→Receive a handoff payload from IntakeAndMatchAgent containing matched
 584→caregiver data and extracted entities. Load pricing data, compute costs,
 585→render templates, validate outputs against schemas, and write all
 586→documents to the /outputs/ directory.
 587→
 588→## Trigger Conditions
 589→Activate this skill when:
 590→- The IntakeAndMatchAgent has completed matching and produced a
 591→  handoff payload
 592→- The user explicitly requests document generation (quotation, job
 593→  order, or dispatch message)
 594→- The user says "generate", "create", "produce", or "make" in the
 595→  context of quotations, invoices, or job orders
 596→
 597→## Workflow
 598→
 599→### Step 1: Load Handoff Payload
 600→Read the JSON handoff payload containing:
 601→- Extracted entities (service_type, location, shift_hours, etc.)
 602→- Matched candidate list with the selected caregiver_id
 603→- Intake ID and timestamp
 604→- Pricing source file path
 605→
 606→### Step 2: Load Pricing Data
 607→Read `D:/WorkBuddy/Claw/CareKaki_Pro/data/pricing_matrix.json`.
 608→Extract:
 609→- Base rate for the service_type
 610→- Caregiver hourly rate from handoff payload
 611→- Apply billable_rate_rule: max(base_rate, caregiver_rate)
 612→- Check for applicable surcharges (night, weekend, holiday)
 613→
 614→### Step 3: Compute Costs
 615→```
 616→billable_rate = max(base_rate, caregiver_hourly_rate_myr)
 617→daily_subtotal = billable_rate × hours_per_day
 618→surcharge_amount = daily_subtotal × (surcharge_multiplier - 1) × applicable_days
 619→subtotal = (daily_subtotal × num_days) + surcharge_amount
 620→sst_amount = subtotal × 0.08
 621→total = subtotal + sst_amount
 622→```
 623→
 624→### Step 4: Render Templates
 625→Read template files from `/templates/`:
 626→- `client_quotation_template.md`
 627→- `caregiver_job_order_template.md`
 628→
 629→Replace all `{{placeholder}}` tokens with computed values. Generate
 630→output filenames:
 631→- Quotation: `QT-{YYYYMMDD}-{NNN}.md`
 632→- Job Order: `JO-{YYYYMMDD}-{NNN}.md`
 633→- WhatsApp: `WA-{NNN}.txt`
 634→
 635→Where {NNN} is a zero-padded sequence number based on existing files
 636→in the output directory.
 637→
 638→### Step 5: Generate WhatsApp Dispatch Message
 639→Compose a plain-text WhatsApp message for the selected caregiver:
 640→```
 641→Hello {{caregiver_name}},
 642→
 643→You have been assigned a new care assignment:
 644→
 645→Client: {{client_name}}
 646→Location: {{service_address}}
 647→Service Type: {{service_type}}
 648→Patient Condition: {{patient_conditions}}
 649→Shift: {{shift_days}}, {{shift_start}}-{{shift_end}}
 650→Start Date: {{start_date}}
 651→
 652→Please confirm your availability by replying to this message.
 653→
 654→Job Order ID: {{job_order_id}}
 655→```
 656→
 657→### Step 6: Validate & Write
 658→Validate each generated document against its schema (Section 4).
 659→Write validated files to the appropriate /outputs/ subdirectory.
 660→
 661→## Constraints
 662→1. MUST NOT compute any price value from memory — all rates must come
 663→   from pricing_matrix.json or the roster handoff.
 664→2. MUST validate all template placeholders are replaced before writing
 665→   — no `{{}}` tokens may remain in the output.
 666→3. MUST NOT write files outside the /outputs/ directory tree.
 667→4. MUST apply SST at exactly 0.08 (8%) — this is non-configurable.
 668→5. MUST ensure WhatsApp message length does not exceed 4096 characters.
 669→6. MUST generate unique filenames using timestamp + sequence number.
 670→```
 671→
 672→### 3.3 Agent Handoff Protocol
 673→
 674→The two agents communicate via a structured JSON payload. The IntakeAndMatchAgent produces the payload and the DocumentGeneratorAgent consumes it.
 675→
 676→**Handoff payload schema:**
 677→
 678→```json
 679→{
 680→  "handoff_version": "1.0",
 681→  "intake_id": "string (INT-YYYYMMDD-NNN)",
 682→  "timestamp": "ISO 8601",
 683→  "entities": {
 684→    "service_type": "enum",
 685→    "location": "string",
 686→    "location_zone": "string (canonical zone)",
 687→    "shift_hours": {
 688→      "start": "HH:MM",
 689→      "end": "HH:MM",
 690→      "duration_hours": "number",
 691→      "days": ["string"]
 692→    },
 693→    "patient_conditions": "string",
 694→    "start_date": "YYYY-MM-DD"
 695→  },
 696→  "matched_candidates": [
 697→    {
 698→      "rank": "number",
 699→      "caregiver_id": "string",
 700→      "name": "string",
 701→      "certifications": "string",
 702→      "primary_zone": "string",
 703→      "hourly_rate_myr": "number",
 704→      "total_score": "number"
 705→    }
 706→  ],
 707→  "selected_caregiver_id": "string",
 708→  "pricing_source": "absolute path to pricing_matrix.json",
 709→  "roster_source": "absolute path to staff_roster.csv"
 710→}
 711→```
 712→
 713→---
 714→
 715→## 4. Error Handling & Quality Assurance
 716→
 717→### 4.1 Deterministic Fallback Rules
 718→
 719→The following table defines fallback behavior for each known data gap or edge case. These rules ensure the system degrades gracefully rather than failing silently.
 720→
 721→| Scenario | Trigger Condition | Fallback Action | User Notification |
 722→|---|---|---|---|
 723→| No exact geographic match | Roster search returns 0 rows for the requested zone | Expand search to adjacent zones (e.g., Cheras → Kuala Lumpur state → Selangor border areas). Re-run search with broadened zone filter. | "No caregivers found in {{original_zone}}. Expanded search to adjacent zones: {{expanded_zones}}." |
 724→| Missing price variable | `pricing_matrix.json` is missing or the service_type key is absent | Use a hardcoded fallback base rate table embedded in the skill's reference file. Flag the quotation with `[PRICING-REVIEW]` tag. | "Pricing data file was incomplete. Quotation uses fallback rates. Please verify before sending to client." |
 725→| Ambiguous dates | User says "soon", "ASAP", or gives an unresolvable relative date | Re-prompt the user with a structured question: "Please specify the preferred start date. Options: (1) This Monday {{date}}, (2) Next Monday {{date}}, (3) Specific date." | Inline re-prompt in conversation. |
 726→| Roster file not found | `staff_roster.csv` does not exist at the expected path | Halt the workflow. Return a clear error message with the expected path and instructions to create the file. | "Staff roster file not found at {{expected_path}}. Please create the file with the required schema before retrying." |
 727→| No available caregivers | All matched caregivers have `availability_status` != "available" | Present the closest unavailable candidates with their status. Offer to add the client to a waitlist. Suggest alternate zones. | "No caregivers currently available in {{zone}} for {{service_type}}. Nearest candidates (unavailable): {{list}}. Would you like to be added to the waitlist?" |
 728→| Low confidence entity extraction | One or more entity slots cannot be confidently parsed from the input | Do NOT proceed to roster search. Re-prompt the user listing only the missing/ambiguous fields. | "I need clarification on the following: {{missing_fields}}. Please provide these details." |
 729→| Caregiver rate higher than base rate | `caregiver.hourly_rate_myr` > `base_rate` from pricing matrix | Use the caregiver's rate as the billable rate (per `billable_rate_rule`). No error — this is expected behavior. | (No notification needed — noted in quotation cost breakdown.) |
 730→| Shift spans night shift boundary | Shift end time is after 22:00 | Apply night shift surcharge (1.5×) only to hours after 22:00. Split the line item into regular and night-shift portions. | (Reflected in quotation line items.) |
 731→| Duplicate quotation ID | Filename collision detected in /outputs/quotations/ | Auto-increment the sequence number ({NNN}) until a unique filename is found. | (Silent — no user notification needed.) |
 732→| WhatsApp message exceeds 4096 chars | Generated dispatch message is too long | Truncate patient conditions field to a summary. Append "... (see job order {{job_order_id}} for full details)". | (Silent — truncation noted in output.) |
 733→
 734→### 4.2 Validation Checks
 735→
 736→The following validation checks run automatically before any output file is written. If a check fails, the file is NOT written and the error is reported.
 737→
 738→| Check ID | Validation Rule | Implementation | Failure Action |
 739→|---|---|---|---|
 740→| VAL-01 | Quotation total = subtotal + SST | `assert(total == round(subtotal × 1.08, 2))` | Recalculate and re-render. If mismatch persists, abort and report. |
 741→| VAL-02 | All job order fields populated | Check that no `{{placeholder}}` tokens remain in rendered template. | Identify missing fields, log them, abort write. |
 742→| VAL-03 | WhatsApp message ≤ 4096 characters | `len(message) <= 4096` | Truncate per fallback rule. |
 743→| VAL-04 | caregiver_id exists in roster | Cross-reference selected caregiver_id against roster rows loaded in Step B. | Abort job order generation. Report that the caregiver ID is not in the roster. |
 744→| VAL-05 | Output filename uniqueness | Glob the target directory for existing files matching the naming pattern. | Auto-increment sequence number. |
 745→| VAL-06 | Pricing calculation uses real data | Verify that `billable_rate` was sourced from either `pricing_matrix.json` or the roster handoff — not from a model-generated value. | Abort and flag for manual review. |
 746→| VAL-07 | Date format is ISO 8601 | Validate `start_date` matches `YYYY-MM-DD` pattern. | Re-format or re-prompt user. |
 747→| VAL-08 | Shift hours are valid time ranges | Validate `shift_start` < `shift_end` and both are `HH:MM` format. | Abort and report invalid shift specification. |
 748→| VAL-09 | SST rate is exactly 8% | `assert(sst_rate == 0.08)` | Hard stop — this is a regulatory constant. |
 749→| VAL-10 | Minimum shift hours satisfied | `duration_hours >= 4` (per `billing_rules.minimum_shift_hours`). | Apply minimum billing (4 hours) and note in quotation. |
 750→
 751→### 4.3 Quality Assurance Process
 752→
 753→```
 754→┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 755→│  Document     │     │  Schema      │     │  Cross-Ref   │     │  Final       │
 756→│  Rendered     │────▶│  Validation  │────▶│  Validation  │────▶│  Write to    │
 757→│  (in memory)  │     │  (VAL-02,    │     │  (VAL-01,    │     │  /outputs/   │
 758→└──────────────┘     │   VAL-03)   │     │   VAL-04,    │     └──────────────┘
 759→                     └──────────────┘     │   VAL-06)   │
 760→                          │ PASS           └──────────────┘
 761→                          ▼                       │ PASS
 762→                     ┌──────────────┐             ▼
 763→                     │  FAIL →      │     ┌──────────────┐
 764→                     │  Abort +     │     │  FAIL →      │
 765→                     │  Report      │     │  Abort +     │
 766→                     └──────────────┘     │  Report      │
 767→                                          └──────────────┘
 768→```
 769→
 770→---
 771→
 772→## 5. 24-Hour Development Roadmap
 773→
 774→### 5.1 Sprint Overview
 775→
 776→| Phase | Hours | Focus | Team Size | Key Deliverable |
 777→|---|---|---|---|---|
 778→| Phase 1 | Hours 1–4 | Environment & Data | 1 Engineer | Workspace scaffold + data files |
 779→| Phase 2 | Hours 5–12 | Agent Configuration | 1 Engineer + 1 Prompt Engineer | 2 SKILL.md files with system prompts |
 780→| Phase 3 | Hours 13–18 | Testing & Fallbacks | 1 QA Engineer | Test report + fallback validation |
 781→| Phase 4 | Hours 19–24 | E2E Integration & Polish | Full team | Production-ready workspace |
 782→
 783→### 5.2 Phase 1: Environment Setup, Workspace Data Creation & CSV Schemas (Hours 1–4)
 784→
 785→| Hour Block | Task | Output |
 786→|---|---|---|
 787→| H1 | Create directory structure (`/data`, `/templates`, `/outputs/`, `/skills/`) | Empty directory tree |
 788→| H2 | Create `staff_roster.csv` with 12 mock caregiver rows (Section 2.2 schema) | `data/staff_roster.csv` |
 789→| H3 | Create `pricing_matrix.json` with base rates and surcharge rules (Section 2.3 schema) | `data/pricing_matrix.json` |
 790→| H4 | Create template files: `client_quotation_template.md` and `caregiver_job_order_template.md` | `templates/` directory populated |
 791→
 792→**Acceptance Criteria:**
 793→- [ ] All directories exist with correct naming
 794→- [ ] `staff_roster.csv` opens in Sheet Agent with correct headers
 795→- [ ] `pricing_matrix.json` parses as valid JSON
 796→- [ ] Templates contain all `{{placeholder}}` tokens matching the schema
 797→
 798→**Risk Notes:** Verify CSV encoding is UTF-8 to handle Malaysian names with special characters. Ensure no BOM in CSV header row.
 799→
 800→### 5.3 Phase 2: Prompt Engineering, Sub-Agent System Prompts & Tool Calling Rules (Hours 5–12)
 801→
 802→| Hour Block | Task | Output |
 803→|---|---|---|
 804→| H5–H6 | Author `IntakeAndMatchAgent/SKILL.md` — YAML frontmatter, system prompt, trigger conditions, workflow steps, constraints | Draft SKILL.md |
 805→| H7–H8 | Define tool calling rules — specify exact `mcp__sheetagent__read_table` and `mcp__sheetagent__search_data` invocation patterns. Test against the mock roster. | Verified tool call sequences |
 806→| H9–H10 | Author `DocumentGeneratorAgent/SKILL.md` — YAML frontmatter, system prompt, template rendering workflow, pricing calculation logic | Draft SKILL.md |
 807→| H11 | Define handoff protocol — JSON payload schema (Section 3.3). Document the interface contract between agents. | Handoff schema document |
 808→| H12 | Prompt tuning pass — review both system prompts for completeness, edge-case coverage, and instruction clarity. Remove ambiguity. | Finalized SKILL.md files |
 809→
 810→**Acceptance Criteria:**
 811→- [ ] IntakeAndMatchAgent triggers on a sample intake message
 812→- [ ] Entity extraction produces all 5 slots from a test input
 813→- [ ] Sheet Agent tools successfully query the mock roster
 814→- [ ] DocumentGeneratorAgent loads pricing_matrix.json and computes a correct total
 815→- [ ] Handoff payload is well-formed JSON
 816→
 817→**Risk Notes:** System prompt length should stay under 5000 words (per WorkBuddy skill guidelines). Move detailed reference material to `references/` files if the prompt exceeds this limit.
 818→
 819→### 5.4 Phase 3: Document Rendering Tests, Fallback Logic & Edge-Case Handling (Hours 13–18)
 820→
 821→| Hour Block | Task | Output |
 822→|---|---|---|
 823→| H13 | Test Case 1: Full happy-path flow — standard intake → match → quotation + job order + WhatsApp message | Test report TC-01 |
 824→| H14 | Test Case 2: No geographic match — trigger zone expansion fallback | Test report TC-02 |
 825→| H15 | Test Case 3: Missing entity — trigger re-prompt for missing slots | Test report TC-03 |
 826→| H16 | Test Case 4: Night shift spanning 22:00 boundary — verify surcharge splitting | Test report TC-04 |
 827→| H17 | Test Case 5: Roster file missing — verify error message and path guidance | Test report TC-05 |
 828→| H18 | Test Case 6: Low-confidence extraction + ambiguous dates — verify structured re-prompts | Test report TC-06 |
 829→
 830→**Test Case Template:**
 831→
 832→| Field | Value |
 833→|---|---|
 834→| Test ID | TC-XX |
 835→| Description | Brief description |
 836→| Input | Natural language or JSON input |
 837→| Expected Behavior | What should happen |
 838→| Actual Behavior | What actually happened |
 839→| Pass/Fail | Status |
 840→| Notes | Observations, edge cases discovered |
 841→
 842→**Acceptance Criteria:**
 843→- [ ] All 6 test cases produce expected behavior
 844→- [ ] All fallback rules from Section 4.1 are exercised at least once
 845→- [ ] No unhandled exceptions or silent failures
 846→- [ ] All validation checks (VAL-01 through VAL-10) are triggered and pass
 847→
 848→**Risk Notes:** Pay special attention to the night shift surcharge calculation — off-by-one hour errors are common at boundary conditions.
 849→
 850→### 5.5 Phase 4: End-to-End Workflow Testing, Prompt Tuning & Final Workspace Polish (Hours 19–24)
 851→
 852→| Hour Block | Task | Output |
 853→|---|---|---|
 854→| H19 | E2E Test Matrix — run 5 diverse intake scenarios through the complete pipeline from natural language input to generated files | E2E test results (5 scenarios) |
 855→| H20 | Prompt tuning — review agent outputs for tone, accuracy, and completeness. Adjust system prompts based on real output quality. | Updated SKILL.md files |
 856→| H21 | Output file audit — verify all generated files in `/outputs/` are valid, correctly named, and contain no template artifacts | Audit report |
 857→| H22 | Edge-case stress testing — test rapid sequential intakes, unusual patient conditions, multi-day shifts, and holiday surcharge scenarios | Stress test report |
 858→| H23 | Workspace polish — create a README.md for the workspace, document the directory structure, and add usage examples | `README.md` |
 859→| H24 | Final QA sign-off — run the full validation checklist, confirm all acceptance criteria met, document known limitations | Sign-off document |
 860→
 861→**E2E Test Scenarios:**
 862→
 863→| # | Scenario | Service Type | Location | Key Challenge |
 864→|---|---|---|---|---|
 865→| 1 | Post-surgery nursing care, weekday day shift | Nursing | Cheras, KL | Standard flow |
 866→| 2 | Elderly companionship, weekend, multi-week | Companionship | Penang | Weekend surcharge |
 867→| 3 | Hospital discharge transport, single day | Transport | Johor Bahru | Short assignment, transport cert |
 868→| 4 | Night nursing, overnight shift | Nursing | Ipoh | Night shift surcharge |
 869→| 5 | Home care with dementia patient, weekday + public holiday | Home Care | Melaka | Holiday surcharge |
 870→
 871→**Final QA Sign-off Checklist:**
 872→
 873→- [ ] All 5 E2E scenarios produce correct quotations, job orders, and WhatsApp messages
 874→- [ ] All output files are written to correct `/outputs/` subdirectories
 875→- [ ] All quotations have correct SST (8%) calculations
 876→- [ ] All job orders have all fields populated (no `{{}}` artifacts)
 877→- [ ] All WhatsApp messages are under 4096 characters
 878→- [ ] All fallback rules function correctly
 879→- [ ] Both SKILL.md files are syntactically valid with correct YAML frontmatter
 880→- [ ] `staff_roster.csv` and `pricing_matrix.json` are valid and queryable
 881→- [ ] No hardcoded prices outside `pricing_matrix.json`
 882→- [ ] README.md documents the workspace structure and usage
 883→
 884→**Risk Notes:** The final hour should include a buffer for unexpected prompt tuning iterations. If E2E tests reveal systematic issues, prioritize fixing root causes over adding new test cases.
 885→
 886→---
 887→
 888→## Appendix A: Malaysian Geographic Zone Reference
 889→
 890→| Zone (Canonical) | Covers | Adjacent Zones (for fallback) |
 891→|---|---|---|
 892→| Kuala Lumpur | KL city center, Cheras, Bukit Jalil, Wangsa Maju, Setapak | Selangor (Petaling Jaya, Shah Alam) |
 893→| Selangor | Petaling Jaya, Shah Alam, Klang, Subang, Kajang | Kuala Lumpur, Negeri Sembilan |
 894→| Penang | George Town, Bayan Lepas, Butterworth | Kedah, Perak (north) |
 895→| Johor | Johor Bahru, Iskandar Puteri, Skudai | Melaka, Pahang (east) |
 896→| Ipoh (Perak) | Ipoh, Taiping, Kampar | Penang, Selangor (south) |
 897→| Melaka | Melaka city, Alor Gajah, Batu Berendam | Johor, Negeri Sembilan |
 898→| Negeri Sembilan | Seremban, Port Dickson, Nilai | Selangor, Melaka |
 899→
 900→## Appendix B: Certification-to-Service-Type Mapping
 901→
 902→| Service Type | Required Certification Keywords | Bonus Certifications |
 903→|---|---|---|
 904→| `nursing` | "Nursing" | "CPR", "Wound Care", "Geriatric Care", "Palliative Care", "Dementia Care" |
 905→| `home_care` | "Home Care" | "CPR", "First Aid", "Dementia Care" |
 906→| `transport` | "Transport" | "First Aid", "Wheelchair Cert" |
 907→| `companionship` | "Companionship" or "Home Care" | "CPR", "First Aid" |
 908→
 909→---
 910→
 911→*This specification was generated as a technical blueprint for building CareKaki Pro inside the Tencent WorkBuddy platform. All data schemas, agent configurations, and workflows are designed to operate within the WorkBuddy workspace environment using native skill packages, Sheet Agent MCP tools, and workspace file operations.*
 912→