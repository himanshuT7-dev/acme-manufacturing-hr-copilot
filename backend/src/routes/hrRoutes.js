import express from 'express';
import {
  authenticateUser,
  getEmployeeById,
  getLeaveBalance,
  getAttendanceSummary,
  getAttendanceRecords,
  createLeaveRequest,
  normalizeRole
} from '../services/hrService.js';
import { authenticateToken, requireHrAdmin, generateToken } from '../middleware/auth.js';
import db from '../db/index.js';

const router = express.Router();

// ==========================================
// 1. Auth Endpoint: POST /api/auth/login
// ==========================================
async function handleLogin(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = authenticateUser(email, password);
    const token = generateToken(user);

    return res.status(200).json({
      token,
      user: {
        employee_id: user.employee_id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        shift_start: user.shift_start,
        on_probation: user.on_probation
      }
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message || 'Internal server error' });
  }
}

// Support both /auth/login and /login for flexible route mounting
router.post('/auth/login', handleLogin);
router.post('/login', handleLogin);

// ==========================================
// 2. Current User Leave Balance
// GET /api/me/leave-balance
// ==========================================
router.get('/me/leave-balance', authenticateToken, (req, res) => {
  try {
    const balanceData = getLeaveBalance(req.user, req.user.employee_id);
    return res.status(200).json(balanceData);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
});

// ==========================================
// 3. Current User Attendance
// GET /api/me/attendance?from=YYYY-MM-DD&to=YYYY-MM-DD
// ==========================================
router.get('/me/attendance', authenticateToken, (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Query parameters "from" and "to" (YYYY-MM-DD) are required' });
    }

    const attendanceData = getAttendanceRecords(req.user, req.user.employee_id, from, to);
    return res.status(200).json(attendanceData);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
});

// ==========================================
// 4. Submit / Dry-Run Leave Request
// POST /api/me/leave-requests
// ==========================================
router.post('/me/leave-requests', authenticateToken, (req, res) => {
  try {
    const result = createLeaveRequest(req.user, req.body);
    const statusCode = result.confirmed ? 201 : 200;
    return res.status(statusCode).json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
});

// ==========================================
// 5. Employee Attendance Summary (HR Admin Only)
// GET /api/employees/:id/attendance-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// ==========================================
router.get('/employees/:id/attendance-summary', authenticateToken, (req, res) => {
  try {
    const targetEmployeeId = req.params.id;
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'Query parameters "from" and "to" (YYYY-MM-DD) are required' });
    }

    // Role check is enforced inside getAttendanceSummary, but we can also check here
    if (normalizeRole(req.user.role) !== 'hr_admin' && targetEmployeeId !== req.user.employee_id) {
      return res.status(403).json({ error: 'Forbidden: HR Admin access required' });
    }

    const summary = getAttendanceSummary(req.user, targetEmployeeId, from, to);
    return res.status(200).json(summary);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
});

// ==========================================
// 6. Target Employee Leave Balance (HR Admin Only or Self)
// GET /api/employees/:id/leave-balance
// ==========================================
router.get('/employees/:id/leave-balance', authenticateToken, (req, res) => {
  try {
    const targetEmployeeId = req.params.id;
    const balance = getLeaveBalance(req.user, targetEmployeeId);
    return res.status(200).json(balance);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
});

// ==========================================
// 7. List Employees (Authenticated)
// GET /api/employees
// ==========================================
router.get('/employees', authenticateToken, (req, res) => {
  try {
    const employees = db.prepare(`
      SELECT employee_id, name, email, role, department, shift_start, on_probation
      FROM employees
      ORDER BY employee_id ASC
    `).all().map(emp => ({
      ...emp,
      role: normalizeRole(emp.role),
      on_probation: Boolean(emp.on_probation)
    }));

    return res.status(200).json(employees);
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({ error: err.message });
  }
});

export default router;
