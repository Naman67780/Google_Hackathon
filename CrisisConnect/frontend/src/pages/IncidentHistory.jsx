import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';

const TYPE_ICON = { fire: '🔥', medical: '⚕️', security: '🛡️' };
const STATUS_BADGE = { pending: 'badge-pending', accepted: 'badge-accepted', in_progress: 'badge-in_progress', resolved: 'badge-resolved' };

function formatDuration(ms) {
  if (ms == null || ms < 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) console.error("VITE_API_URL is missing!");

export default function IncidentHistory() {
  const { staff } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!staff?.token) return;
    fetch(`${API_URL}/api/alerts`, {
      headers: { Authorization: `Bearer ${staff.token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch history');
        return r.json();
      })
      .then(data => setAlerts(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [staff]);

  const filtered = useMemo(() => {
    return alerts.filter(a => {
      if (filterType !== 'all' && a.type !== filterType) return false;
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      if (filterDate) {
        const alertDate = new Date(a.timestamp).toISOString().slice(0, 10);
        if (alertDate !== filterDate) return false;
      }
      if (search && !a.roomNumber?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [alerts, filterType, filterStatus, filterDate, search]);

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <div className="page-header">
          <div>
            <h2 style={{ marginBottom: 2 }}>Incident History</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: 0 }}>Review and audit past emergency responses</p>
          </div>
        </div>

        <div className="page-body">
          {/* Filter Bar */}
          <div className="card" style={{ padding: '1.25rem', marginBottom: '2rem', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ flex: '1 1 150px' }}>
              <label>Type</label>
              <select className="input" value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="all">All Types</option>
                <option value="fire">Fire</option>
                <option value="medical">Medical</option>
                <option value="security">Security</option>
              </select>
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <label>Status</label>
              <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <label>Date</label>
              <input type="date" className="input" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <label>Search Room</label>
              <input type="text" className="input" placeholder="Room #..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {(filterType !== 'all' || filterStatus !== 'all' || filterDate || search) && (
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button 
                  className="btn btn-ghost" 
                  style={{ height: '38px' }}
                  onClick={() => { setFilterType('all'); setFilterStatus('all'); setFilterDate(''); setSearch(''); }}
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            {loading ? (
              <div className="empty-state">
                <div style={{ fontSize: '1.5rem', animation: 'spin 2s linear infinite' }}>⏳</div>
                <p>Loading historical data...</p>
              </div>
            ) : error ? (
              <div className="empty-state" style={{ color: 'var(--red)' }}>
                <p>Error: {error}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📂</div>
                <p>No matching incidents found</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Room</th>
                      <th>Status</th>
                      <th>Reported</th>
                      <th>Response</th>
                      <th>Resolution</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(alert => {
                      const reported = new Date(alert.timestamp);
                      const accepted = alert.acceptedAt ? new Date(alert.acceptedAt) : null;
                      const resolved = alert.resolvedAt ? new Date(alert.resolvedAt) : null;
                      
                      const responseMs = accepted ? accepted - reported : null;
                      const totalMs = resolved ? resolved - reported : null;

                      return (
                        <tr key={alert.id} className="transition-smooth">
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                              <span>{TYPE_ICON[alert.type]}</span>
                              <span style={{ textTransform: 'capitalize' }}>{alert.type}</span>
                            </div>
                          </td>
                          <td style={{ fontWeight: 600 }}>{alert.roomNumber}</td>
                          <td>
                            <span className={`badge ${STATUS_BADGE[alert.status]}`}>
                              {alert.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontSize: '0.85rem' }}>{reported.toLocaleDateString()}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{reported.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                          </td>
                          <td>
                            <span style={{ 
                              color: responseMs && responseMs < 60000 ? 'var(--green)' : responseMs < 300000 ? 'var(--yellow)' : 'var(--red)',
                              fontWeight: 600
                            }}>
                              {formatDuration(responseMs)}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>{formatDuration(resolved && accepted ? resolved - accepted : null)}</span>
                          </td>
                          <td style={{ color: 'var(--text-2)' }}>{formatDuration(totalMs)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
