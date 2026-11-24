# Acme Manufacturing - Attendance & Punctuality Policy

## Section 1: Working Hours and Shift Timing
- Acme Manufacturing operates on structured shifts to ensure uninterrupted manufacturing and assembly line throughput.
- Standard employee shift start times are designated in employee profiles (`shift_start`, e.g., 08:00 AM, 09:00 AM, or 02:00 PM).
- Standard working hours comprise 8 operational hours plus a 60-minute lunch/rest break per full workday.

## Section 2: Punctuality, Grace Period, and Late Check-In
- **Punctuality Expectation**: All employees are expected to check in at their assigned station or biometric terminal at or before their designated `shift_start`.
- **Grace Period**: A grace window of 15 minutes is permitted. Check-ins up to 15 minutes past `shift_start` are marked as `present`.
- **Late Arrivals**: Check-ins arriving between 16 and 60 minutes after `shift_start` are designated as `late`. Three instances of `late` within a single calendar month result in deduction of a half-day casual leave.

## Section 3: Half-Day Attendance Thresholds
- Arrival between 61 minutes and 4 hours after `shift_start`, or departure more than 2 hours prior to scheduled shift end with supervisor approval, is logged as `half_day`.
- Arriving more than 4 hours after shift start without advance authorization is recorded as an unexcused absence (`absent`).

## Section 4: Unexcused Absence and Disciplinary Escalation
- Any absence without prior notice or leave request submission by 10:00 AM of the absence date is marked as unexcused (`absent`).
- Three consecutive unexcused absences trigger a mandatory HR inquiry and formal written notice.

## Section 5: Overtime and Shift Regularization
- Non-exempt plant operators and technicians working beyond 8 hours on a scheduled shift qualify for overtime calculation, subject to supervisor pre-approval.
- Missed biometric or check-in scans must be submitted for regularization within 48 hours accompanied by manager endorsement.

## Section 6: HR Admin Audit and Attendance Summaries
- HR Administrators possess full audit privileges to review employee attendance summaries across departments via the HR portal and administrative API endpoints (`GET /api/employees/:id/attendance-summary`).
- Employees hold access strictly to their individual attendance history (`GET /api/me/attendance`).
