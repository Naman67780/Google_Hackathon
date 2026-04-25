import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { label: 'Live Alerts',      path: '/staff',         icon: '📡' },
  { label: 'Incident History', path: '/staff/history', icon: '📋' },
];

export default function Sidebar({ alertCount = 0 }) {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const initials = staff?.name
    ? staff.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'ST';

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">🚨</div>
        <div>
          <div className="sidebar-logo-text">CrisisConnect</div>
          <div className="sidebar-logo-sub">Command Center</div>
        </div>
      </div>

      {/* Nav */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Navigation</div>
        {NAV.map(({ label, path, icon }) => (
          <Link
            key={path}
            to={path}
            className={`sidebar-item ${pathname === path ? 'active' : ''}`}
          >
            <span>{icon}</span>
            <span>{label}</span>
            {label === 'Live Alerts' && alertCount > 0 && (
              <span className="sidebar-badge">{alertCount}</span>
            )}
          </Link>
        ))}
      </div>

      {/* Footer user */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div className="sidebar-user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{staff?.name}</div>
            <div className="sidebar-user-role">Staff</div>
          </div>
          <button
            title="Logout"
            className="btn-icon ml-auto"
            onClick={() => { logout(); navigate('/'); }}
          >
            ↩
          </button>
        </div>
      </div>
    </aside>
  );
}
