# Acme Manufacturing HR Copilot - Contracts & Interface Specifications

This document defines the strict API contracts, data models, role-based access control (RBAC) rules, and tool interfaces across the monorepo services (`backend`, `mcp-server`, and `frontend`). All parallel development agents and contributors must strictly adhere to these schemas.

---

## 1. System Architecture & Common Conventions

### 1.1 Service Roles
- **Backend (`/backend`)**: Express + Node.js REST API service connected to SQLite (`./backend/data/hrms.sqlite`). Handles authentication, employee data persistence, attendance tracking, leave request processing, and LLM chat orchestration.
- **MCP Server (`/mcp-server`)**: Official TypeScript/Node Model Context Protocol SDK server exposing structured HR tools and resources to LLM agents.
- **Frontend (`/frontend`)**: React + Vite single-page application providing employee self-service and HR administration dashboards and interactive copilot chat interface.
- **Docs/Policies (`/docs/policies`)**: Official HR policies in markdown format indexed for policy lookup and citations.

### 1.2 Authentication & Headers
- All protected endpoints require a standard Bearer token in the `Authorization` header:
  ```http
  Authorization: Bearer <jwt_token>
  ```
- JWT payload contains:
  ```json
  {
    "employee_id": "E001",
    "email": "employee@acme.com",
    "role": "employee",
    "exp": 1798100000
  }
  ```

### 1.3 Roles and Role Normalization Rule
- Supported system roles:
  1. `employee`
  2. `hr_admin`
- **Critical Normalization Rule**: If source seed data / CSV specifies `"hr admin"` (with a space) for employee `E005` or any other record, the system **MUST** normalize it to `"hr_admin"` during data ingestion and user retrieval.

---

## 2. Data Models & Schemas

### 2.1 User / Employee Model
```typescript
interface User {
  employee_id: string;      // e.g. "E001"
  name: string;             // e.g. "Jane Doe"
  email: string;            // e.g. "jane.doe@acme.com"
  role: "employee" | "hr_admin";
  department: string;       // e.g. "Manufacturing", "Quality", "HR"
  shift_start: string;      // 24h format "HH:MM", e.g. "08:00", "09:00"
  on_probation: boolean;    // true | false
}
```

### 2.2 Leave Balance Model
```typescript
interface LeaveBalance {
  annual_leave: number;     // e.g. 14
  sick_leave: number;       // e.g. 8
  casual_leave: number;     // e.g. 4
  unpaid_leave?: number;    // optional track
}
```

### 2.3 Attendance Record Model
```typescript
interface AttendanceRecord {
  id: number | string;
  employee_id: string;
  date: string;             // ISO Date "YYYY-MM-DD"
  check_in: string | null;  // "HH:MM:SS" or ISO time
  check_out: string | null; // "HH:MM:SS" or ISO time
  status: "present" | "absent" | "late" | "half_day" | "on_leave";
  notes?: string | null;
}
```

### 2.4 Leave Request Model
```typescript
interface LeaveRequest {
  id: number | string;
  employee_id: string;
  leave_type: "annual" | "sick" | "casual" | "unpaid";
  from_date: string;        // "YYYY-MM-DD"
  to_date: string;          // "YYYY-MM-DD"
  days_count: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}
```

---

## 3. REST API Specifications

### 3.1 Auth: Login
Authenticates an employee and issues a JWT token.

- **Method**: `POST`
- **Path**: `/api/auth/login`
- **Access**: Public
- **Request Body**:
  ```json
  {
    "email": "employee@acme.com",
    "password": "password123"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsIn...",
    "user": {
      "employee_id": "E001",
      "name": "Alex Mercer",
      "email": "alex.mercer@acme.com",
      "role": "employee",
      "department": "Assembly",
      "shift_start": "08:00",
      "on_probation": false
    }
  }
  ```
- **Error Response (401 Unauthorized)**:
  ```json
  {
    "error": "Invalid email or password"
  }
  ```

---

### 3.2 Get Current User Leave Balance
Retrieves the logged-in employee's remaining leave balances.

- **Method**: `GET`
- **Path**: `/api/me/leave-balance`
- **Access**: Authenticated (`employee` or `hr_admin`)
- **Headers**: `Authorization: Bearer <token>`
- **Success Response (200 OK)**:
  ```json
  {
    "employee_id": "E001",
    "annual_leave": 12,
    "sick_leave": 6,
    "casual_leave": 3
  }
  ```

---

### 3.3 Get Current User Attendance
Retrieves the logged-in employee's attendance logs for a date window.

- **Method**: `GET`
- **Path**: `/api/me/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD`
- **Access**: Authenticated (`employee` or `hr_admin`)
- **Headers**: `Authorization: Bearer <token>`
- **Query Parameters**:
  - `from` (string, required): Start date in `YYYY-MM-DD` format.
  - `to` (string, required): End date in `YYYY-MM-DD` format.
- **Success Response (200 OK)**:
  ```json
  {
    "employee_id": "E001",
    "from": "2026-11-01",
    "to": "2026-11-20",
    "records": [
      {
        "date": "2026-11-03",
        "check_in": "08:02:15",
        "check_out": "17:05:00",
        "status": "present",
        "notes": null
      },
      {
        "date": "2026-11-04",
        "check_in": "08:35:10",
        "check_out": "17:02:30",
        "status": "late",
        "notes": "Late check-in past shift start (08:00)"
      }
    ]
  }
  ```

---

### 3.4 Submit / Dry-Run Leave Request
Submits a leave request or checks validity before applying.

