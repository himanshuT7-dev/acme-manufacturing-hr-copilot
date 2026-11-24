import React, { useState } from 'react';

export const SEEDED_EMPLOYEES = [
  {
    id: 'E001',
    name: 'Priya Nair',
    email: 'priya@acme.test',
    role: 'EMPLOYEE',
    dept: 'Engineering',
    shift: '09:00',
    probation: false,
    label: 'Priya Nair - E001 (Engineering)'
  },
  {
    id: 'E002',
    name: 'Rahul Mehta',
    email: 'rahul@acme.test',
    role: 'EMPLOYEE',
    dept: 'Manufacturing',
    shift: '08:00',
    probation: false,
    label: 'Rahul Mehta - E002 (Manufacturing, Shift 08:00)'
  },
  {
    id: 'E003',
    name: 'Sneha Kulkarni',
    email: 'sneha@acme.test',
    role: 'EMPLOYEE',
    dept: 'Quality',
    shift: '09:00',
    probation: false,
    label: 'Sneha Kulkarni - E003 (Quality)'
  },
  {
    id: 'E004',
    name: 'Arjun Rao',
    email: 'arjun@acme.test',
    role: 'EMPLOYEE',
    dept: 'Assembly',
    shift: '08:00',
    probation: false,
    label: 'Arjun Rao - E004 (Assembly, Shift 08:00)'
  },
  {
    id: 'E005',
    name: 'Fatima Shaikh',
    email: 'fatima@acme.test',
    role: 'HR_ADMIN',
    dept: 'HR',
    shift: '09:00',
    probation: false,
    label: 'Fatima Shaikh (HR Admin) - E005'
  },
  {
    id: 'E006',
    name: 'Vikram Joshi',
    email: 'vikram@acme.test',
    role: 'EMPLOYEE',
    dept: 'Operations',
    shift: '09:00',
    probation: true,
    label: 'Vikram Joshi (Probation) - E006'
  }
];

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('priya@acme.test');
  const [password, setPassword] = useState('Test@123');
  const [selectedEmpId, setSelectedEmpId] = useState('E001');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSelectEmployee = (empId, autoSubmit = false) => {
    setSelectedEmpId(empId);
    const emp = SEEDED_EMPLOYEES.find((e) => e.id === empId);
    if (emp) {
      setEmail(emp.email);
      setPassword('Test@123');
      setErrorMessage('');
      if (autoSubmit) {
        performLogin(emp.email, 'Test@123');
      }
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
            <div className="font-mono" style={{
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.5px',
              color: 'var(--ink-primary)'
            }}>
              ACME MANUFACTURING // HRMS PORTAL
            </div>
            <div style={{
              fontSize: '11px',
              color: 'var(--ink-muted)',
              marginTop: '2px'
            }}>
              Workforce Operations & Copilot System
            </div>
          </div>
          <span className="font-mono" style={{
            fontSize: '10px',
            padding: '2px 6px',
            backgroundColor: '#E2E8F0',
            color: 'var(--ink-muted)',
            borderRadius: '2px'
          }}>
            AUTH-GATE v2.4
          </span>
        </div>

        <div style={{ padding: '24px' }}>
          {/* Quick Demo Login Section */}
          <div style={{
            marginBottom: '22px',
            padding: '14px',
            backgroundColor: 'var(--surface-subtle)',
            border: '1px solid var(--border-medium)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px'
            }}>
              <span className="font-mono" style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.5px',
                color: 'var(--accent-amber)'
              }}>
                [QUICK DEMO LOGIN - 6 SEEDED EMPLOYEES]
              </span>
              <span className="font-mono" style={{ fontSize: '10px', color: 'var(--ink-dim)' }}>
                1-CLICK TEST
              </span>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <select
                value={selectedEmpId}
                onChange={(e) => handleSelectEmployee(e.target.value)}
                style={{
                  width: '100%',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  padding: '8px 10px',
                  backgroundColor: '#FFFFFF',
                  borderColor: 'var(--border-medium)',
                  cursor: 'pointer'
                }}
              >
                {SEEDED_EMPLOYEES.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.label} {emp.probation ? '• [PROBATION]' : ''} {emp.role === 'HR_ADMIN' ? '• [HR ADMIN]' : ''}
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
                    onClick={() => handleSelectEmployee(emp.id, true)}
                    disabled={isLoading}
                    style={{
                      padding: '6px 8px',
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      textAlign: 'left',
                      justifyContent: 'flex-start',
                      backgroundColor: isSelected ? 'var(--accent-amber-subtle)' : '#FFFFFF',
                      borderColor: isSelected ? 'var(--accent-amber-border)' : 'var(--border-light)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      color: isSelected ? 'var(--accent-amber-hover)' : 'var(--ink-primary)'
                    }}
                    title={`Instant login as ${emp.name} (${emp.id})`}
                  >
                    <span style={{ fontWeight: 600 }}>{emp.id}</span>
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginLeft: '4px'
                    }}>
                      {emp.name.split(' ')[0]} {emp.role === 'HR_ADMIN' ? '★' : ''}
                    </span>
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
              {isLoading ? 'AUTHENTICATING CREDENTIALS...' : 'SIGN IN TO PORTAL →'}
            </button>
          </form>
        </div>

        {/* Security Notice Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-light)',
          backgroundColor: '#F8FAFC',
          fontSize: '10px',
          color: 'var(--ink-dim)',
          textAlign: 'center'
        }} className="font-mono">
          CONFIDENTIAL // AUTHORIZED ACME INDUSTRIAL PERSONNEL ONLY
        </div>
      </div>
    </div>
  );
}
