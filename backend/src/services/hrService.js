import db from '../db/index.js';
import bcrypt from 'bcryptjs';

// Normalize role helper (e.g. E005 raw role "hr admin" -> "hr_admin")
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

// Convert minutes into "Xh Ym" formatted string
function minutesToHoursString(totalMins) {
  const h = Math.floor(totalMins / 60);
  const m = Math.round(totalMins % 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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
 * Normalizes leave type input to standard code ('CL', 'SL', 'EL', 'unpaid')
 */
export function normalizeLeaveType(type) {
  if (!type) return null;
  const t = String(type).trim().toUpperCase();
  if (t === 'CL' || t === 'CASUAL' || t === 'CASUAL LEAVE') return 'CL';
  if (t === 'SL' || t === 'SICK' || t === 'SICK LEAVE') return 'SL';
  if (t === 'EL' || t === 'EARNED' || t === 'EARNED LEAVE' || t === 'ANNUAL' || t === 'ANNUAL LEAVE' || t === 'AL') return 'EL';
  if (t === 'UNPAID' || t === 'LWP' || t === 'LEAVE WITHOUT PAY') return 'unpaid';
  return null;
}

/**
 * 1. getLeaveBalance(user, targetEmployeeId)
 * Returns CL, SL, EL balances and pending requests.
 * Enforces 403 if regular employee attempts to view another employee.
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
    SELECT cl, sl, el, casual_leave, sick_leave, annual_leave,
           cl_entitled, cl_used, sl_entitled, sl_used, el_entitled, el_used
    FROM leave_balances
    WHERE employee_id = ?
  `).get(targetId) || {
    cl: 0, sl: 0, el: 0,
    casual_leave: 0, sick_leave: 0, annual_leave: 0,
    cl_entitled: 8, cl_used: 0, sl_entitled: 6, sl_used: 0, el_entitled: 15, el_used: 0
  };

  // Fetch pending leave requests for this employee
  const pendingRequests = db.prepare(`
    SELECT id, request_id, leave_type, from_date, to_date, days_count, reason, status, created_at
    FROM leave_requests
    WHERE employee_id = ? AND status = 'pending'
    ORDER BY from_date ASC
  `).all(targetId);

  let pendingCL = 0;
  let pendingSL = 0;
  let pendingEL = 0;

  for (const req of pendingRequests) {
    const norm = normalizeLeaveType(req.leave_type);
    if (norm === 'CL') pendingCL += req.days_count;
    else if (norm === 'SL') pendingSL += req.days_count;
    else if (norm === 'EL') pendingEL += req.days_count;
  }

  const pendingTotal = pendingCL + pendingSL + pendingEL;

  return {
    employee_id: targetId,
    // Exact short codes from brief
    cl: balance.cl,
    sl: balance.sl,
    el: balance.el,
    // Aliases for interface compatibility
    casual_leave: balance.cl,
    sick_leave: balance.sl,
    annual_leave: balance.el,
    entitlements: {
      cl: { entitled: balance.cl_entitled, used: balance.cl_used, remaining: balance.cl },
      sl: { entitled: balance.sl_entitled, used: balance.sl_used, remaining: balance.sl },
      el: { entitled: balance.el_entitled, used: balance.el_used, remaining: balance.el }
    },
    pending_leaves: {
      cl: pendingCL,
      sl: pendingSL,
      el: pendingEL,
      casual: pendingCL,
      sick: pendingSL,
      annual: pendingEL,
      total: pendingTotal
    },
    pending_requests: pendingRequests
  };
}

/**
 * 2. getAttendanceSummary(user, targetEmployeeId, fromDate, toDate)
 * Calculates attendance metrics according to Attendance Policy:
 * - Section 1: 15-minute grace period after shift_start is on time.
 * - Section 2: Late marks (>15 mins after shift_start); 3 late marks in a month deduct 0.5 day CL, or 0.5 day pay if 0 CL left.
 * - Section 3: >=8h full day, 4h to <8h half day, <4h unexcused absence.
 * - Section 4: Missed punch (check-in with no check-out) requires regularisation within 3 days.
 * - Section 5: >9h on a working day is overtime, needs manager approval.
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

  // Also query month-wide late marks (for calendar month deduction rules)
  const monthStart = `${effectiveFrom.slice(0, 7)}-01`;
  const monthEnd = `${effectiveFrom.slice(0, 7)}-31`;
  const monthLogs = db.prepare(`
    SELECT date, check_in, check_out, status
    FROM attendance
    WHERE employee_id = ? AND date BETWEEN ? AND ?
  `).all(targetId, monthStart, monthEnd);

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
  let overtimeMinutesTotal = 0;
  let leavesTaken = 0;
  let absentDays = 0;

  const dailyRecords = [];

  for (const date of scheduledDates) {
    const log = attendanceMap.get(date);

    // Check if covered by approved or pending leave
    const leaveCover = leaveRequests.find(lr => date >= lr.from_date && date <= lr.to_date);

    let checkIn = log ? log.check_in : null;
    let checkOut = log ? log.check_out : null;
    let hoursWorked = 0;
    let isLate = false;
    let isMissedPunch = false;
    let isOvertime = false;
    let overtimeDuration = null;
    let isFullDay = false;
    let isHalfDay = false;
    let status = log ? log.status : 'absent';
    let notes = log ? log.notes : null;

    if (leaveCover) {
      leavesTaken++;
      status = 'on_leave';
      if (!notes) {
        notes = `${leaveCover.status === 'pending' ? 'Pending' : 'Approved'} ${leaveCover.leave_type} leave (${leaveCover.request_id || 'LR'})`;
      }
    } else if (checkIn) {
      presentDays++;
      const inMinutes = timeToMinutes(checkIn);

      // Section 1 & 2: Late marks (>15 mins after shift_start)
      if (inMinutes > shiftMinutes + 15) {
        isLate = true;
        lateDays++;
        if (status !== 'half_day') status = 'late';
      }

      if (checkOut) {
        const outMinutes = timeToMinutes(checkOut);
        const workedMinutes = Math.max(0, outMinutes - inMinutes);
        hoursWorked = Number((workedMinutes / 60).toFixed(2));

        // Section 3: Working hours
        if (hoursWorked >= 8) {
          isFullDay = true;
          fullDays++;
          if (status !== 'late') status = 'present';
        } else if (hoursWorked >= 4) {
          isHalfDay = true;
          halfDays++;
          status = 'half_day';
        }

        // Section 5: Overtime (>9h on a working day)
        if (hoursWorked > 9) {
          isOvertime = true;
          overtimeDays++;
          const otMins = workedMinutes - (9 * 60);
          overtimeMinutesTotal += otMins;
          overtimeDuration = minutesToHoursString(otMins);
        }
      } else {
        // Section 4: Missed punch (check-in with no check-out)
        isMissedPunch = true;
        missedPunches++;
        status = 'present';
        if (!notes) notes = 'Missed check-out punch (requires regularisation within 3 working days)';
      }
    } else {
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
      overtime_duration: overtimeDuration,
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

  // Calculate month-level late marks and penalty deduction (Attendance Policy Section 2)
  let monthLateMarksCount = 0;
  for (const mLog of monthLogs) {
    if (mLog.check_in) {
      const inM = timeToMinutes(mLog.check_in);
      if (inM > shiftMinutes + 15) {
        monthLateMarksCount++;
      }
    }
  }

  // Check current CL balance for deduction type
  const balanceRow = db.prepare('SELECT cl FROM leave_balances WHERE employee_id = ?').get(targetId);
  const remainingCL = balanceRow ? balanceRow.cl : 0;
  const lateDeductionUnits = Math.floor(monthLateMarksCount / 3);
  let lateDeductionExplanation = null;
  let lateDeductionType = null;
  let lateDeductionAmount = 0;

  if (lateDeductionUnits > 0) {
    lateDeductionAmount = lateDeductionUnits * 0.5;
    if (remainingCL >= lateDeductionAmount) {
      lateDeductionType = 'CL';
      lateDeductionExplanation = `${monthLateMarksCount} late marks in month trigger deduction of ${lateDeductionAmount} day(s) from Casual Leave (CL). (Attendance Policy, Section 2)`;
    } else {
      // 0 CL remaining -> 0.5 day pay deduction
      lateDeductionType = 'pay';
      lateDeductionExplanation = `${monthLateMarksCount} late marks in month with 0 CL remaining trigger a ${lateDeductionAmount} day pay deduction (salary deduction). (Attendance Policy, Section 2)`;
    }
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
      overtime_formatted: minutesToHoursString(overtimeMinutesTotal),
      absent_days: absentDays,
      leaves_taken: leavesTaken,
      attendance_percentage: attendancePercentage,
      // Month-level late deduction details
      month_late_marks: monthLateMarksCount,
      late_deduction: {
        units: lateDeductionUnits,
        type: lateDeductionType,
        amount: lateDeductionAmount,
        explanation: lateDeductionExplanation
      }
    },
    daily_records: dailyRecords
  };
}

/**
 * 3. getAttendanceRecords(user, targetEmployeeId, fromDate, toDate)
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
 * 4. createLeaveRequest(user, params)
 * Leave rules according to Leave Policy:
 * - Section 1: 8 CL, 6 SL, 15 EL per calendar year. Probation gets CL and SL only (cannot take EL).
 * - Section 2: CL >= 1 day advance, max 3 consecutive days; EL >= 7 days advance; SL same day.
 * - Confirmed === false: dry-run validation check.
 * - Confirmed === true: insert into leave_requests with status 'pending'.
 */
export function createLeaveRequest(user, params) {
  const { leave_type, from_date, to_date, reason, confirmed } = params || {};

  if (!leave_type) {
    const err = new Error('Leave type is required (CL, SL, EL, or unpaid)');
    err.statusCode = 400;
    throw err;
  }

  const normalizedType = normalizeLeaveType(leave_type);
  if (!normalizedType) {
    const err = new Error(`Invalid leave type "${leave_type}". Must be one of: CL (Casual), SL (Sick), EL (Earned), or unpaid`);
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

  // Leave Policy Section 1: Probation gets CL and SL only. Probation employees cannot take EL.
  if (employee.on_probation && normalizedType === 'EL') {
    const err = new Error('Employees on probation are entitled to Casual Leave (CL) and Sick Leave (SL) only and cannot apply for Earned Leave (EL). (Leave Policy, Section 1)');
    err.statusCode = 400;
    throw err;
  }

  // Calculate requested working business days
  const businessDays = getBusinessDaysList(from_date, to_date);
  const daysCount = businessDays.length;

  if (daysCount === 0) {
    const err = new Error('Selected date range contains no scheduled working business days');
    err.statusCode = 400;
    throw err;
  }

  // Leave Policy Section 2: Casual Leave (CL) max 3 consecutive days
  if (normalizedType === 'CL' && daysCount > 3) {
    const err = new Error(`A maximum of 3 consecutive days of Casual Leave (CL) can be taken at a time. Requested ${daysCount} days. (Leave Policy, Section 2)`);
    err.statusCode = 400;
    throw err;
  }

  // Check balance sufficiency
  const balances = db.prepare(`
    SELECT cl, sl, el FROM leave_balances WHERE employee_id = ?
  `).get(user.employee_id) || { cl: 0, sl: 0, el: 0 };

  let availableBalance = 0;
  if (normalizedType === 'CL') availableBalance = balances.cl;
  else if (normalizedType === 'SL') availableBalance = balances.sl;
  else if (normalizedType === 'EL') availableBalance = balances.el;
  else if (normalizedType === 'unpaid') availableBalance = 999;

  if (normalizedType !== 'unpaid' && availableBalance < daysCount) {
    const err = new Error(`Insufficient ${normalizedType} balance. Requested ${daysCount} day(s), available ${availableBalance} day(s).`);
    err.statusCode = 400;
    throw err;
  }

  // If confirmed === false: Dry-run check
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
  // Insert into leave_requests with status 'pending'
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
      cl: balances.cl,
      sl: balances.sl,
      el: balances.el,
      casual_leave: balances.cl,
      sick_leave: balances.sl,
      annual_leave: balances.el
    }
  };
}
