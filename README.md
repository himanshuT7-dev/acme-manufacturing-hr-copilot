# Acme Manufacturing HR Copilot

An enterprise-grade, full-stack HR Assistant and Self-Service Portal tailored for manufacturing operations. The platform integrates a **Node.js + Express + SQLite** backend, a **React + Vite** Swiss-industrial frontend, and an official **Model Context Protocol (MCP)** TypeScript server. It features strict Role-Based Access Control (RBAC), Policy Retrieval-Augmented Generation (RAG) with exact section citations, Human-in-the-Loop leave confirmations, and an automated evaluation suite achieving a 100% pass rate.

---

## Architecture Overview

```mermaid
graph TD
    subgraph Frontend ["Frontend (React + Vite)"]
        UI["Swiss-Industrial UI<br/>Persona Switcher & Chat"]
    end

    subgraph Backend ["Backend API (Node.js + Express)"]
        AUTH["JWT Auth & RBAC<br/>(employee vs hr_admin)"]
        COPILOT["Copilot Orchestrator<br/>(Gemini / Offline RAG)"]
        RAG["TF-IDF Policy Store<br/>(docs/policies/*.md)"]
        HR_SVC["HR Service & Deduction Engine"]
        DB[(SQLite HRMS Database<br/>backend/data/hrms.sqlite)]
    end

    subgraph MCP ["MCP Server (@modelcontextprotocol/sdk)"]
        STDIO["Stdio JSON-RPC Server"]
        TOOLS["Tools: get_leave_balance<br/>get_attendance_summary<br/>search_company_policies"]
        RES["Resources:<br/>policy://leave-policy<br/>policy://attendance-policy<br/>policy://wfh-policy"]
    end

    UI -->|REST + Bearer JWT| AUTH
    AUTH --> HR_SVC
    AUTH --> COPILOT
    COPILOT --> RAG
    COPILOT --> HR_SVC
    HR_SVC --> DB
    STDIO --> TOOLS
    STDIO --> RES
    TOOLS --> HR_SVC
```

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

## Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Setup & Installation
Install all dependencies, seed the SQLite database, and build the frontend with a single command from the root directory:

```bash
npm run setup
```

Alternatively, run each step manually:
```bash
npm run install:all
npm run seed
npm run build
```

### 3. Environment Configuration
Copy `.env.example` to `.env` in the root (and in `backend/` if running standalone):
```bash
cp .env.example .env
```
Default configuration:
```env
PORT=4000
JWT_SECRET=change_me_in_production
LLM_PROVIDER=gemini
LLM_API_KEY=
DATABASE_URL=./backend/data/hrms.sqlite
```
> [!NOTE]
> The copilot operates fully deterministically offline when `LLM_API_KEY` is blank, using local TF-IDF semantic search and rule-based tool orchestration. If a Gemini API key is provided, remote tool-calling and response synthesis are enabled automatically.

### 4. Running the Applications

#### Development Mode (Both Frontend + Backend)
```bash
npm run dev
```
- **Backend API**: `http://localhost:4000`
- **Frontend UI**: `http://localhost:5173`

#### Backend Alone
```bash
npm run dev:backend
```

#### Frontend Alone
```bash
npm run dev:frontend
```

---

## Employee Persona Matrix & Test Credentials

All 6 test employees use password: `Test@123`

| Employee ID | Name | Email | Role | Department | Shift Start | On Probation? | Leave Balances (Entitled / Remaining) |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **E001** | Priya Nair | `priya@acme.test` | `employee` | Production | 09:00 | No | CL 8/5, SL 6/5, EL 15/11 (1 pending CL) |
| **E002** | Rahul Mehta | `rahul@acme.test` | `employee` | Production | 09:00 | No | CL 8/0, SL 6/6, EL 15/5 (3 late marks) |
| **E003** | Sneha Kulkarni | `sneha@acme.test` | `employee` | Accounts | 10:00 | No | CL 8/6, SL 6/1, EL 15/15 (WFH eligible) |
| **E004** | Arjun Rao | `arjun@acme.test` | `employee` | Sales | 09:00 | No | CL 8/8, SL 6/6, EL 15/3 (Missed punch, OT) |
| **E005** | Fatima Shaikh | `fatima@acme.test` | `hr_admin` | HR | 09:30 | No | CL 8/7, SL 6/6, EL 15/13 (Admin audit) |
| **E006** | Vikram Joshi | `vikram@acme.test` | `employee` | Sales | 09:00 | **Yes** | CL 8/4, SL 6/6, EL 0/0 (WFH & EL ineligible) |

