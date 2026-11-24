# Acme Manufacturing HR Copilot - Model Context Protocol (MCP) Server

A production-grade Model Context Protocol server exposing Acme Manufacturing's Human Resources services, role-checked calculations, and corporate policy documents to AI agents, Claude Desktop, and the MCP Inspector.

Built with the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) using `StdioServerTransport` for standard input/output JSON-RPC communication.

---

## Architecture & Shared Backend Logic

To guarantee that business rules, probation restrictions, and Role-Based Access Control (RBAC) live in **one single place**, this MCP server directly imports and executes the backend services:

- **Shared Service Layer**: `../backend/src/services/hrService.js`
  - `getLeaveBalance(requestingUser, targetEmployeeId)`
  - `getAttendanceSummary(requestingUser, targetEmployeeId, fromDate, toDate)`
- **Policy Vector & Document Store**: `../backend/src/rag/policyStore.js` and `../docs/policies/*.md`
- **SQLite Database Persistence**: `../backend/data/hrms.sqlite`

### Active User Context & RBAC Configuration

When AI tools execute, the active user context is read from the `MCP_USER_EMAIL` environment variable:

- **Default User**: `priya@acme.test` (`E001`, Role: `employee`, Assembly)
- **HR Admin Override**: `fatima@acme.test` (`E005`, Role: `hr_admin`, HR)
- **Role Normalization**: Any legacy `"hr admin"` role strings are automatically normalized to `"hr_admin"`.

---

## Exposed Capabilities

### 1. Tools

| Tool Name | Parameters | Description | RBAC Rules |
| :--- | :--- | :--- | :--- |
| `get_leave_balance` | `{ employee_id?: string }` | Retrieves current annual, sick, and casual balances plus pending requests. | Regular employees can query only their own balance. `hr_admin` can query any employee. |
| `get_attendance_summary` | `{ employee_id?: string, from_date?: string, to_date?: string }` | Retrieves aggregated metrics (scheduled days, present, late, half-days, missed punches, overtime, percentage) and daily logs. | Regular employees can query only their own summary. `hr_admin` can query any employee. |
| `search_company_policies` | `{ query: string }` | Searches official Acme HR policies and returns relevant sections and exact citations. | Public / Available to all authenticated employees. |

### 2. Resources

Readable policy documents returning full Markdown content:

- `policy://leave-policy` - Acme Employee Leave Policy (`../docs/policies/leave_policy.md`)
- `policy://attendance-policy` - Acme Attendance & Punctuality Policy (`../docs/policies/attendance_policy.md`)
- `policy://wfh-policy` - Acme Remote Work & Work-From-Home Policy (`../docs/policies/wfh_policy.md`)

---

## Running with MCP Inspector

You can test and interact with this server visually using the official `@modelcontextprotocol/inspector`:

### 1. Test as Regular Employee (`priya@acme.test`)
```bash
cd mcp-server
npx @modelcontextprotocol/inspector node src/index.js
```
Or explicitly passing the environment variable:
```bash
MCP_USER_EMAIL=priya@acme.test npx @modelcontextprotocol/inspector node src/index.js
```

### 2. Test as HR Admin (`fatima@acme.test`)
To verify administrative access and cross-employee inspection:
```bash
cd mcp-server
MCP_USER_EMAIL=fatima@acme.test npx @modelcontextprotocol/inspector node src/index.js
```

### 3. Step-by-Step Inspector Verification Flow

1. **Resources Tab**:
   - Click **List Resources**.
   - Verify `policy://leave-policy`, `policy://attendance-policy`, and `policy://wfh-policy` appear.
   - Click **Read Resource** on `policy://leave-policy` to view the full markdown content.

2. **Tools Tab - Employee Access (Priya)**:
   - Call `get_leave_balance` with `{}` -> Returns Priya's leave balances and pending casual leave (`LR001`).
   - Call `get_leave_balance` with `{"employee_id": "E002"}` -> Returns `Permission Denied (403): Forbidden: You do not have permission to view leave balance for this employee`.
   - Call `get_attendance_summary` with `{"from_date": "2026-10-19", "to_date": "2026-10-23"}` -> Returns Priya's weekly attendance summary (4 present, 1 late, 1 on leave).
   - Call `get_attendance_summary` with `{"employee_id": "E002"}` -> Returns `Permission Denied (403): Forbidden: HR Admin access required`.

3. **Tools Tab - HR Admin Access (Fatima)**:
   - Start inspector with `MCP_USER_EMAIL=fatima@acme.test`.
   - Call `get_leave_balance` with `{"employee_id": "E002"}` -> **Succeeds!** Returns Rahul's balances.
   - Call `get_leave_balance` with `{"employee_id": "E006"}` -> Returns Vikram's balances (confirming 0 annual leave due to active probation).
   - Call `get_attendance_summary` with `{"employee_id": "E002", "from_date": "2026-10-19", "to_date": "2026-10-23"}` -> **Succeeds!** Returns Rahul's full attendance and overtime records.

---

## Claude Desktop Configuration

To connect this server directly to Claude Desktop, add the configuration below to:
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "acme-hr": {
      "command": "node",
      "args": [
        "/Users/vcom/Documents/iceipts_assignment/mcp-server/src/index.js"
      ],
      "env": {
        "MCP_USER_EMAIL": "priya@acme.test"
      }
    }
  }
}
```

---

## Automated Verification Test Suite

A standalone verification test suite is provided to validate the MCP protocol handshake, tools, resources, and RBAC matrix programmatically:

```bash
cd mcp-server
npm test
```

This runs `test-mcp.js`, verifying:
1. `initialize` protocol negotiation.
2. `resources/list` and `resources/read` for all 3 policies.
3. `tools/list` schema availability.
4. `tools/call` for `get_leave_balance` under employee and admin roles.
5. Strict 403 enforcement when an employee attempts unauthorized inspection of other records.
6. Admin capability to inspect employee balances and attendance summaries.
