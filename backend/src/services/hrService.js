import db from '../db/index.js';
import bcrypt from 'bcryptjs';

// Normalize role helper
export function normalizeRole(role) {
  if (!role) return 'employee';
  const clean = String(role).trim().toLowerCase();
  if (clean === 'hr admin' || clean === 'hr_admin') return 'hr_admin';
  return 'employee';
}

// Convert "HH:MM" or "HH:MM:SS" into minutes from midnight
function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':').map(Number);
  const hours = parts[0] || 0;
  const mins = parts[1] || 0;
  const secs = parts[2] || 0;
  return hours * 60 + mins + secs / 60;
}

// Helper to count business days (Mon-Fri) between two dates inclusive
export function getBusinessDaysList(fromDateStr, toDateStr) {
  const dates = [];
  const current = new Date(`${fromDateStr}T00:00:00Z`);
  const end = new Date(`${toDateStr}T00:00:00Z`);

  while (current <= end) {
    const dayOfWeek = current.getUTCDay();
    // 0 = Sunday, 6 = Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      dates.push(current.toISOString().slice(0, 10));
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Authenticates user credentials
 */
export function authenticateUser(email, password) {
  if (!email || !password) {
    const err = new Error('Email and password are required');
    err.statusCode = 400;
    throw err;
  }

  const employee = db.prepare('SELECT * FROM employees WHERE LOWER(email) = LOWER(?)').get(email);
  if (!employee) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const isValid = bcrypt.compareSync(password, employee.password_hash);
  if (!isValid) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  return {
    employee_id: employee.employee_id,
    name: employee.name,
    email: employee.email,
    role: normalizeRole(employee.role),
    department: employee.department,
    shift_start: employee.shift_start,
    on_probation: Boolean(employee.on_probation)
  };
}

/**
 * Retrieves employee record by ID
 */
export function getEmployeeById(employeeId) {
  const emp = db.prepare('SELECT * FROM employees WHERE employee_id = ?').get(employeeId);
  if (!emp) {
    const err = new Error(`Employee with ID ${employeeId} not found`);
    err.statusCode = 404;
    throw err;
  }

  return {
    employee_id: emp.employee_id,
    name: emp.name,
    email: emp.email,
    role: normalizeRole(emp.role),
    department: emp.department,
    shift_start: emp.shift_start,
    on_probation: Boolean(emp.on_probation)
  };
}

/**
 * 1. getLeaveBalance(user, targetEmployeeId)
 * Enforce in code that if user.role !== 'hr_admin' and targetEmployeeId !== user.employee_id, throw 403 Forbidden.
 * Include pending leave days (such as E001's 1 pending CL on 2026-10-22) alongside remaining balance.
 */
export function getLeaveBalance(user, targetEmployeeId) {
  const targetId = targetEmployeeId || user.employee_id;
  const userRole = normalizeRole(user.role);

  // RBAC enforcement: only hr_admin can view other employees' leave balances
  if (userRole !== 'hr_admin' && targetId !== user.employee_id) {
    const err = new Error('Forbidden: You do not have permission to view leave balance for this employee');
    err.statusCode = 403;
    throw err;
  }

  const employee = getEmployeeById(targetId);

  const balance = db.prepare(`
    SELECT annual_leave, sick_leave, casual_leave
    FROM leave_balances
    WHERE employee_id = ?
  `).get(targetId) || { annual_leave: 0, sick_leave: 0, casual_leave: 0 };

  // Fetch pending leave requests for this employee
  const pendingRequests = db.prepare(`
    SELECT id, request_id, leave_type, from_date, to_date, days_count, reason, status, created_at
    FROM leave_requests
    WHERE employee_id = ? AND status = 'pending'
    ORDER BY from_date ASC
  `).all(targetId);

  let pendingAnnual = 0;
  let pendingSick = 0;
  let pendingCasual = 0;

  for (const req of pendingRequests) {
    if (req.leave_type === 'annual') pendingAnnual += req.days_count;
    else if (req.leave_type === 'sick') pendingSick += req.days_count;
    else if (req.leave_type === 'casual') pendingCasual += req.days_count;
  }

  const pendingTotal = pendingAnnual + pendingSick + pendingCasual;

  return {
    employee_id: targetId,
    annual_leave: balance.annual_leave,
    sick_leave: balance.sick_leave,
    casual_leave: balance.casual_leave,
    pending_leaves: {
      annual: pendingAnnual,
      sick: pendingSick,
      casual: pendingCasual,
      total: pendingTotal
    },
    pending_requests: pendingRequests
  };
}

/**
 * 2. getAttendanceSummary(user, targetEmployeeId, fromDate, toDate)
 * Enforce 403 in code if user.role !== 'hr_admin' and targetEmployeeId !== user.employee_id.
 * Calculate exact hours worked per day, late marks (>15 mins after shift_start), full days (>=8h),
 * half days (4h to <8h), missed punches (empty check_out), overtime (>9h),
 * and cross-reference leave_requests so approved/pending leaves are marked as covered by leave
 * rather than unexcused absences.
 */
export function getAttendanceSummary(user, targetEmployeeId, fromDate, toDate) {
  const targetId = targetEmployeeId || user.employee_id;
  const userRole = normalizeRole(user.role);

  // RBAC enforcement: only hr_admin can inspect attendance summaries for other employees
  if (userRole !== 'hr_admin' && targetId !== user.employee_id) {
    const err = new Error('Forbidden: HR Admin access required');
    err.statusCode = 403;
    throw err;
  }

  const employee = getEmployeeById(targetId);

  // Default to reference week (Oct 19 - Oct 23, 2026) if not specified
  const effectiveFrom = fromDate || '2026-10-19';
  const effectiveTo = toDate || '2026-10-23';

  if (effectiveFrom > effectiveTo) {
    const err = new Error('Invalid date range: from date must be on or before to date');
    err.statusCode = 400;
    throw err;
  }

  // Get scheduled working business days in this window
  const scheduledDates = getBusinessDaysList(effectiveFrom, effectiveTo);

  // Fetch all attendance logs in this window
  const attendanceLogs = db.prepare(`
    SELECT date, check_in, check_out, status, notes
    FROM attendance
    WHERE employee_id = ? AND date BETWEEN ? AND ?
    ORDER BY date ASC
  `).all(targetId, effectiveFrom, effectiveTo);

  const attendanceMap = new Map();
  for (const log of attendanceLogs) {
    attendanceMap.set(log.date, log);
  }

  // Fetch all leave requests (approved or pending) that cover any part of this window
  const leaveRequests = db.prepare(`
    SELECT id, request_id, leave_type, from_date, to_date, days_count, reason, status
    FROM leave_requests
    WHERE employee_id = ?
      AND status IN ('approved', 'pending')
      AND from_date <= ? AND to_date >= ?
  `).all(targetId, effectiveTo, effectiveFrom);

  const shiftMinutes = timeToMinutes(employee.shift_start) || 540; // Default 09:00 = 540m

  let presentDays = 0;
  let fullDays = 0;
  let halfDays = 0;
  let lateDays = 0;
  let missedPunches = 0;
  let overtimeDays = 0;
  let leavesTaken = 0;
  let absentDays = 0;

  const dailyRecords = [];

  for (const date of scheduledDates) {
    const log = attendanceMap.get(date);

    // Check if covered by leave
    const leaveCover = leaveRequests.find(lr => date >= lr.from_date && date <= lr.to_date);

    let checkIn = log ? log.check_in : null;
    let checkOut = log ? log.check_out : null;
    let hoursWorked = 0;
    let isLate = false;
    let isMissedPunch = false;
    let isOvertime = false;
    let isFullDay = false;
    let isHalfDay = false;
    let status = log ? log.status : 'absent';
    let notes = log ? log.notes : null;

    if (leaveCover) {
      // Marked as covered by leave rather than unexcused absence
      leavesTaken++;
      status = 'on_leave';
      if (!notes) {
        notes = `${leaveCover.status === 'pending' ? 'Pending' : 'Approved'} ${leaveCover.leave_type} leave (${leaveCover.request_id || 'LR'})`;
      }
    } else if (checkIn) {
      presentDays++;
      const inMinutes = timeToMinutes(checkIn);

      // Late mark: checked in > 15 minutes after shift_start
      if (inMinutes > shiftMinutes + 15) {
        isLate = true;
        lateDays++;
        if (status !== 'half_day') status = 'late';
      }

      if (checkOut) {
        const outMinutes = timeToMinutes(checkOut);
        const workedMinutes = Math.max(0, outMinutes - inMinutes);
        hoursWorked = Number((workedMinutes / 60).toFixed(2));

        if (hoursWorked >= 8) {
          isFullDay = true;
          fullDays++;
          if (status !== 'late') status = 'present';
        } else if (hoursWorked >= 4) {
          isHalfDay = true;
          halfDays++;
          status = 'half_day';
        }

        if (hoursWorked > 9) {
          isOvertime = true;
          overtimeDays++;
        }
      } else {
        // Empty check-out means missed punch
        isMissedPunch = true;
        missedPunches++;
        status = 'present';
        if (!notes) notes = 'Missed check-out punch';
      }
    } else {
      // No check in and no leave request = unexcused absence
      absentDays++;
      status = 'absent';
      if (!notes) notes = 'Unexcused absence';
    }

    dailyRecords.push({
      date,
      check_in: checkIn,
      check_out: checkOut,
      hours_worked: hoursWorked,
      status,
      is_late: isLate,
      is_missed_punch: isMissedPunch,
      is_overtime: isOvertime,
      is_full_day: isFullDay,
      is_half_day: isHalfDay,
      covered_by_leave: Boolean(leaveCover),
      leave_details: leaveCover ? {
        request_id: leaveCover.request_id,
        leave_type: leaveCover.leave_type,
        status: leaveCover.status,
        reason: leaveCover.reason
      } : null,
      notes
    });
  }

  const totalScheduledDays = scheduledDates.length;
  const attendancePercentage = totalScheduledDays > 0
    ? Number(((presentDays / totalScheduledDays) * 100).toFixed(1))
    : 100;

  return {
    employee: {
      employee_id: employee.employee_id,
      name: employee.name,
      department: employee.department,
      shift_start: employee.shift_start
    },
    period: {
      from: effectiveFrom,
      to: effectiveTo
    },
    summary: {
      total_scheduled_days: totalScheduledDays,
      present_days: presentDays,
      full_days: fullDays,
      half_days: halfDays,
      late_days: lateDays,
      missed_punches: missedPunches,
      overtime_days: overtimeDays,
      absent_days: absentDays,
      leaves_taken: leavesTaken,
      attendance_percentage: attendancePercentage
    },
    daily_records: dailyRecords
  };
}

/**
 * Helper for GET /api/me/attendance
 * Retrieves attendance records for an employee within a date range
 */
export function getAttendanceRecords(user, targetEmployeeId, fromDate, toDate) {
  const targetId = targetEmployeeId || user.employee_id;
  const userRole = normalizeRole(user.role);

  if (userRole !== 'hr_admin' && targetId !== user.employee_id) {
    const err = new Error('Forbidden: You do not have permission to view attendance records for this employee');
    err.statusCode = 403;
    throw err;
  }

  if (!fromDate || !toDate) {
    const err = new Error('Query parameters "from" and "to" in YYYY-MM-DD format are required');
    err.statusCode = 400;
    throw err;
  }

  if (fromDate > toDate) {
    const err = new Error('Invalid date range: "from" must be before or equal to "to"');
    err.statusCode = 400;
    throw err;
  }

  const records = db.prepare(`
    SELECT date, check_in, check_out, status, notes
    FROM attendance
    WHERE employee_id = ? AND date BETWEEN ? AND ?
    ORDER BY date ASC
  `).all(targetId, fromDate, toDate);

  return {
    employee_id: targetId,
    from: fromDate,
    to: toDate,
    records
  };
}

/**
 * 3. createLeaveRequest(user, { leave_type, from_date, to_date, reason, confirmed })
 * Validate inputs (400 on invalid dates/types), check probation rules (E006 cannot apply for EL),
 * and only insert into leave_requests with status 'pending' when confirmed === true.
 */
export function createLeaveRequest(user, params) {
  const { leave_type, from_date, to_date, reason, confirmed } = params || {};

  if (!leave_type) {
    const err = new Error('Leave type is required (annual, sick, casual, unpaid)');
    err.statusCode = 400;
    throw err;
  }

  // Normalize aliases (e.g., 'EL' -> 'annual', 'SL' -> 'sick', 'CL' -> 'casual')
  let normalizedType = String(leave_type).toLowerCase().trim();
  if (normalizedType === 'el' || normalizedType === 'earned' || normalizedType === 'privilege') {
    normalizedType = 'annual';
  } else if (normalizedType === 'sl') {
    normalizedType = 'sick';
  } else if (normalizedType === 'cl' || normalizedType === 'emergency') {
    normalizedType = 'casual';
  } else if (normalizedType === 'lwp') {
    normalizedType = 'unpaid';
  }

  const validTypes = ['annual', 'sick', 'casual', 'unpaid'];
  if (!validTypes.includes(normalizedType)) {
    const err = new Error(`Invalid leave type "${leave_type}". Must be one of: annual, sick, casual, unpaid`);
    err.statusCode = 400;
    throw err;
  }

  // Validate date format YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(from_date) || !dateRegex.test(to_date)) {
    const err = new Error('Dates must be valid strings in YYYY-MM-DD format');
    err.statusCode = 400;
    throw err;
  }

  if (from_date > to_date) {
    const err = new Error('Invalid dates: from_date cannot be after to_date');
    err.statusCode = 400;
    throw err;
  }

  const employee = getEmployeeById(user.employee_id);

  // Probation rule check: Employees on probation (e.g., E006) cannot apply for EL / annual leave
  if (employee.on_probation && normalizedType === 'annual') {
    const err = new Error('Employees on probation are not eligible to apply for Annual Leave (Privilege/Earned Leave) during probation. (Leave Policy, Section 3)');
    err.statusCode = 400;
    throw err;
  }

  // Calculate requested working days
  const businessDays = getBusinessDaysList(from_date, to_date);
  const daysCount = businessDays.length;

  if (daysCount === 0) {
    const err = new Error('Selected date range contains no scheduled working business days');
    err.statusCode = 400;
    throw err;
  }

  // Policy check for Casual Leave: Max 2 consecutive days
  if (normalizedType === 'casual' && daysCount > 2) {
    const err = new Error(`Maximum consecutive casual leave permitted is 2 days. Requested ${daysCount} days. (Leave Policy, Section 2)`);
    err.statusCode = 400;
    throw err;
  }

  // Check balance sufficiency
  const balances = db.prepare(`
    SELECT annual_leave, sick_leave, casual_leave
    FROM leave_balances
    WHERE employee_id = ?
  `).get(user.employee_id) || { annual_leave: 0, sick_leave: 0, casual_leave: 0 };

  let availableBalance = 0;
  if (normalizedType === 'annual') availableBalance = balances.annual_leave;
  else if (normalizedType === 'sick') availableBalance = balances.sick_leave;
  else if (normalizedType === 'casual') availableBalance = balances.casual_leave;
  else if (normalizedType === 'unpaid') availableBalance = 999; // Unpaid leave not bounded by quota

  if (normalizedType !== 'unpaid' && availableBalance < daysCount) {
    const err = new Error(`Insufficient ${normalizedType} leave balance. Requested ${daysCount} day(s), available ${availableBalance} day(s).`);
    err.statusCode = 400;
    throw err;
  }

  // If confirmed === false (Dry-run validation check)
  if (!confirmed) {
    return {
      success: true,
      confirmed: false,
      message: 'Leave application validated successfully.',
      details: {
        employee_id: user.employee_id,
        leave_type: normalizedType,
        from_date,
        to_date,
        days_count: daysCount,
        reason: reason || 'Personal reasons'
      },
      available_balance: availableBalance,
      remaining_balance_after_approval: availableBalance - daysCount
    };
  }

  // If confirmed === true:
  // Only insert into leave_requests with status 'pending'
  const countRow = db.prepare('SELECT COUNT(*) as count FROM leave_requests').get();
  const nextIdNum = (countRow ? countRow.count : 0) + 1;
  const requestId = `LR${String(nextIdNum).padStart(3, '0')}`;
  const createdAt = new Date().toISOString();

  const insertStmt = db.prepare(`
    INSERT INTO leave_requests (request_id, employee_id, leave_type, from_date, to_date, days_count, reason, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
  `);

  const info = insertStmt.run(
    requestId,
    user.employee_id,
    normalizedType,
    from_date,
    to_date,
    daysCount,
    reason || 'Personal reasons',
    createdAt
  );

  return {
    success: true,
    confirmed: true,
    request: {
      id: info.lastInsertRowid,
      request_id: requestId,
      employee_id: user.employee_id,
      leave_type: normalizedType,
      from_date,
      to_date,
      days_count: daysCount,
      status: 'pending',
      created_at: createdAt
    },
    remaining_balance: {
      annual_leave: balances.annual_leave,
      sick_leave: balances.sick_leave,
      casual_leave: balances.casual_leave
    }
  };
}
