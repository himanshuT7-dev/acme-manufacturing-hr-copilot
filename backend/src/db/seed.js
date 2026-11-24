import bcrypt from 'bcryptjs';
import db from './index.js';

console.log('Seeding SQLite database with exact assignment brief data...');

// 1. Drop existing tables
db.exec(`
  DROP TABLE IF EXISTS leave_requests;
  DROP TABLE IF EXISTS attendance;
  DROP TABLE IF EXISTS leave_balances;
  DROP TABLE IF EXISTS employees;
`);

// 2. Create tables
db.exec(`
  CREATE TABLE employees (
    employee_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('employee', 'hr_admin')),
    department TEXT NOT NULL,
    shift_start TEXT NOT NULL DEFAULT '09:00',
    on_probation INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE leave_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT UNIQUE NOT NULL,
    cl REAL NOT NULL DEFAULT 0,
    sl REAL NOT NULL DEFAULT 0,
    el REAL NOT NULL DEFAULT 0,
    casual_leave REAL NOT NULL DEFAULT 0,
    sick_leave REAL NOT NULL DEFAULT 0,
    annual_leave REAL NOT NULL DEFAULT 0,
    cl_entitled REAL NOT NULL DEFAULT 8,
    cl_used REAL NOT NULL DEFAULT 0,
    sl_entitled REAL NOT NULL DEFAULT 6,
    sl_used REAL NOT NULL DEFAULT 0,
    el_entitled REAL NOT NULL DEFAULT 15,
    el_used REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
  );

  CREATE TABLE attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    status TEXT NOT NULL,
    notes TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
  );

  CREATE TABLE leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT UNIQUE,
    employee_id TEXT NOT NULL,
    leave_type TEXT NOT NULL,
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    days_count INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
  );
`);

// Common password hash for 'Test@123'
const defaultPasswordHash = bcrypt.hashSync('Test@123', 10);

// Helper to normalize roles (e.g., E005 raw role "hr admin" -> "hr_admin")
export function normalizeRole(role) {
  if (!role) return 'employee';
  const clean = String(role).trim().toLowerCase();
  if (clean === 'hr admin' || clean === 'hr_admin') return 'hr_admin';
  return 'employee';
}

// Raw employee source data from brief CSV
// E001 (Priya Nair, Production, 09:00, no): CL 8/3 (5 left), SL 6/1 (5 left), EL 15/4 (11 left)
// E002 (Rahul Mehta, Production, 09:00, no): CL 8/8 (0 left), SL 6/0 (6 left), EL 15/10 (5 left)
// E003 (Sneha Kulkarni, Accounts, 10:00, no): CL 8/2 (6 left), SL 6/5 (1 left), EL 15/0 (15 left)
// E004 (Arjun Rao, Sales, 09:00, no): CL 8/0 (8 left), SL 6/0 (6 left), EL 15/12 (3 left)
// E005 (Fatima Shaikh, HR, 09:30, no, hr_admin): CL 8/1 (7 left), SL 6/0 (6 left), EL 15/2 (13 left)
// E006 (Vikram Joshi, Sales, 09:00, yes): CL 8/4 (4 left), SL 6/0 (6 left), EL 0/0 (0 left)
const rawEmployees = [
  {
    employee_id: 'E001',
    name: 'Priya Nair',
    email: 'priya@acme.test',
    raw_role: 'employee',
    department: 'Production',
    shift_start: '09:00',
    on_probation: 0,
    cl_entitled: 8, cl_used: 3, cl_remaining: 5,
    sl_entitled: 6, sl_used: 1, sl_remaining: 5,
    el_entitled: 15, el_used: 4, el_remaining: 11
  },
  {
    employee_id: 'E002',
    name: 'Rahul Mehta',
    email: 'rahul@acme.test',
    raw_role: 'employee',
    department: 'Production',
    shift_start: '09:00',
    on_probation: 0,
    cl_entitled: 8, cl_used: 8, cl_remaining: 0, // 0 CL remaining -> late mark deductions go to pay
    sl_entitled: 6, sl_used: 0, sl_remaining: 6,
    el_entitled: 15, el_used: 10, el_remaining: 5
  },
  {
    employee_id: 'E003',
    name: 'Sneha Kulkarni',
    email: 'sneha@acme.test',
    raw_role: 'employee',
    department: 'Accounts',
    shift_start: '10:00',
    on_probation: 0,
    cl_entitled: 8, cl_used: 2, cl_remaining: 6,
    sl_entitled: 6, sl_used: 5, sl_remaining: 1,
    el_entitled: 15, el_used: 0, el_remaining: 15
  },
  {
    employee_id: 'E004',
    name: 'Arjun Rao',
    email: 'arjun@acme.test',
    raw_role: 'employee',
    department: 'Sales',
    shift_start: '09:00',
    on_probation: 0,
    cl_entitled: 8, cl_used: 0, cl_remaining: 8,
    sl_entitled: 6, sl_used: 0, sl_remaining: 6,
    el_entitled: 15, el_used: 12, el_remaining: 3
  },
  {
    employee_id: 'E005',
    name: 'Fatima Shaikh',
    email: 'fatima@acme.test',
    raw_role: 'hr admin', // Normalization rule applies: "hr admin" -> "hr_admin"
    department: 'HR',
    shift_start: '09:30',
    on_probation: 0,
    cl_entitled: 8, cl_used: 1, cl_remaining: 7,
    sl_entitled: 6, sl_used: 0, sl_remaining: 6,
    el_entitled: 15, el_used: 2, el_remaining: 13
  },
  {
    employee_id: 'E006',
    name: 'Vikram Joshi',
    email: 'vikram@acme.test',
    raw_role: 'employee',
    department: 'Sales',
    shift_start: '09:00',
    on_probation: 1, // On active probation
    cl_entitled: 8, cl_used: 4, cl_remaining: 4,
    sl_entitled: 6, sl_used: 0, sl_remaining: 6,
    el_entitled: 0, el_used: 0, el_remaining: 0 // Probation has 0 EL
  }
];

