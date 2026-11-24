import bcrypt from 'bcryptjs';
import db from './index.js';

console.log('Seeding SQLite database...');

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
    annual_leave REAL NOT NULL DEFAULT 0,
    sick_leave REAL NOT NULL DEFAULT 0,
    casual_leave REAL NOT NULL DEFAULT 0,
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
    request_id TEXT,
    employee_id TEXT NOT NULL,
    leave_type TEXT NOT NULL CHECK(leave_type IN ('annual', 'sick', 'casual', 'unpaid')),
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

// Raw employee source data
// NOTE: E005 raw role is "hr admin" (with space), which must be normalized to "hr_admin"
const rawEmployees = [
  {
    employee_id: 'E001',
    name: 'Priya Nair',
    email: 'priya@acme.test',
    raw_role: 'employee',
    department: 'Engineering',
    shift_start: '09:00',
    on_probation: 0,
    balances: { annual: 12, sick: 6, casual: 3 }
  },
  {
    employee_id: 'E002',
    name: 'Rahul Mehta',
    email: 'rahul@acme.test',
    raw_role: 'employee',
    department: 'Manufacturing',
    shift_start: '08:00',
    on_probation: 0,
    balances: { annual: 10, sick: 5, casual: 2 }
  },
  {
    employee_id: 'E003',
    name: 'Sneha Kulkarni',
    email: 'sneha@acme.test',
    raw_role: 'employee',
    department: 'Quality',
    shift_start: '09:00',
    on_probation: 0,
    balances: { annual: 15, sick: 7, casual: 4 }
  },
  {
    employee_id: 'E004',
    name: 'Arjun Rao',
    email: 'arjun@acme.test',
    raw_role: 'employee',
    department: 'Assembly',
    shift_start: '08:00',
    on_probation: 0,
    balances: { annual: 8, sick: 4, casual: 1 }
  },
  {
    employee_id: 'E005',
    name: 'Fatima Shaikh',
    email: 'fatima@acme.test',
    raw_role: 'hr admin', // Normalization rule applies here
    department: 'HR',
    shift_start: '09:00',
    on_probation: 0,
    balances: { annual: 18, sick: 10, casual: 6 }
  },
  {
    employee_id: 'E006',
    name: 'Vikram Joshi',
    email: 'vikram@acme.test',
    raw_role: 'employee',
    department: 'Operations',
    shift_start: '09:00',
    on_probation: 1, // On active probation
    balances: { annual: 0, sick: 5, casual: 3 }
  }
];

// Helper to normalize roles
function normalizeRole(role) {
  if (role === 'hr admin' || role === 'hr_admin') return 'hr_admin';
  return 'employee';
}

const insertEmployee = db.prepare(`
  INSERT INTO employees (employee_id, name, email, password_hash, role, department, shift_start, on_probation)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertBalance = db.prepare(`
  INSERT INTO leave_balances (employee_id, annual_leave, sick_leave, casual_leave)
  VALUES (?, ?, ?, ?)
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
    emp.balances.annual,
    emp.balances.sick,
    emp.balances.casual
  );
}

// 3. Insert Initial Leave Requests
// ASSUMPTION DOCUMENTATION:
// In the assignment brief, LR003 has employee_id '2004', which is a typo for E004 (Arjun Rao).
// Corrected to 'E004' to maintain foreign key integrity with the employees table.
const rawLeaveRequests = [
  {
    request_id: 'LR001',
    employee_id: 'E001',
    leave_type: 'casual',
    from_date: '2026-10-22',
    to_date: '2026-10-22',
    days_count: 1,
    reason: 'Personal work',
    status: 'pending',
    created_at: '2026-10-20T09:30:00.000Z'
  },
  {
    request_id: 'LR002',
    employee_id: 'E002',
    leave_type: 'sick',
    from_date: '2026-10-14',
    to_date: '2026-10-15',
    days_count: 2,
    reason: 'Viral fever',
    status: 'approved',
    created_at: '2026-10-13T10:00:00.000Z'
  },
  {
    request_id: 'LR003',
    // Corrected from '2004' typo in the brief to 'E004' (Arjun Rao)
    employee_id: 'E004',
    leave_type: 'annual',
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

// 4. Attendance Seeding (October 2026 Business Days)
// All weekdays in October 2026: Oct 1 - Oct 31 (22 working days)
const insertAttendance = db.prepare(`
  INSERT INTO attendance (employee_id, date, check_in, check_out, status, notes)
  VALUES (?, ?, ?, ?, ?, ?)
`);

// Helper to list weekdays in October 2026
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
    const shift = emp.shift_start; // "08:00" or "09:00"

    // Check if this date has approved or pending leave
    if (empId === 'E001' && date === '2026-10-22') {
      // Pending Casual Leave - no attendance check-in, marked as on_leave
      insertAttendance.run(empId, date, null, null, 'on_leave', 'Pending casual leave application (LR001)');
      continue;
    }
    if (empId === 'E002' && (date === '2026-10-14' || date === '2026-10-15')) {
      // Approved Sick Leave
      insertAttendance.run(empId, date, null, null, 'on_leave', 'Approved sick leave (LR002)');
      continue;
    }
    if (empId === 'E004' && (date === '2026-10-05' || date === '2026-10-06' || date === '2026-10-07')) {
      // Approved Annual Leave
      insertAttendance.run(empId, date, null, null, 'on_leave', 'Approved annual leave (LR003)');
      continue;
    }

    // Reference week specific variations (2026-10-19 to 2026-10-23)
    if (date === '2026-10-19') {
      if (empId === 'E002') {
        // Overtime day: 07:55 to 17:30 (>9 hours worked)
        insertAttendance.run(empId, date, '07:55:00', '17:30:00', 'present', 'Overtime worked (9.58h)');
        continue;
      }
      if (empId === 'E004') {
        // Late mark: shift_start is 08:00, checked in at 08:35:10 (>15 min late)
        insertAttendance.run(empId, date, '08:35:10', '17:05:00', 'late', 'Late arrival (+35m)');
        continue;
      }
      if (empId === 'E006') {
        // Half day: 09:00:00 to 14:00:00 (5.0 hours)
        insertAttendance.run(empId, date, '09:00:00', '14:00:00', 'half_day', 'Half day worked (5.0h)');
        continue;
      }
    }

    if (date === '2026-10-20') {
      if (empId === 'E001') {
        // Late mark: shift_start is 09:00, checked in at 09:25:10 (>15 min late)
        insertAttendance.run(empId, date, '09:25:10', '17:35:00', 'late', 'Late check-in past shift start (09:00)');
        continue;
      }
      if (empId === 'E003') {
        // Missed punch: checked in at 09:02:00, check_out is null
        insertAttendance.run(empId, date, '09:02:00', null, 'present', 'Missed check-out scan');
        continue;
      }
    }

    // Default regular present day
    const checkInTime = shift === '08:00' ? '08:02:00' : '09:01:30';
    const checkOutTime = shift === '08:00' ? '17:05:00' : '17:32:00';
    insertAttendance.run(empId, date, checkInTime, checkOutTime, 'present', null);
  }
}

console.log('Seed completed successfully!');
console.log(`- Employees seeded: ${rawEmployees.length}`);
console.log(`- Leave balances initialized`);
console.log(`- Leave requests seeded: ${rawLeaveRequests.length}`);
console.log(`- Attendance records seeded for October 2026`);
