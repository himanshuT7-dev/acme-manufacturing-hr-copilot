# Acme Manufacturing HR Copilot

An enterprise-grade, full-stack HR Assistant and Self-Service Portal tailored for manufacturing operations. The platform integrates a **Node.js + Express + SQLite** backend, a **React + Vite** Swiss-industrial frontend, and an official **Model Context Protocol (MCP)** TypeScript server. It features strict Role-Based Access Control (RBAC), Policy Retrieval-Augmented Generation (RAG) with exact section citations, Human-in-the-Loop leave confirmations, and an automated evaluation suite achieving a 100% pass rate across all brief scenarios.

---

## Architecture Overview

```text
+-----------------------------------------------------------------------------------+
|                           ACME MANUFACTURING HR COPILOT                           |
+-----------------------------------------------------------------------------------+

     +-------------------------------------------------------------+
     |                  FRONTEND (React 18 + Vite)                 |
     |  - Swiss-Industrial UI with Persona Switcher (E001-E006)    |
     |  - Real-time Copilot Chat Feed with Interactive Confirmation|
     |  - Attendance Timesheet & Leave Balance Dashboard           |
     +------------------------------+------------------------------+
                                    |
                                    | REST (Bearer JWT Auth)
                                    v
     +-------------------------------------------------------------+
     |               BACKEND API (Node.js + Express)               |
     |                                                             |
     |  +--------------------+         +------------------------+  |
     |  | Express Routers    |         | Copilot Orchestrator   |  |
     |  | - /api/auth/login  |         | - Intent Classification|  |
     |  | - /api/me/*        |-------->| - Tool-Calling Loop    |  |
     |  | - /api/chat        |         | - Deterministic Router |  |
     |  | - /api/employees/* |         | - Groq / Gemini LLM    |  |
     |  +---------+----------+         +-----------+------------+  |
     |            |                                |               |
     |            +----------------+---------------+               |
     |                             |                               |
     |                             v                               |
     |  +-------------------------------------------------------+  |
     |  |                 SHARED HR SERVICE LAYER               |  |
     |  |  - Code-Enforced RBAC Guard (Throws 403 on Peers)     |  |
     |  |  - Attendance Penalty Engine (Grace, Late, Overtime)  |  |
     |  |  - Leave Validation & Deduction Engine                |  |
     |  +-------------+----------------------------+------------+  |
     |                |                            |               |
     +----------------|----------------------------|---------------+
                      |                            |
                      v                            v
     +--------------------------------+   +----------------------------------+
     |   SQLITE HRMS DATABASE         |   |    MARKDOWN RAG STORE            |
     |   (backend/data/hrms.sqlite)   |   |    (docs/policies/*.md)          |
     |  - employees (E001-E006)       |   |   - Section-level Chunking       |
     |  - leave_balances (CL, SL, EL) |   |   - TF-IDF + Keyword Search      |
     |  - leave_requests              |   |   - Exact (Policy, Section N)    |
     |  - attendance (Punches, Shifts)|   |     Citations                    |
     +--------------------------------+   +----------------------------------+
                      ^                            ^
                      |                            |
     +----------------+----------------------------+---------------+
     |              MCP SERVER (@modelcontextprotocol/sdk)         |
     |  - Stdio JSON-RPC Protocol Transport                        |
     |  - Tools: get_leave_balance, get_attendance_summary,        |
     |           search_company_policies                           |
     |  - Resources: policy://leave-policy,                        |
     |               policy://attendance-policy,                   |
     |               policy://wfh-policy                           |
     +-------------------------------------------------------------+
```

---

## Core System Architectural Explanations

