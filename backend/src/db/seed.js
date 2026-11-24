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

// 4. Attendance Seeding (October 2026 Weekdays: Oct 1 - Oct 30)
const insertAttendance = db.prepare(`
  INSERT INTO attendance (employee_id, date, check_in, check_out, status, notes)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const octWeekdays = [
  '2026-10-01', '2026-10-02',
  '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09',
  '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16',
  '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23',
  '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'
];

for (const date of octWeekdays) {
  for (const emp of rawEmployees) {
    const empId = emp.employee_id;
    const shift = emp.shift_start;

    // Leave coverage checks
    if (empId === 'E001' && date === '2026-10-22') {
      // Pending CL (LR001)
      insertAttendance.run(empId, date, null, null, 'on_leave', 'Pending casual leave application (LR001)');
      continue;
    }
    if (empId === 'E003' && (date === '2026-10-14' || date === '2026-10-15')) {
      // Approved SL (LR002)
      insertAttendance.run(empId, date, null, null, 'on_leave', 'Approved sick leave (LR002)');
      continue;
    }
    if (empId === 'E004' && (date === '2026-10-05' || date === '2026-10-06' || date === '2026-10-07')) {
      // Approved EL (LR003)
      insertAttendance.run(empId, date, null, null, 'on_leave', 'Approved earned leave (LR003)');
      continue;
    }

    // Specific brief events:
    // 1. Rahul (E002, Production, shift 09:00): 3 late marks in October 2026
    if (empId === 'E002') {
      if (date === '2026-10-19') {
        insertAttendance.run(empId, date, '09:40:00', '18:30:00', 'late', '40 mins late');
        continue;
      }
      if (date === '2026-10-20') {
        insertAttendance.run(empId, date, '09:35:00', '18:00:00', 'late', '35 mins late');
        continue;
      }
      if (date === '2026-10-21') {
        insertAttendance.run(empId, date, '09:16:00', '18:00:00', 'late', '16 mins late - 3rd late mark');
        continue;
      }
      if (date === '2026-10-22') {
        insertAttendance.run(empId, date, '09:00:00', '18:00:00', 'present', 'On time');
        continue;
      }
      if (date === '2026-10-23') {
        insertAttendance.run(empId, date, '09:02:00', '18:00:00', 'present', 'On time (within 15m grace)');
        continue;
      }
    }

    // 2. Priya (E001, Production, shift 09:00) exact timestamps for reference week
    if (empId === 'E001') {
      if (date === '2026-10-19') {
        insertAttendance.run(empId, date, '09:05:00', '18:00:00', 'present', 'On time (within grace)');
        continue;
      }
      if (date === '2026-10-20') {
        insertAttendance.run(empId, date, '09:00:00', '18:00:00', 'present', 'On time');
        continue;
      }
      if (date === '2026-10-21') {
        insertAttendance.run(empId, date, '09:10:00', '18:00:00', 'present', 'On time (within grace)');
        continue;
      }
      if (date === '2026-10-23') {
        insertAttendance.run(empId, date, '09:00:00', '18:00:00', 'present', 'On time');
        continue;
      }
    }

    // 3. Arjun (E004, Sales, shift 09:00):
    // Oct 21: Missed punch (check-in 09:00, no check-out)
    // Oct 22: Overtime (09:00 to 19:30 = 10.5h, which is 1h 30m overtime > 9h)
    if (empId === 'E004') {
      if (date === '2026-10-19') {
        insertAttendance.run(empId, date, '09:00:00', '18:00:00', 'present', 'On time');
        continue;
      }
      if (date === '2026-10-20') {
        insertAttendance.run(empId, date, '09:00:00', '18:00:00', 'present', 'On time');
        continue;
      }
      if (date === '2026-10-21') {
        insertAttendance.run(empId, date, '09:00:00', null, 'present', 'Missed check-out punch (requires regularisation within 3 days)');
        continue;
      }
      if (date === '2026-10-22') {
        insertAttendance.run(empId, date, '09:00:00', '19:30:00', 'present', 'Overtime worked (10.5h total, 1h 30m overtime)');
        continue;
      }
      if (date === '2026-10-23') {
        insertAttendance.run(empId, date, '09:00:00', '18:00:00', 'present', 'On time');
        continue;
      }
    }

    // Standard present day based on assigned shift_start
    let checkIn = '09:01:00';
    let checkOut = '17:31:00';

    if (shift === '08:00') {
      checkIn = '08:02:00';
      checkOut = '16:35:00';
    } else if (shift === '09:00') {
      checkIn = '09:02:00';
      checkOut = '17:35:00';
    } else if (shift === '09:30') {
      checkIn = '09:32:00';
      checkOut = '18:05:00';
    } else if (shift === '10:00') {
      checkIn = '10:02:00';
      checkOut = '18:35:00';
    }

    insertAttendance.run(empId, date, checkIn, checkOut, 'present', null);
  }
}

console.log('Seed completed successfully:');
console.log(`- 6 employees seeded with exact brief CSV profiles`);
console.log(`- Exact leave balances (CL, SL, EL) initialized`);
console.log(`- 3 leave requests seeded (LR001 pending CL E001, LR002 approved SL E003, LR003 approved EL E004)`);
console.log(`- Exact attendance scenarios seeded (Rahul 3 late marks, Arjun missed punch & 1h30m overtime)`);