const insertEmployee = db.prepare(`
  INSERT INTO employees (employee_id, name, email, password_hash, role, department, shift_start, on_probation)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertBalance = db.prepare(`
  INSERT INTO leave_balances (
    employee_id, cl, sl, el, casual_leave, sick_leave, annual_leave,
    cl_entitled, cl_used, sl_entitled, sl_used, el_entitled, el_used
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const emp of rawEmployees) {
  const normalizedRole = normalizeRole(emp.raw_role);
  insertEmployee.run(
    emp.employee_id,
    emp.name,
    emp.email,
    defaultPasswordHash,
    normalizedRole,
    emp.department,
    emp.shift_start,
    emp.on_probation
  );

  insertBalance.run(
    emp.employee_id,
    emp.cl_remaining,
    emp.sl_remaining,
    emp.el_remaining,
    emp.cl_remaining, // alias casual_leave
    emp.sl_remaining, // alias sick_leave
    emp.el_remaining, // alias annual_leave
    emp.cl_entitled,
    emp.cl_used,
    emp.sl_entitled,
    emp.sl_used,
    emp.el_entitled,
    emp.el_used
  );
}

// 3. Insert Initial Leave Requests exactly as per brief CSV:
// - LR001 pending CL for E001 on 2026-10-22
// - LR002 approved SL for E003 (2026-10-14 to 2026-10-15)
// - LR003 approved EL for E004 (2026-10-05 to 2026-10-07)
const rawLeaveRequests = [
  {
    request_id: 'LR001',
    employee_id: 'E001',
    leave_type: 'CL',
    from_date: '2026-10-22',
    to_date: '2026-10-22',
    days_count: 1,
    reason: 'Personal work',
    status: 'pending',
    created_at: '2026-10-20T09:30:00.000Z'
  },
  {
    request_id: 'LR002',
    employee_id: 'E003',
    leave_type: 'SL',
    from_date: '2026-10-14',
    to_date: '2026-10-15',
    days_count: 2,
    reason: 'Viral fever',
    status: 'approved',
    created_at: '2026-10-13T10:00:00.000Z'
  },
  {
    request_id: 'LR003',
    employee_id: 'E004',
    leave_type: 'EL',
    from_date: '2026-10-05',
    to_date: '2026-10-07',
    days_count: 3,
    reason: 'Family vacation',
    status: 'approved',
    created_at: '2026-09-28T11:00:00.000Z'
  }
];

const insertLeaveRequest = db.prepare(`
  INSERT INTO leave_requests (request_id, employee_id, leave_type, from_date, to_date, days_count, reason, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const lr of rawLeaveRequests) {
  insertLeaveRequest.run(
    lr.request_id,
    lr.employee_id,
    lr.leave_type,
    lr.from_date,
    lr.to_date,
    lr.days_count,
    lr.reason,
    lr.status,
    lr.created_at
  );
}

// 4. Attendance Seeding: EXACT 15 rows from assignment brief's attendance.csv
// Strictly 5 rows for E001, 5 rows for E002, 5 rows for E004 (Oct 19–23, 2026).
// ZERO synthetic or filler rows for E003 (Sneha), E005 (Fatima), or E006 (Vikram).
const insertAttendance = db.prepare(`
  INSERT INTO attendance (employee_id, date, check_in, check_out, status, notes)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const rawAttendanceRecords = [
  // E001 - Priya Nair (Production, shift 09:00)
  { employee_id: 'E001', date: '2026-10-19', check_in: '09:05:00', check_out: '18:00:00', status: 'present', notes: 'On time (within grace)' },
  { employee_id: 'E001', date: '2026-10-20', check_in: '09:00:00', check_out: '18:00:00', status: 'present', notes: 'On time' },
  { employee_id: 'E001', date: '2026-10-21', check_in: '09:10:00', check_out: '18:00:00', status: 'present', notes: 'On time (within grace)' },
  { employee_id: 'E001', date: '2026-10-22', check_in: null, check_out: null, status: 'on_leave', notes: 'Pending casual leave application (LR001)' },
  { employee_id: 'E001', date: '2026-10-23', check_in: '09:00:00', check_out: '18:00:00', status: 'present', notes: 'On time' },

  // E002 - Rahul Mehta (Production, shift 09:00) - 3 late marks in October
  { employee_id: 'E002', date: '2026-10-19', check_in: '09:40:00', check_out: '18:30:00', status: 'late', notes: '40 mins late' },
  { employee_id: 'E002', date: '2026-10-20', check_in: '09:35:00', check_out: '18:00:00', status: 'late', notes: '35 mins late' },
  { employee_id: 'E002', date: '2026-10-21', check_in: '09:16:00', check_out: '18:00:00', status: 'late', notes: '16 mins late - 3rd late mark' },
  { employee_id: 'E002', date: '2026-10-22', check_in: '09:00:00', check_out: '18:00:00', status: 'present', notes: 'On time' },
  { employee_id: 'E002', date: '2026-10-23', check_in: '09:02:00', check_out: '18:00:00', status: 'present', notes: 'On time (within 15m grace)' },

  // E004 - Arjun Rao (Sales, shift 09:00) - Missed punch Oct 21 & Overtime Oct 22
  { employee_id: 'E004', date: '2026-10-19', check_in: '09:00:00', check_out: '18:00:00', status: 'present', notes: 'On time' },
  { employee_id: 'E004', date: '2026-10-20', check_in: '09:00:00', check_out: '18:00:00', status: 'present', notes: 'On time' },
  { employee_id: 'E004', date: '2026-10-21', check_in: '09:00:00', check_out: null, status: 'present', notes: 'Missed check-out punch (requires regularisation within 3 days)' },
  { employee_id: 'E004', date: '2026-10-22', check_in: '09:00:00', check_out: '19:30:00', status: 'present', notes: 'Overtime worked (10.5h total, 1h 30m overtime)' },
  { employee_id: 'E004', date: '2026-10-23', check_in: '09:00:00', check_out: '18:00:00', status: 'present', notes: 'On time' }
];

for (const att of rawAttendanceRecords) {
  insertAttendance.run(
    att.employee_id,
    att.date,
    att.check_in,
    att.check_out,
    att.status,
    att.notes
  );
}

console.log('Seed completed successfully:');
console.log(`- 6 employees seeded with exact brief CSV profiles`);
console.log(`- Exact leave balances (CL, SL, EL) initialized`);
console.log(`- 3 leave requests seeded (LR001 pending CL E001, LR002 approved SL E003, LR003 approved EL E004)`);
console.log(`- Exactly 15 attendance rows seeded (5 for E001, 5 for E002, 5 for E004; 0 for E003/E005/E006)`);