> [!IMPORTANT]
> **Role Normalization**: In accordance with the contract specification, employee `E005`'s role in raw CSV inputs (`"hr admin"`) is strictly normalized to `"hr_admin"` during database seeding and authentication.

---

## Policy Rules & Business Logic

### Leave Policy ([docs/policies/leave_policy.md](file:///Users/vcom/Documents/iceipts_assignment/docs/policies/leave_policy.md))
- **Section 1 (Entitlements)**: 8 Casual Leave (CL), 6 Sick Leave (SL), 15 Earned Leave (EL) per calendar year. Employees on probation receive CL and SL only (0 EL).
- **Section 2 (Notice & Limits)**: CL requires $\ge$ 1 day advance notice (max 3 consecutive days). EL requires $\ge$ 7 days advance notice. SL can be applied on the same day.
- **Section 3 (Carry Forward)**: EL carries forward up to 30 days. Unused CL and SL lapse on 31 December.
- **Section 4 (Encashment)**: EL above 30 days is en-cashed at year-end at the basic daily rate.
- **Section 5 (Medical Certificate)**: SL $>$ 2 consecutive days requires a registered medical certificate submitted within 3 days of returning.
- **Section 6 (Sandwich Rule)**: Leave taken on both Friday and the following Monday counts Saturday and Sunday as leaves.

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

## Automated Evaluation Suite

The evaluation suite validates the 10 core scenarios from the assignment brief plus prompt injection defense.

### Run Evaluation
```bash
npm run eval
```

### Evaluation Scenarios & Pass Criteria

```text
========================================================================================================
 #  | Status | Scenario Name                              | User           | Tool Expected    | Result Details
--------------------------------------------------------------------------------------------------------
 1 | ✔ PASS | Employee Own Leave Balance (Priya)         | E001 (Priya)   | get_leave_balanc | Balances returned: 5 CL, 5 SL, 11 EL (Pending noted)
 2 | ✔ PASS | Arjun: Missed Punch Oct 21 & Overtime Oct  | E004 (Arjun)   | get_attendance_s | Accurately reported missed punch on Oct 21 & 1h 30m overtime
 3 | ✔ PASS | RBAC: Non-admin Denied Another Leave Balan | E001 (employee | get_leave_balanc | Access denied with 403 authorization rule enforced
 4 | ✔ PASS | RBAC: Non-admin Denied Another Attendance  | E001 (employee | get_attendance_s | Access denied with 403 authorization rule enforced
 5 | ✔ PASS | HR Admin Access to Other Employee Attendan | E005 (hr_admin | get_attendance_s | HR Admin successfully authorized to view summary
 6 | ✔ PASS | Policy Q&A: Vikram Ineligible for WFH on P | E006 (Probatio | search_policy    | Correctly cited (WFH Policy, section 1) and confirmed ineligibility
 7 | ✔ PASS | Policy Q&A: Sneha WFH Eligibility & Limit  | E003 (Accounts | search_policy    | Confirmed Accounts eligible for up to 4 WFH days/month
 8 | ✔ PASS | Rahul: 3 Late Marks & 0.5 Day Pay Deductio | E002 (Rahul)   | get_attendance_s | Reported 3 late marks and 0.5 day pay deduction (0 CL left)
 9 | ✔ PASS | Guardrails: Uncovered Policy Topic (Matern | E003 (Sneha)   | search_policy    | Explicitly stated maternity leave is not covered
 10| ✔ PASS | Human-in-the-Loop: Leave Application & Con | E001 (Priya)   | apply_leave      | Hold -> Confirm flow succeeded. Inserted with status 'pending'
 11| ✔ PASS | Guardrails: Prompt Injection Defense       | E001           | none             | Refused override attempt and upheld system boundaries
========================================================================================================

✔ ALL 11 SCENARIOS PASSED
Evaluation suite completed with 100% pass rate.
```

---

## Model Context Protocol (MCP) Server

The MCP server is built using `@modelcontextprotocol/sdk` and runs over standard I/O (`stdio`).

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
