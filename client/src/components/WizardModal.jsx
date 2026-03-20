import { useState } from 'react';

// ── Wizard Step Renderer ──
function WizardStepView({ step, state, setState, onVerify, verifyResult }) {
  const set = (k, v) => setState(s => ({ ...s, [k]: v }));

  switch (step.type) {

    case 'info':
      return (
        <div className="wizard-content">
          <div style={{ fontSize: 36, marginBottom: 12, textAlign: 'center' }}>{step.icon}</div>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 16, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>{step.title}</div>
          <div className="wizard-info-box" dangerouslySetInnerHTML={{ __html: step.body }} />
          {step.url && (
            <a href={step.url} target="_blank" rel="noreferrer" className="wizard-action-btn" style={{ textDecoration: 'none' }}>
              <span>🔗</span>
              <span>{step.linkLabel || 'Open in browser'}</span>
              <span className="arrow">↗</span>
            </a>
          )}
        </div>
      );

    case 'input':
      return (
        <div className="wizard-content">
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{step.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>{step.desc}</div>
          {step.fields.map(f => (
            <div key={f.key}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                {f.label}
              </label>
              <input
                className="wizard-input"
                type={f.secret ? 'password' : 'text'}
                placeholder={f.placeholder || ''}
                value={state[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
              />
            </div>
          ))}
        </div>
      );

    case 'actions':
      return (
        <div className="wizard-content">
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{step.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>{step.desc}</div>
          {step.actions.map((a, i) => (
            <button key={i} className="wizard-action-btn" onClick={() => { if (a.url) window.open(a.url, '_blank'); if (a.onTap) a.onTap(); }}>
              <span>{a.icon}</span>
              <span><strong>{a.label}</strong>{a.sub && <><br /><span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{a.sub}</span></>}</span>
              <span className="arrow">↗</span>
            </button>
          ))}
        </div>
      );

    case 'verify':
      return (
        <div className="wizard-content">
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{step.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{step.desc}</div>
          <button className="wizard-action-btn" onClick={onVerify} disabled={verifyResult === 'loading'}>
            <span>🔍</span>
            <span>{verifyResult === 'loading' ? 'Testing…' : (step.verifyLabel || 'Test Connection')}</span>
          </button>
          {verifyResult && verifyResult !== 'loading' && (
            <div className={`wizard-verify-badge ${verifyResult === 'ok' ? 'wizard-verify-badge--ok' : 'wizard-verify-badge--err'}`}>
              {verifyResult === 'ok' ? '✅ Connection verified!' : `❌ ${verifyResult}`}
            </div>
          )}
        </div>
      );

    case 'secrets':
      return (
        <div className="wizard-content">
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{step.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>{step.desc}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {step.secrets.map(s => (
              <div key={s.key} style={{
                background: 'var(--surface-3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--cyan)' }}>{s.key}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {state[s.stateKey] ? '●'.repeat(Math.min(state[s.stateKey].length, 20)) : <em style={{ opacity: 0.5 }}>not entered yet</em>}
                  </div>
                </div>
                <CopySecretButton secretKey={s.key} value={state[s.stateKey]} />
              </div>
            ))}
          </div>
          <div className="wizard-info-box" style={{ marginTop: 10 }}>
            In Replit: <strong>Tools → Secrets</strong> → paste each key above.<br />
            Your values are stored locally and never sent to any server except Replit Secrets.
          </div>
        </div>
      );

    default:
      return <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Unknown step type: {step.type}</div>;
  }
}

function CopySecretButton({ secretKey, value }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      disabled={!value}
      style={{
        background: value ? 'var(--accent-dim)' : 'transparent',
        color: value ? 'var(--accent)' : 'var(--text-dim)',
        border: 'none',
        borderRadius: 4,
        padding: '4px 8px',
        fontSize: 10,
        fontWeight: 700,
        cursor: value ? 'pointer' : 'default',
        fontFamily: 'Syne, sans-serif',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

// ── Wizard Modal ──
export default function WizardModal({ integration, onClose, onComplete }) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState({});
  const [verifyResult, setVerifyResult] = useState(null);

  const steps = integration.wizard;
  const current = steps[step];
  const isLast = step === steps.length - 1;

  const verify = async () => {
    if (!integration.verify) { setVerifyResult('ok'); return; }
    setVerifyResult('loading');
    try {
      const result = await integration.verify(state);
      setVerifyResult(result === true ? 'ok' : (result || 'Connection failed'));
    } catch (e) {
      setVerifyResult(e.message);
    }
  };

  const next = () => {
    if (isLast) {
      onComplete(state);
      onClose();
    } else {
      setStep(s => s + 1);
      setVerifyResult(null);
    }
  };

  const canNext = () => {
    if (current.type === 'input' && current.required) {
      return current.fields.every(f => !f.required || state[f.key]);
    }
    if (current.type === 'verify') {
      return verifyResult === 'ok';
    }
    return true;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{integration.icon} {integration.name}</span>
          <button className="ai-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {/* Step indicators */}
          {steps.length > 1 && (
            <div className="wizard-steps">
              {steps.map((s, i) => (
                <div
                  key={i}
                  className={`wizard-step-dot ${i < step ? 'wizard-step-dot--done' : ''} ${i === step ? 'wizard-step-dot--active' : ''}`}
                >
                  <div className="wizard-dot-circle">{i < step ? '✓' : i + 1}</div>
                  <div className="wizard-step-label">{s.label || `Step ${i + 1}`}</div>
                </div>
              ))}
            </div>
          )}

          <WizardStepView
            step={current}
            state={state}
            setState={setState}
            onVerify={verify}
            verifyResult={verifyResult}
          />
        </div>

        <div className="wizard-nav" style={{ padding: '0 16px 16px' }}>
          {step > 0 && (
            <button className="wizard-btn wizard-btn--secondary" onClick={() => { setStep(s => s - 1); setVerifyResult(null); }}>
              Back
            </button>
          )}
          <button
            className="wizard-btn wizard-btn--primary"
            onClick={next}
            disabled={!canNext()}
          >
            {isLast ? '✓ Done' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
