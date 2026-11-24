// Redirect console.log to console.error immediately so stdout remains clean JSON-RPC transport for StdioServerTransport
const originalConsoleLog = console.log;
console.log = (...args) => {
  console.error(...args);
};

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getActiveUser } from './db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Dynamic import of backend hrService and policyStore to reuse business logic & RBAC
let hrService = null;
try {
  hrService = await import('../../backend/src/services/hrService.js');
} catch (e1) {
  try {
    hrService = await import('../../backend/src/hrService.js');
  } catch (e2) {
    console.error('[acme-hr-mcp-server] Warning: Could not locate backend hrService.js', e1.message);
  }
}

let policyStore = null;
try {
  policyStore = await import('../../backend/src/rag/policyStore.js');
  // Initialize in-memory vector/keyword store for policies if available
  const policiesDir = path.resolve(__dirname, '../../docs/policies');
  if (policyStore.initializePolicyStore) {
    await policyStore.initializePolicyStore(policiesDir);
  }
} catch (e) {
  try {
    policyStore = await import('../../backend/src/policyStore.js');
  } catch {
    // Policy store is optional; resources directly read raw Markdown files below
  }
}

// 2. Definition of HR Policy Resources
const POLICY_RESOURCES = {
  'policy://leave-policy': {
    uri: 'policy://leave-policy',
    name: 'Leave Policy',
    description: 'Acme Manufacturing Employee Leave Policy (leave categories, probation restrictions, notice requirements, carryover rules)',
    mimeType: 'text/markdown',
    filePath: path.resolve(__dirname, '../../docs/policies/leave_policy.md')
  },
  'policy://attendance-policy': {
    uri: 'policy://attendance-policy',
    name: 'Attendance Policy',
    description: 'Acme Manufacturing Attendance & Punctuality Policy (shift schedules, 15-minute grace period, late mark thresholds, unexcused absences)',
    mimeType: 'text/markdown',
    filePath: path.resolve(__dirname, '../../docs/policies/attendance_policy.md')
  },
  'policy://wfh-policy': {
    uri: 'policy://wfh-policy',
    name: 'Work From Home Policy',
    description: 'Acme Manufacturing Remote Work & Work-From-Home (WFH) Policy (on-site mandatory roles, hybrid eligibility, scheduling, VPN security)',
    mimeType: 'text/markdown',
    filePath: path.resolve(__dirname, '../../docs/policies/wfh_policy.md')
  }
};

// 3. Initialize MCP Server
const server = new Server(
  {
    name: 'acme-hr-mcp-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {}
    }
  }
);

