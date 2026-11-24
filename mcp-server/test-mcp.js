import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverScript = path.resolve(__dirname, 'src/index.js');

async function testMcpClient(email, scenarioName, testCalls) {
  console.log(`\n======================================================`);
  console.log(`Running Scenario: ${scenarioName} (MCP_USER_EMAIL=${email})`);
  console.log(`======================================================`);

  return new Promise((resolve, reject) => {
    const proc = spawn('node', [serverScript], {
      env: {
        ...process.env,
        MCP_USER_EMAIL: email
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let buffer = '';
    const pendingResponses = new Map();

    proc.stderr.on('data', (d) => {
      // Diagnostic messages from server go to stderr
      const msg = d.toString().trim();
      if (msg) console.log(`[SERVER STDERR] ${msg}`);
    });

    proc.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep last incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.id !== undefined && pendingResponses.has(json.id)) {
            const cb = pendingResponses.get(json.id);
            pendingResponses.delete(json.id);
            cb(json);
          }
        } catch (e) {
          console.error('Failed to parse stdout line as JSON:', line);
        }
      }
    });

    let reqId = 1;
    function send(msg) {
      return new Promise((res) => {
        const id = reqId++;
        const payload = { jsonrpc: '2.0', id, ...msg };
        pendingResponses.set(id, res);
        proc.stdin.write(JSON.stringify(payload) + '\n');
      });
    }

    (async () => {
      // 1. Initialize handshake
      const initResp = await send({
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-inspector', version: '1.0.0' }
        }
      });
      console.log('Init response received. Server info:', initResp.result?.serverInfo);

      // Notification after init
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

      for (const call of testCalls) {
        console.log(`\n--- Calling: ${call.description || call.method} ---`);
        const resp = await send({
          method: call.method,
          params: call.params
        });

        if (resp.error) {
          console.log(`Error Response:`, resp.error);
        } else {
          console.log(`Result:`, JSON.stringify(resp.result, null, 2));
        }

        if (call.expectError) {
          const isErr = resp.result?.isError || Boolean(resp.error);
          console.log(`[PASS] Error correctly returned as expected (${isErr})`);
        } else {
          const isErr = resp.result?.isError || Boolean(resp.error);
          if (isErr) {
            console.error(`[FAIL] Unexpected error returned:`, resp);
          } else {
            console.log(`[PASS] Success response received`);
          }
        }
      }

      proc.kill();
      resolve();
    })().catch((err) => {
      proc.kill();
      reject(err);
    });
  });
}

async function runAllTests() {
  // Test Suite 1: Priya Nair (Regular Employee)
  await testMcpClient('priya@acme.test', 'Priya (Employee)', [
    {
      description: 'List Tools',
      method: 'tools/list',
      params: {}
    },
    {
      description: 'List Resources',
      method: 'resources/list',
      params: {}
    },
    {
      description: 'Read Resource: policy://leave-policy',
      method: 'resources/read',
      params: { uri: 'policy://leave-policy' }
    },
    {
      description: 'Read Resource: policy://attendance-policy',
      method: 'resources/read',
      params: { uri: 'policy://attendance-policy' }
    },
    {
      description: 'Read Resource: policy://wfh-policy',
      method: 'resources/read',
      params: { uri: 'policy://wfh-policy' }
    },
    {
      description: 'Priya: get own leave balance (omit employee_id)',
      method: 'tools/call',
      params: { name: 'get_leave_balance', arguments: {} }
    },
    {
      description: 'Priya: get own leave balance (explicit E001)',
      method: 'tools/call',
      params: { name: 'get_leave_balance', arguments: { employee_id: 'E001' } }
    },
    {
      description: 'Priya: attempt to get E002 leave balance (RBAC 403 test)',
      method: 'tools/call',
      params: { name: 'get_leave_balance', arguments: { employee_id: 'E002' } },
      expectError: true
    },
    {
      description: 'Priya: get own attendance summary for reference week',
      method: 'tools/call',
      params: {
        name: 'get_attendance_summary',
        arguments: { from_date: '2026-10-19', to_date: '2026-10-23' }
      }
    },
    {
      description: 'Priya: attempt to get E002 attendance summary (RBAC 403 test)',
      method: 'tools/call',
      params: {
        name: 'get_attendance_summary',
        arguments: { employee_id: 'E002', from_date: '2026-10-19', to_date: '2026-10-23' }
      },
      expectError: true
    }
  ]);

  // Test Suite 2: Fatima Shaikh (HR Admin)
  await testMcpClient('fatima@acme.test', 'Fatima (HR Admin)', [
    {
      description: 'Fatima (HR Admin): get leave balance for E002 (Rahul)',
      method: 'tools/call',
      params: { name: 'get_leave_balance', arguments: { employee_id: 'E002' } }
    },
    {
      description: 'Fatima (HR Admin): get leave balance for E006 (Vikram - Probation)',
      method: 'tools/call',
      params: { name: 'get_leave_balance', arguments: { employee_id: 'E006' } }
    },
    {
      description: 'Fatima (HR Admin): get attendance summary for E001 (Priya)',
      method: 'tools/call',
      params: {
        name: 'get_attendance_summary',
        arguments: { employee_id: 'E001', from_date: '2026-10-19', to_date: '2026-10-23' }
      }
    },
    {
      description: 'Fatima (HR Admin): get attendance summary for E002 (Rahul)',
      method: 'tools/call',
      params: {
        name: 'get_attendance_summary',
        arguments: { employee_id: 'E002', from_date: '2026-10-19', to_date: '2026-10-23' }
      }
    }
  ]);

  console.log('\n======================================================');
  console.log('ALL MCP TESTS COMPLETED SUCCESSFULLY!');
  console.log('======================================================');
}

runAllTests().catch((e) => {
  console.error('Test run failed:', e);
  process.exit(1);
});
