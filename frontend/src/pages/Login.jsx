import React, { useState } from 'react';

export const SEEDED_EMPLOYEES = [
  {
    id: 'E001',
    name: 'Priya Nair',
    email: 'priya@acme.test',
    role: 'EMPLOYEE',
    dept: 'Production',
    shift: '09:00',
    probation: false,
    label: 'Priya Nair - E001 (Production, Shift 09:00)'
  },
  {
    id: 'E002',
    name: 'Rahul Mehta',
    email: 'rahul@acme.test',
    role: 'EMPLOYEE',
    dept: 'Production',
    shift: '09:00',
    probation: false,
    label: 'Rahul Mehta - E002 (Production, Shift 09:00 - 3 Late)'
  },
  {
    id: 'E003',
    name: 'Sneha Kulkarni',
    email: 'sneha@acme.test',
    role: 'EMPLOYEE',
    dept: 'Accounts',
    shift: '10:00',
    probation: false,
    label: 'Sneha Kulkarni - E003 (Accounts, Shift 10:00 - WFH)'
  },
  {
    id: 'E004',
    name: 'Arjun Rao',
    email: 'arjun@acme.test',
    role: 'EMPLOYEE',
    dept: 'Sales',
    shift: '09:00',
    probation: false,
    label: 'Arjun Rao - E004 (Sales, Shift 09:00 - Overtime)'
  },
  {
    id: 'E005',
    name: 'Fatima Shaikh',
    email: 'fatima@acme.test',
    role: 'HR_ADMIN',
    dept: 'HR',
    shift: '09:30',
    probation: false,
    label: 'Fatima Shaikh (HR Admin) - E005 (HR, Shift 09:30)'
  },
  {
    id: 'E006',
    name: 'Vikram Joshi',
    email: 'vikram@acme.test',
    role: 'EMPLOYEE',
    dept: 'Sales',
    shift: '09:00',
    probation: true,
    label: 'Vikram Joshi (Probation) - E006 (Sales, Shift 09:00)'
  }
];

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('priya@acme.test');
  const [password, setPassword] = useState('Test@123');
  const [selectedEmpId, setSelectedEmpId] = useState('E001');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSelectEmployee = (empId) => {
    setSelectedEmpId(empId);
    const emp = SEEDED_EMPLOYEES.find((e) => e.id === empId);
    if (emp) {
      setEmail(emp.email);
      setPassword('Test@123');
      setErrorMessage('');
    }
  };

  const performLogin = async (loginEmail, loginPassword) => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify credentials.');
      }

      onLoginSuccess(data.user, data.token);
    } catch (err) {
      console.error('Login error:', err);
      setErrorMessage(err.message || 'Network error connecting to auth service.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please provide both work email and password.');
      return;
    }
    performLogin(email, password);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      backgroundColor: 'var(--bg-canvas)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '480px',
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border-light)',
        boxShadow: 'none'
      }}>
        {/* Terminal / System Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-light)',
          backgroundColor: '#F8FAFC',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--ink-primary)',
              letterSpacing: '-0.2px'
            }}>
              Acme HR
            </div>
            <div style={{
              fontSize: '12px',
              color: 'var(--ink-muted)',
              marginTop: '2px'
            }}>
              Employee Self-Service
            </div>
          </div>
          <span style={{
            fontSize: '11px',
            padding: '3px 8px',
            backgroundColor: '#F1F5F9',
            color: 'var(--ink-muted)',
            borderRadius: '4px',
            fontWeight: 500
          }}>
            Sign In
          </span>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Quick Demo Login Section */}
          <div style={{
            marginBottom: '22px',
            padding: '14px',
            backgroundColor: 'var(--surface-subtle)',
            borderRadius: '8px',
            border: '1px solid var(--border-medium)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px'
            }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--ink-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.4px'
              }}>
                Demo Accounts
              </span>
              <span style={{ fontSize: '11px', color: 'var(--ink-dim)' }}>
                Select to fill credentials
              </span>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <select
                value={selectedEmpId}
                onChange={(e) => handleSelectEmployee(e.target.value)}
                style={{
                  width: '100%',
                  fontSize: '12px',
                  padding: '8px 10px',
                  backgroundColor: '#FFFFFF',
                  borderColor: 'var(--border-medium)',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                {SEEDED_EMPLOYEES.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.id} • {emp.name} ({emp.dept}) {emp.probation ? '• [Probation]' : ''} {emp.role === 'HR_ADMIN' ? '• [HR Admin]' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick 1-click pills grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '6px'
            }}>
              {SEEDED_EMPLOYEES.map((emp) => {
                const isSelected = selectedEmpId === emp.id;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => handleSelectEmployee(emp.id)}
                    disabled={isLoading}
                    style={{
                      padding: '7px 10px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      borderRadius: '6px',
                      textAlign: 'left',
                      backgroundColor: isSelected ? 'var(--accent-amber-subtle)' : '#FFFFFF',
                      borderColor: isSelected ? 'var(--accent-amber-border)' : 'var(--border-light)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      color: isSelected ? 'var(--accent-amber-hover)' : 'var(--ink-primary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title={`Select credentials for ${emp.name} (${emp.id})`}
                  >
                    <span className="font-mono" style={{
                      fontWeight: 600,
                      fontSize: '11px',
                      color: isSelected ? 'var(--accent-amber-hover)' : 'var(--ink-dim)'
                    }}>
                      {emp.id}
                    </span>
                    <span style={{
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {emp.name.split(' ')[0]}
                    </span>
                    {emp.role === 'HR_ADMIN' && (
                      <span style={{ fontSize: '11px', color: '#B45309', marginLeft: 'auto' }}>
                        ★
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Standard Credentials Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '6px',
                color: 'var(--ink-primary)'
              }}>
                Work Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="employee@acme.test"
                style={{ width: '100%' }}
                required
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px'
              }}>
                <label style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--ink-primary)'
                }}>
                  Password
                </label>
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--ink-dim)' }}>
                  Default: Test@123
                </span>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: '100%' }}
                required
              />
            </div>

            {errorMessage && (
              <div style={{
                padding: '10px 12px',
                marginBottom: '16px',
                backgroundColor: 'var(--status-error-bg)',
                border: '1px solid var(--status-error-border)',
                color: 'var(--status-error-ink)',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)'
              }}>
                [ERROR]: {errorMessage}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '9px 16px',
                fontSize: '13px',
                letterSpacing: '0.3px',
                fontWeight: 600
              }}
            >
              {isLoading ? 'Signing in...' : 'Sign In →'}
            </button>
          </form>
        </div>

        {/* Security Notice Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-light)',
          backgroundColor: '#F8FAFC',
          fontSize: '11px',
          color: 'var(--ink-dim)',
          textAlign: 'center'
        }}>
          Acme Manufacturing • Employee Self-Service Portal
        </div>
      </div>
    </div>
  );
}
