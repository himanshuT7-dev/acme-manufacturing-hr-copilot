import jwt from 'jsonwebtoken';
import { normalizeRole, getEmployeeById } from '../services/hrService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production';

/**
 * JWT Authentication Middleware
 * Validates the Bearer token in Authorization header and attaches req.user
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or malformed Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Bearer token is empty' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Normalize role and attach to request
    req.user = {
      employee_id: decoded.employee_id,
      email: decoded.email,
      role: normalizeRole(decoded.role),
      name: decoded.name,
      department: decoded.department,
      shift_start: decoded.shift_start,
      on_probation: Boolean(decoded.on_probation)
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

/**
 * Role-Based Access Control Middleware
 * Requires the requesting user to hold the 'hr_admin' role
 */
export function requireHrAdmin(req, res, next) {
  if (!req.user || normalizeRole(req.user.role) !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden: HR Admin access required' });
  }
  next();
}

/**
 * Issues a signed JWT token for an authenticated user
 */
export function generateToken(user) {
  const payload = {
    employee_id: user.employee_id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    department: user.department,
    shift_start: user.shift_start,
    on_probation: Boolean(user.on_probation)
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}