// 4. Resource Handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: Object.values(POLICY_RESOURCES).map(({ uri, name, description, mimeType }) => ({
      uri,
      name,
      description,
      mimeType
    }))
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const resourceUri = request.params.uri;
  const resource = POLICY_RESOURCES[resourceUri];

  if (!resource) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Resource not found: "${resourceUri}". Available URIs: ${Object.keys(POLICY_RESOURCES).join(', ')}`
    );
  }

  if (!fs.existsSync(resource.filePath)) {
    throw new McpError(
      ErrorCode.InternalError,
      `Policy file not found at expected location: ${resource.filePath}`
    );
  }

  const content = fs.readFileSync(resource.filePath, 'utf-8');

  return {
    contents: [
      {
        uri: resource.uri,
        mimeType: resource.mimeType,
        text: content
      }
    ]
  };
});

// 5. Tool Definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_leave_balance',
        description: 'Retrieves current annual, sick, and casual leave balances, along with pending leave requests. Regular employees can only query their own balance (or omit employee_id). HR Admin can query any employee.',
        inputSchema: {
          type: 'object',
          properties: {
            employee_id: {
              type: 'string',
              description: 'Target employee ID (e.g. "E001", "E002"). Defaults to the active authenticated user if omitted.'
            }
          }
        }
      },
      {
        name: 'get_attendance_summary',
        description: 'Retrieves aggregated attendance metrics (total scheduled days, present, absent, late marks, half-days, leaves taken, percentage) and daily records over a date range. Regular employees can only query their own summary. HR Admin can query any employee.',
        inputSchema: {
          type: 'object',
          properties: {
            employee_id: {
              type: 'string',
              description: 'Target employee ID (e.g. "E001", "E002"). Defaults to the active authenticated user if omitted.'
            },
            from_date: {
              type: 'string',
              description: 'Start date in YYYY-MM-DD format (e.g. "2026-10-19"). Defaults to reference week start (2026-10-19).'
            },
            to_date: {
              type: 'string',
              description: 'End date in YYYY-MM-DD format (e.g. "2026-10-23"). Defaults to reference week end (2026-10-23).'
            }
          }
        }
      },
      {
        name: 'search_company_policies',
        description: 'Searches official Acme HR policies (leave, attendance, and remote work) for specific rules, section citations, and requirements.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Policy topic or question (e.g. "probation leave", "late arrival grace period", "wfh eligibility")'
            }
          },
          required: ['query']
        }
      }
    ]
  };
});

// 6. Tool Call Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments || {};

  // Dynamically resolve the active user from SQLite using MCP_USER_EMAIL
  let activeUser;
  try {
    activeUser = getActiveUser();
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Configuration Error: ${err.message}`
        }
      ],
      isError: true
    };
  }

  try {
    if (toolName === 'get_leave_balance') {
      if (!hrService || !hrService.getLeaveBalance) {
        throw new Error('Backend hrService.getLeaveBalance is unavailable.');
      }

      const targetId = args.employee_id || activeUser.employee_id;
      const balanceData = hrService.getLeaveBalance(activeUser, targetId);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(balanceData, null, 2)
          }
        ]
      };
    }

    if (toolName === 'get_attendance_summary') {
      if (!hrService || !hrService.getAttendanceSummary) {
        throw new Error('Backend hrService.getAttendanceSummary is unavailable.');
      }

      const targetId = args.employee_id || activeUser.employee_id;
      const fromDate = args.from_date || '2026-10-19';
      const toDate = args.to_date || '2026-10-23';

      const summaryData = hrService.getAttendanceSummary(activeUser, targetId, fromDate, toDate);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(summaryData, null, 2)
          }
        ]
      };
    }

    if (toolName === 'search_company_policies') {
      const query = args.query || '';
      if (policyStore && policyStore.searchPolicy) {
        const results = await policyStore.searchPolicy(query, 3);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      // Simple fallback search across raw policy files if policyStore embedding is unavailable
      const matches = [];
      for (const [uri, res] of Object.entries(POLICY_RESOURCES)) {
        if (fs.existsSync(res.filePath)) {
          const text = fs.readFileSync(res.filePath, 'utf-8');
          const sections = text.split(/(?=^## Section \d+)/m);
          for (const sec of sections) {
            if (sec.toLowerCase().includes(query.toLowerCase())) {
              matches.push({
                resource: uri,
                title: res.name,
                snippet: sec.trim().slice(0, 500)
              });
            }
          }
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ query, matches: matches.slice(0, 3) }, null, 2)
          }
        ]
      };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
  } catch (error) {
    const isForbidden = error.statusCode === 403 || String(error.message).toLowerCase().includes('forbidden');
    const prefix = isForbidden ? 'Permission Denied (403): ' : 'Error: ';

    return {
      content: [
        {
          type: 'text',
          text: `${prefix}${error.message}`
        }
      ],
      isError: true
    };
  }
});

// 7. Start Server using StdioServerTransport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Retrieve current active user for diagnostic logging
  try {
    const activeUser = getActiveUser();
    console.error(
      `[acme-hr-mcp-server] Running on stdio | Active User: ${activeUser.name} <${activeUser.email}> (Role: ${activeUser.role}, ID: ${activeUser.employee_id})`
    );
  } catch (err) {
    console.error(`[acme-hr-mcp-server] Running on stdio | Warning: ${err.message}`);
  }
}

main().catch((err) => {
  console.error('[acme-hr-mcp-server] Fatal startup error:', err);
  process.exit(1);
});
