import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { staff, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex-center min-h-screen" style={{ background: 'var(--bg-base)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem', animation: 'room-pulse 2s infinite' }}>📡</div>
          <p style={{ color: 'var(--text-2)', fontSize: '0.9rem' }}>Verifying credentials…</p>
        </div>
      </div>
    );
  }

  if (!staff) {
    // Redirect to login, preserve intended destination
    return <Navigate to="/staff/login" state={{ from: location }} replace />;
  }

  return children;
}