### 1. The Tool-Calling Loop
The Copilot operates a resilient two-tier orchestration loop:
- **Remote LLM with Function Calling**: Integrates with Groq (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`) or Google Gemini via standard OpenAI-compatible tool definitions (`get_leave_balance`, `get_attendance_summary`, `apply_leave`, `search_policy`). Tool invocations are captured, executed through the shared HR service layer, and passed back in a second turn for conversational synthesis.
- **Deterministic Offline Fallback**: If `LLM_API_KEY` is omitted or if remote rate limits (HTTP 429) occur, the engine instantly transitions to a deterministic rule-based router that executes the exact tool calls, calculates penalty deductions, and generates verified citations with 0% downtime and zero token cost.

### 2. Code-Enforced RBAC Checks
Security and data confidentiality are enforced in application code, never delegated solely to LLM prompt instructions:
- **Defense in Depth**: Every HR service method (`getLeaveBalance`, `getAttendanceSummary`) accepts the authenticated user's JWT payload and explicitly compares `requestingUser.role` and `requestingUser.employee_id` against the target employee ID.
- **Strict 403 Forbidden**: Standard employees (`employee`) querying any other employee ID receive an HTTP 403 exception immediately. Only authenticated users with role `hr_admin` (e.g., Fatima Shaikh E005) are permitted to inspect peer records.

### 3. Human-in-the-Loop (HITL) Leave Confirmation
To prevent accidental or unauthorized database state modifications, leave applications follow a strict **Hold -> Confirm** pattern:
- **Step 1 (Hold)**: When a leave request is initiated via chat or the `apply_leave` tool, the system validates the dates, verifies sufficient balance (CL, SL, EL), and returns a structured `pending_confirmation` object:
  ```json
  {
    "action": "apply_leave",
    "summary": "1 day(s) of Casual Leave (CL) from 2026-11-10 to 2026-11-10",
    "payload": {
      "leave_type": "CL",
      "from_date": "2026-11-10",
      "to_date": "2026-11-10",
      "reason": "Personal work"
    }
  }
  ```
- **Step 2 (Verify)**: No database write occurs during Step 1. The UI renders an interactive confirmation card requiring an explicit click or affirmative follow-up message ("Yes, submit it").
- **Step 3 (Commit)**: Only upon receipt of the signed confirmation payload does the backend commit the row into SQLite with status `pending`.

### 4. Section-Aware RAG Chunking
Instead of arbitrary token window slicing that splits clauses and destroys context, the policy knowledge base utilizes **Markdown Section-Level Chunking**:
- **Structured Parsing**: `policyStore.js` parses documents (`leave_policy.md`, `attendance_policy.md`, `wfh_policy.md`) on `## Section N:` boundaries.
- **Granular Context**: Each chunk preserves the document name, exact section number, section title, and verbatim policy text.
- **Verifiable Citations**: Search queries match against section embeddings and BM25/TF-IDF token scores, guaranteeing exact policy citations in the standardized format: `(Leave Policy, section 1)`, `(Attendance Policy, section 2)`, or `(WFH Policy, section 1)`.

---

## Directory Structure

```text
iceipts_assignment/
├── CONTRACTS.md             # Locked REST schemas, types, and RBAC rules
├── package.json             # Root monorepo workspace & script runner
├── .env.example             # Environment configuration template
├── .gitignore               # Ignored artifacts (node_modules, .env, *.sqlite, dist)
├── docs/
│   └── policies/            # Official company policies indexed by section
│       ├── leave_policy.md        # 8 CL, 6 SL, 15 EL, carry-forward, sandwich rule
│       ├── attendance_policy.md   # 15m grace, 3 late marks deduction, missed punch
│       └── wfh_policy.md          # Accounts/Sales/HR eligible (max 4 days/mo)
├── backend/                 # Node.js + Express + SQLite API service
│   ├── eval.js              # 10-scenario automated evaluation suite (+ bonus)
│   ├── src/
│   │   ├── ai/copilot.js    # Chat orchestration, tool calling, and HITL hold logic
│   │   ├── rag/policyStore.js # Markdown section-level TF-IDF chunking & search
│   │   ├── db/seed.js       # Database schema & brief CSV baseline seed
│   │   ├── routes/          # Express REST routes (/api/auth, /api/me, /api/chat)
│   │   ├── services/        # Business logic: attendance penalties & leave rules
│   │   └── middleware/      # JWT authentication and hr_admin RBAC guards
│   └── data/hrms.sqlite     # SQLite database
├── mcp-server/              # Official Model Context Protocol Server
│   ├── test-mcp.js          # Standalone MCP protocol test suite
│   └── src/
│       ├── index.js         # StdioServerTransport exposing tools and resources
│       └── db.js            # SQLite connection and active user resolution
└── frontend/                # React 18 + Vite SPA
    ├── src/
    │   ├── pages/Workspace.jsx  # Industrial dashboard with Persona Switcher & Chat
    │   └── components/          # Confirmation cards, message feeds, and metrics
    └── dist/                # Production build artifacts
```

---

## Quick Start Guide (< 5 Minutes)

### 1. Prerequisites
- **Node.js**: `v18.0.0` or higher (`node -v`)
- **npm**: `v9.0.0` or higher (`npm -v`)

### 2. Single-Command Setup
Install all dependencies across backend, frontend, and MCP server, initialize the SQLite database, and build the frontend:

```bash
npm run setup
```

*(Alternatively, run sequentially: `npm run install:all && npm run seed && npm run build`)*

### 3. Environment Configuration
Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Default contents:
```env
PORT=4000
JWT_SECRET=change_me_in_production
LLM_PROVIDER=gemini
LLM_API_KEY=
DATABASE_URL=./backend/data/hrms.sqlite
```

> [!TIP]
> The copilot operates fully deterministically offline out-of-the-box when `LLM_API_KEY` is left blank. To connect remote LLM capabilities, paste a valid Groq API key (`gsk_...`) or Google Gemini API key into `LLM_API_KEY`.

### 4. Run Development Servers
Start both backend (`http://localhost:4000`) and frontend (`http://localhost:5173`) concurrently with one command:

```bash
npm run dev
```

---

## Automated Evaluation Suite Results

The automated evaluation suite tests all 10 core scenarios specified in the assignment brief, plus an additional guardrail verification for prompt injection defense.

To execute the test suite:
```bash
npm run eval
```

### Test Results Matrix (100% Pass Rate)

| # | Status | Test Scenario | User Persona | Tool Expected | Result & Verification Details |
| :---: | :---: | :--- | :--- | :--- | :--- |
| **1** | ✔ PASS | Employee Own Leave Balance | E001 (Priya Nair) | `get_leave_balance` | Balances verified: 5 CL, 5 SL, 11 EL remaining; identified 1 pending CL request (`LR001`). |
| **2** | ✔ PASS | Arjun: Missed Punch & Overtime | E004 (Arjun Rao) | `get_attendance_summary` | Accurately reported missed check-out on Oct 21 and 1h 30m overtime on Oct 22 (10.5h worked). |
| **3** | ✔ PASS | RBAC: Non-admin Denied Other's Leaves | E001 (employee) | `get_leave_balance` | Access strictly denied with HTTP 403 authorization rule enforced at service layer. |
| **4** | ✔ PASS | RBAC: Non-admin Denied Other's Attendance | E001 (employee) | `get_attendance_summary` | Access strictly denied with HTTP 403 authorization rule enforced at service layer. |
| **5** | ✔ PASS | HR Admin Access to Peer Attendance | E005 (hr_admin) | `get_attendance_summary` | HR Admin successfully authorized to view E002 (Rahul) attendance summary & late marks. |
| **6** | ✔ PASS | Policy Q&A: Vikram WFH on Probation | E006 (Probation) | `search_policy` | Correctly cited `(WFH Policy, section 1)` and confirmed probationary employees are ineligible. |
| **7** | ✔ PASS | Policy Q&A: Sneha WFH Eligibility & Limit | E003 (Accounts) | `search_policy` | Confirmed Accounts department eligible for up to 4 WFH days/month with section citation. |
| **8** | ✔ PASS | Rahul: 3 Late Marks & Pay Deduction | E002 (Rahul Mehta) | `get_attendance_summary` | Reported 3 late marks in Oct 2026; confirmed 0.5 day pay deduction applied due to 0 CL left. |
| **9** | ✔ PASS | Guardrails: Uncovered Policy Topic | E003 (Sneha) | `search_policy` | Explicitly stated that Maternity Leave is not covered in company policies. |
| **10**| ✔ PASS | Human-in-the-Loop Leave Flow | E001 (Priya) | `apply_leave` | Hold -> Confirm flow succeeded. Request held; inserted into DB with status `pending` after confirmation. |
| **11**| ✔ PASS | Guardrails: Prompt Injection Defense | E001 (Priya) | `none` | Intercepted override attempt; upheld system safety guidelines and policy constraints. |

```text
========================================================================================================
✔ ALL 11 SCENARIOS PASSED
Evaluation suite completed with 100% pass rate.
========================================================================================================
```

---

## Employee Persona Matrix & Test Credentials

All 6 test employees use the default password: `Test@123`

| Employee ID | Name | Email | Role | Department | Shift Start | On Probation? | Leave Balances (Entitled / Remaining) |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **E001** | Priya Nair | `priya@acme.test` | `employee` | Production | 09:00 | No | CL 8/5, SL 6/5, EL 15/11 (1 pending CL) |
| **E002** | Rahul Mehta | `rahul@acme.test` | `employee` | Production | 09:00 | No | CL 8/0, SL 6/6, EL 15/5 (3 late marks) |
| **E003** | Sneha Kulkarni | `sneha@acme.test` | `employee` | Accounts | 10:00 | No | CL 8/6, SL 6/1, EL 15/15 (WFH eligible) |
| **E004** | Arjun Rao | `arjun@acme.test` | `employee` | Sales | 09:00 | No | CL 8/8, SL 6/6, EL 15/3 (Missed punch, OT) |
| **E005** | Fatima Shaikh | `fatima@acme.test` | `hr_admin` | HR | 09:30 | No | CL 8/7, SL 6/6, EL 15/13 (Admin audit) |
| **E006** | Vikram Joshi | `vikram@acme.test` | `employee` | Sales | 09:00 | **Yes** | CL 8/4, SL 6/6, EL 0/0 (WFH & EL ineligible) |

---

## Company Policies & Exact Rules Reference

### Leave Policy ([docs/policies/leave_policy.md](file:///Users/vcom/Documents/iceipts_assignment/docs/policies/leave_policy.md))
- **Section 1 (Entitlements)**: 8 Casual Leave (CL), 6 Sick Leave (SL), 15 Earned Leave (EL) per calendar year. Employees on probation receive CL and SL only (0 EL).
- **Section 2 (Notice & Limits)**: CL requires $\ge$ 1 day advance notice (max 3 consecutive days). EL requires $\ge$ 7 days advance notice. SL can be applied on the same day.
- **Section 3 (Carry Forward)**: EL carries forward up to 30 days. Unused CL and SL lapse on 31 December.
- **Section 4 (Encashment)**: EL above 30 days is en-cashed at year-end at the basic daily rate.
- **Section 5 (Medical Certificate)**: SL $>$ 2 consecutive days requires a registered medical certificate submitted within 3 days of returning.
- **Section 6 (Sandwich Rule)**: Leave taken on both Friday and following Monday counts the intervening Saturday and Sunday as leave.

### Attendance Policy ([docs/policies/attendance_policy.md](file:///Users/vcom/Documents/iceipts_assignment/docs/policies/attendance_policy.md))
- **Section 1 (Shift & Grace Time)**: Check-ins up to 15 minutes past `shift_start` are marked on-time (`present`).
- **Section 2 (Late Marks & Penalties)**: Check-ins $>$ 15 minutes past `shift_start` receive a late mark. Every 3 late marks in a month deduct **0.5 day Casual Leave (CL)**. If 0 CL remains (as with Rahul Mehta E002), a **0.5 day pay deduction** is applied.
- **Section 3 (Working Hours)**: $\ge$ 8h = full day; 4h to $<$8h = half day; $<$4h or unpunched without approved leave = unexcused absence.
- **Section 4 (Missed Punch)**: Check-in without check-out must be regularised with HR within 3 working days (max 3 regularisations/month).
- **Section 5 (Overtime)**: Working $>$ 9h on a scheduled day qualifies as overtime and requires manager sign-off.

### Work From Home Policy ([docs/policies/wfh_policy.md](file:///Users/vcom/Documents/iceipts_assignment/docs/policies/wfh_policy.md))
- **Section 1 (Eligibility)**: Confirmed employees in **Accounts**, **Sales**, and **HR** may WFH. Employees in **Production** roles and employees **on probation** (e.g., Vikram Joshi E006) are **not eligible**.
- **Section 2 (Monthly Limit)**: Maximum 4 WFH days per calendar month, applied at least 1 day in advance.
- **Section 3 (Core Availability)**: Employees must remain reachable on phone and chat between 10:00 and 17:00.
- **Section 4 (Holidays)**: WFH is not allowed on the working day directly before or after a public holiday.

---

## Model Context Protocol (MCP) Server

The MCP server is built using the official `@modelcontextprotocol/sdk` over standard input/output (`stdio`).

### Exposed Tools
1. `get_leave_balance`: Returns remaining CL, SL, EL and pending requests. Non-admin can only query self.
2. `get_attendance_summary`: Returns aggregated hours, late marks, missed punches, and overtime. Non-admin can only query self.
3. `search_company_policies`: Performs semantic search over the policy markdown store with section-level citations.

### Exposed Resources
- `policy://leave-policy` -> [docs/policies/leave_policy.md](file:///Users/vcom/Documents/iceipts_assignment/docs/policies/leave_policy.md)
- `policy://attendance-policy` -> [docs/policies/attendance_policy.md](file:///Users/vcom/Documents/iceipts_assignment/docs/policies/attendance_policy.md)
- `policy://wfh-policy` -> [docs/policies/wfh_policy.md](file:///Users/vcom/Documents/iceipts_assignment/docs/policies/wfh_policy.md)

### Run Standalone MCP Test Client
```bash
npm run test:mcp
```

---

## REST API Contracts ([CONTRACTS.md](file:///Users/vcom/Documents/iceipts_assignment/CONTRACTS.md))

All protected routes require an `Authorization: Bearer <jwt_token>` header.

- `POST /api/auth/login`: `{ email, password }` -> `{ token, user }`
- `GET /api/me/leave-balance`: Returns `{ cl, sl, el, pending_leaves }`
- `GET /api/me/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD`: Returns attendance records
- `POST /api/me/leave-requests`: `{ leave_type, from_date, to_date, reason, confirmed: boolean }`
  - `confirmed: false`: Dry-run validation check.
  - `confirmed: true`: Commits request with status `pending`.
- `GET /api/employees/:id/attendance-summary?from=YYYY-MM-DD&to=YYYY-MM-DD`: Restricted to `hr_admin` (returns `403 Forbidden` for standard employees).
- `POST /api/chat`: `{ message, confirmation_payload? }` -> `{ reply, tools_used, citations, pending_confirmation }`

---

## Libraries Used & Rationale

| Package | Workspace | Rationale |
| :--- | :--- | :--- |
| **`express`** | Backend | Industry standard, lightweight HTTP router for predictable REST endpoint implementation. |
| **`better-sqlite3`** | Backend / MCP | High-performance synchronous SQLite driver providing ACID compliance and zero external service overhead. |
| **`jsonwebtoken`** | Backend | Stateless JWT tokens containing user identity, role, and department for RBAC enforcement. |
| **`bcryptjs`** | Backend | Secure salted password hashing for authenticated user verification. |
| **`@modelcontextprotocol/sdk`** | MCP Server | Official Anthropic Model Context Protocol TypeScript/Node SDK ensuring complete JSON-RPC 2.0 stdio compliance. |
| **`react` + `vite`** | Frontend | Lightning-fast HMR and build times with a component-driven Swiss-industrial UI. |
| **`lucide-react`** | Frontend | Clean, consistent SVG icons for personas, attendance badges, and audit statuses. |
| **`concurrently`** | Root Monorepo | Enables unified one-command local execution (`npm run dev`) across backend and frontend. |

---

## Documented Assumptions

1. **Role Normalization (`"hr admin"` -> `"hr_admin"`)**:
   In the assignment brief CSV, Fatima Shaikh (`E005`) has the role `"hr admin"` with a space. To ensure clean programmatic RBAC checks without fragile string comparisons, this is normalized during database seeding and JWT generation to `"hr_admin"`.
2. **Typo Correction in Seed CSV (`LR003`)**:
   Row `LR003` in the brief CSV referenced employee ID `2004`. Given that employee IDs follow the `E001`–`E006` format and Arjun Rao is `E004`, this was corrected to `E004` to maintain foreign key integrity.
3. **Reference Calendar Anchor**:
   The brief queries "last week's attendance" for October 2026. The reference timeframe is anchored to Monday, October 19, 2026 through Friday, October 23, 2026.
4. **Late Mark Penalty for Rahul Mehta (`E002`)**:
   Per Attendance Policy Section 2, every 3 late marks in a month deduct 0.5 day Casual Leave (CL). Because Rahul has 0 CL remaining (8 used of 8 entitled), the system applies a **0.5 day pay deduction** (salary deduction).
5. **Overtime & Missed Punch for Arjun Rao (`E004`)**:
   Arjun Rao worked 10.5 hours on October 22, 2026. Because standard shifts are 9 hours per Attendance Policy Section 5, the excess 1.5 hours is categorized as **1h 30m overtime**. His check-out was omitted on October 21, correctly triggering a **missed punch** notification.
