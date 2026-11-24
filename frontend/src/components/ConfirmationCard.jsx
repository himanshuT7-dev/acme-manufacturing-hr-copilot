import React, { useState } from 'react';

/**
 * Interactive Leave Confirmation Card
 * Meets Swiss-industrial visual rules:
 * - Crisp borders (1px solid #CBD5E1), zero drop shadows
 * - Left accent border (3px solid #B45309)
 * - Monospace metadata for dates, codes, and IDs
 * - Solid accent "Confirm & Submit Leave" and bordered secondary "Cancel"
 * - Card state transitions: 'pending' -> 'submitting' -> 'submitted' | 'cancelled'
 */
export default function ConfirmationCard({
  pendingConfirmation,
  onConfirm,
  onCancel,
  persistedState = null,
  persistedDetails = null
}) {
  const [status, setStatus] = useState(persistedState || 'pending'); // 'pending' | 'submitting' | 'submitted' | 'cancelled'
  const [errorMsg, setErrorMsg] = useState('');
  const [submitDetails, setSubmitDetails] = useState(persistedDetails || null);

  if (!pendingConfirmation) return null;

  const { action, payload, summary } = pendingConfirmation;
  const leaveType = payload?.leave_type || 'Annual';
  const fromDate = payload?.from_date || 'YYYY-MM-DD';
  const toDate = payload?.to_date || 'YYYY-MM-DD';
  const reason = payload?.reason || 'Personal reasons';

  // Calculate approximate business days if not provided
  let daysCount = payload?.days_count;
  if (!daysCount && fromDate && toDate) {
    try {
      const d1 = new Date(fromDate);
      const d2 = new Date(toDate);
      const diffTime = Math.abs(d2 - d1);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      daysCount = diffDays;
    } catch {
      daysCount = 'Calculated at submit';
    }
  }

  const handleConfirmClick = async () => {
    setStatus('submitting');
    setErrorMsg('');

    try {
      const result = await onConfirm(pendingConfirmation);
      setStatus('submitted');
      setSubmitDetails(result);
    } catch (err) {
      console.error('Confirmation error:', err);
      setErrorMsg(err.message || 'Failed to submit leave request');
      setStatus('pending');
    }
  };

  const handleCancelClick = () => {
    setStatus('cancelled');
    if (onCancel) {
      onCancel(pendingConfirmation);
    }
  };

  return (
    <div
      style={{
        marginTop: '12px',
        backgroundColor: '#FFFFFF',
        border: '1px solid var(--border-medium)',
        borderLeft: '4px solid var(--accent-amber)',
        borderRadius: '6px',
        overflow: 'hidden'
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          padding: '8px 14px',
          backgroundColor: '#F8FAFC',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--ink-primary)'
            }}
          >
            Action Required: Confirm Leave Request
          </span>
        </div>

        {/* Status Badge */}
        {status === 'pending' && (
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              backgroundColor: '#FEF3C7',
              border: '1px solid #FCD34D',
              color: '#92400E',
              fontWeight: 500,
              borderRadius: '4px'
            }}
          >
            Pending Confirmation
          </span>
        )}

        {status === 'submitting' && (
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              backgroundColor: '#E2E8F0',
              border: '1px solid #CBD5E1',
              color: '#334155',
              fontWeight: 500,
              borderRadius: '4px'
            }}
          >
            Submitting request...
          </span>
        )}

        {status === 'submitted' && (
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              backgroundColor: '#ECFDF5',
              border: '1px solid #A7F3D0',
              color: '#065F46',
              fontWeight: 500,
              borderRadius: '4px'
            }}
          >
            Submitted (Pending Approval)
          </span>
        )}

        {status === 'cancelled' && (
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              backgroundColor: '#F1F5F9',
              border: '1px solid #CBD5E1',
              color: '#64748B',
              fontWeight: 500,
              borderRadius: '4px'
            }}
          >
            Cancelled
          </span>
        )}
      </div>

      {/* Structured Details Grid */}
      <div style={{ padding: '12px 14px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
            marginBottom: '10px',
            backgroundColor: 'var(--surface-subtle)',
            border: '1px solid var(--border-light)',
            padding: '10px 12px',
            borderRadius: '6px'
          }}
        >
          <div>
            <div
              style={{ fontSize: '11px', color: 'var(--ink-dim)', marginBottom: '2px', fontWeight: 500 }}
            >
              Leave Type
            </div>
            <div className="font-mono" style={{ fontSize: '12px', fontWeight: 600 }}>
              {leaveType}
            </div>
          </div>

          <div>
            <div
              style={{ fontSize: '11px', color: 'var(--ink-dim)', marginBottom: '2px', fontWeight: 500 }}
            >
              From Date
            </div>
            <div className="font-mono" style={{ fontSize: '12px', fontWeight: 600 }}>
              {fromDate}
            </div>
          </div>

          <div>
            <div
              style={{ fontSize: '11px', color: 'var(--ink-dim)', marginBottom: '2px', fontWeight: 500 }}
            >
              To Date
            </div>
            <div className="font-mono" style={{ fontSize: '12px', fontWeight: 600 }}>
              {toDate}
            </div>
          </div>

          <div>
            <div
              style={{ fontSize: '11px', color: 'var(--ink-dim)', marginBottom: '2px', fontWeight: 500 }}
            >
              Total Days
            </div>
            <div
              className="font-mono"
              style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-amber)' }}
            >
              {daysCount} {typeof daysCount === 'number' ? (daysCount === 1 ? 'day' : 'days') : ''}
            </div>
          </div>
        </div>

        {/* Reason Line */}
        <div
          style={{
            fontSize: '12px',
            color: 'var(--ink-muted)',
            marginBottom: '12px',
            display: 'flex',
            gap: '6px'
          }}
        >
          <span style={{ color: 'var(--ink-dim)', fontSize: '12px', fontWeight: 500 }}>
            Reason:
          </span>
          <span>{reason}</span>
        </div>

        {/* Action Summary Prompt */}
        {summary && status === 'pending' && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--ink-primary)',
              fontWeight: 500,
              marginBottom: '12px',
              fontStyle: 'italic'
            }}
          >
            "{summary}"
          </div>
        )}

        {/* Error message banner */}
        {errorMsg && (
          <div
            style={{
              padding: '6px 10px',
              marginBottom: '10px',
              backgroundColor: 'var(--status-error-bg)',
              border: '1px solid var(--status-error-border)',
              color: 'var(--status-error-ink)',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)'
            }}
          >
            [SUBMIT ERROR]: {errorMsg}
          </div>
        )}

        {/* Action Buttons for Pending State */}
        {status === 'pending' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirmClick}
              disabled={status === 'submitting'}
              style={{
                fontSize: '12px',
                padding: '7px 16px',
                fontWeight: 600,
                letterSpacing: '0.3px'
              }}
            >
              Confirm & Submit Leave
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleCancelClick}
              disabled={status === 'submitting'}
              style={{ fontSize: '12px', padding: '7px 14px' }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Success Feedback Confirmation */}
        {status === 'submitted' && (
          <div
            className="font-mono"
            style={{
              fontSize: '11px',
              color: 'var(--status-success-ink)',
              backgroundColor: 'var(--status-success-bg)',
              border: '1px solid var(--status-success-border)',
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>✔</span>
            <span>
              Leave request committed to HR database. Status set to PENDING SUPERVISOR REVIEW.
            </span>
          </div>
        )}

        {/* Cancelled Feedback */}
        {status === 'cancelled' && (
          <div
            className="font-mono"
            style={{
              fontSize: '11px',
              color: 'var(--ink-dim)',
              backgroundColor: '#F8FAFC',
              border: '1px solid var(--border-light)',
              padding: '6px 10px'
            }}
          >
            Leave application discarded. No balance was deducted.
          </div>
        )}
      </div>
    </div>
  );
}
