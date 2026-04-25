import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="home-page animate-in">
      {/* Brand */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ width: 44, height: 44, background: 'var(--red)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>🚨</div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em' }}>CrisisConnect</h1>
        </div>
        <p style={{ color: 'var(--text-2)', fontSize: '0.95rem', maxWidth: 360, margin: '0 auto' }}>
          Real-time emergency response and coordination platform
        </p>
      </div>

      {/* Role cards */}
      <div className="role-cards">
        <Link to="/guest" className="role-card">
          <div className="role-icon" style={{ background: 'var(--green-dim)' }}>🆘</div>
          <div>
            <h3 style={{ marginBottom: '0.3rem' }}>I need help</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>Report an emergency — fire, medical, or security</p>
          </div>
          <span className="btn btn-ghost" style={{ width: '100%', marginTop: '0.5rem', justifyContent: 'center' }}>
            Enter as Guest →
          </span>
        </Link>

        <Link to="/staff/login" className="role-card">
          <div className="role-icon" style={{ background: 'var(--primary-dim)' }}>🛡️</div>
          <div>
            <h3 style={{ marginBottom: '0.3rem' }}>I am Staff</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>Manage and respond to active incidents</p>
          </div>
          <span className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem', justifyContent: 'center' }}>
            Staff Login →
          </span>
        </Link>
      </div>

      <p style={{ color: 'var(--text-3)', fontSize: '0.75rem', marginTop: '3rem' }}>
        CrisisConnect · Emergency Response Platform
      </p>
    </div>
  );
}