- **Method**: `POST`
- **Path**: `/api/me/leave-requests`
- **Access**: Authenticated (`employee` or `hr_admin`)
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "leave_type": "annual",
    "from_date": "2026-12-01",
    "to_date": "2026-12-03",
    "reason": "Family gathering",
    "confirmed": true
  }
  ```
- **Validation & Execution Behavior**:
  - `confirmed: false`: Dry-run validation check. Checks date syntax, ensures balance availability, validates probation constraints, and returns calculated business days without persisting mutations.
  - `confirmed: true`: Commits the leave request, deducts balance, and returns created request details.
- **Success Response (200 OK / 201 Created)**:
  ```json
  {
    "success": true,
    "confirmed": true,
    "request": {
      "id": 14,
      "employee_id": "E001",
      "leave_type": "annual",
      "from_date": "2026-12-01",
      "to_date": "2026-12-03",
      "days_count": 3,
      "status": "approved",
      "created_at": "2026-11-24T12:00:00.000Z"
    },
    "remaining_balance": {
      "annual_leave": 9,
      "sick_leave": 6,
      "casual_leave": 3
    }
  }
  ```
- **Error Response (400 Bad Request)**:
  ```json
  {
    "error": "Insufficient annual leave balance. Requested 3 days, available 1 day."
  }
  ```

---

### 3.5 Employee Attendance Summary (HR Admin Only)
Allows HR administrators to inspect aggregated attendance metrics for any given employee.

- **Method**: `GET`
- **Path**: `/api/employees/:id/attendance-summary?from=YYYY-MM-DD&to=YYYY-MM-DD`
- **Access**: **`hr_admin` only**
- **Headers**: `Authorization: Bearer <token>`
- **Parameters**:
  - `id` (path param, required): Target `employee_id` (e.g. `E001`)
  - `from` (query param, required): `YYYY-MM-DD`
  - `to` (query param, required): `YYYY-MM-DD`
- **Success Response (200 OK)**:
  ```json
  {
    "employee": {
      "employee_id": "E001",
      "name": "Alex Mercer",
      "department": "Assembly",
      "shift_start": "08:00"
    },
    "period": {
      "from": "2026-10-01",
      "to": "2026-10-31"
    },
    "summary": {
      "total_scheduled_days": 22,
      "present_days": 19,
      "absent_days": 1,
      "late_days": 2,
      "half_days": 0,
      "leaves_taken": 2,
      "attendance_percentage": 90.9
    }
  }
  ```
- **RBAC Error Response (403 Forbidden)**:
  Triggered when requester has role `employee`:
  ```json
  {
    "error": "Forbidden: HR Admin access required"
  }
  ```

---

### 3.6 Chat Orchestration Endpoint
Core conversational agent endpoint integrating LLM, MCP tool execution, policy RAG, and Human-in-the-Loop confirmations.

- **Method**: `POST`
- **Path**: `/api/chat`
- **Access**: Authenticated (`employee` or `hr_admin`)
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
  ```json
  {
    "message": "I need to take leave from 2026-12-01 to 2026-12-03 for personal reasons. Do I have enough balance?",
    "confirmation_payload": null
  }
  ```
  *(When confirming an action previously prompted by `pending_confirmation`, client sends `confirmation_payload` containing the agreed action payload)*:
  ```json
  {
    "message": "Yes, please submit the request.",
    "confirmation_payload": {
      "action": "apply_leave",
      "payload": {
        "leave_type": "annual",
        "from_date": "2026-12-01",
        "to_date": "2026-12-03",
        "reason": "Personal reasons"
      }
    }
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "reply": "You have 12 annual leave days remaining. Applying for 3 days will leave you with 9 days. Would you like me to submit this request for you?",
    "tools_used": [
      "get_leave_balance",
      "check_policy_rules"
    ],
    "citations": [
      "docs/policies/leave_policy.md#Section 2"
    ],
    "pending_confirmation": {
      "action": "apply_leave",
      "payload": {
        "leave_type": "annual",
        "from_date": "2026-12-01",
        "to_date": "2026-12-03",
        "reason": "Personal reasons"
      },
      "summary": "Submit Annual Leave request from 2026-12-01 to 2026-12-03 (3 days)?"
    }
  }
  ```
  *(When no confirmation is required or when confirmation was just completed)*:
  ```json
  {
    "reply": "Your leave request for 2026-12-01 to 2026-12-03 has been successfully submitted and approved.",
    "tools_used": [
      "apply_leave_request"
    ],
    "citations": [],
    "pending_confirmation": null
  }
  ```

---

## 4. MCP Tools Specification (`mcp-server`)

The MCP server implements tools using the official `@modelcontextprotocol/sdk` TypeScript package over standard stdio / JSON-RPC:

1. `get_leave_balance(employee_id: string)`
   - Description: Retrieves current annual, sick, and casual leave balances.
2. `get_attendance_records(employee_id: string, from_date: string, to_date: string)`
   - Description: Returns check-in/out timestamps and attendance status for the employee.
3. `validate_leave_application(employee_id: string, leave_type: string, from_date: string, to_date: string)`
   - Description: Validates whether employee has sufficient quota and is eligible according to policy (e.g. probation constraints).
4. `apply_leave(employee_id: string, leave_type: string, from_date: string, to_date: string, reason: string)`
   - Description: Persists leave booking. Must only be executed upon verified confirmation.
5. `search_company_policies(query: string)`
   - Description: Searches markdown policies (`leave_policy.md`, `attendance_policy.md`, `wfh_policy.md`) and returns relevant sections and exact citations.
6. `get_employee_attendance_summary(requester_role: string, target_employee_id: string, from_date: string, to_date: string)`
   - Description: Returns aggregated attendance metrics. Throws permission denied error if `requester_role !== "hr_admin"`.
