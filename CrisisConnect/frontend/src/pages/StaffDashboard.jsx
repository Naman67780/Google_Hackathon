import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Sidebar from '../components/Sidebar';

/* ── helpers ─────────────────────────────────────────────────── */
const TYPE_COLOR = { fire: 'var(--red)', medical: 'var(--blue)', security: 'var(--orange)' };
const TYPE_ICON  = { fire: '🔥', medical: '⚕️', security: '🛡️' };
const TYPE_CLASS = { fire: 'alert-type-fire', medical: 'alert-type-medical', security: 'alert-type-security' };

const STATUS_BADGE = { pending: 'badge-pending', accepted: 'badge-accepted', in_progress: 'badge-in_progress', resolved: 'badge-resolved' };
const PRIORITY_BADGE = { high: 'badge-high', medium: 'badge-medium', low: 'badge-low' };
const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
const formatStatus = s => (s || '').replace('_', ' ').toUpperCase();

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) console.error("VITE_API_URL is missing!");

/* ── Building map constants ────────────────────────────────────── */
const FLOORS = [4, 3, 2, 1];
const ROOMS_PER_FLOOR = 6;
const STANDARD_ROOMS = new Set(FLOORS.flatMap(f => Array.from({ length: ROOMS_PER_FLOOR }, (_, i) => `${f}0${i + 1}`)));

export default function StaffDashboard() {
  const [socket, setSocket]       = useState(null);
  const [isConnected, setConn]    = useState(false);
  const [alerts, setAlerts]       = useState([]);
  const [openChatId, setOpenChat] = useState(null);
  const [chatMessages, setChats]  = useState({});
  const [newMessage, setNewMsg]   = useState('');
  const [escalations, setEsc]     = useState({});
  const [selectedRoom, setRoom]   = useState(null);
  const [recentlyAddedIds, setRecentlyAddedIds] = useState(new Set());
  const chatEndRef = useRef(null);

  /* ── Socket setup ─────────────────────────────────────────────── */
  useEffect(() => {
    const s = io(API_URL);
    setSocket(s);
    s.on('connect',        () => { setConn(true); s.emit('join_role', 'staff'); });
    s.on('disconnect',     () => setConn(false));
    s.on('initial_alerts', data => setAlerts(data));
    s.on('newAlert',       data => {
      setAlerts(p => [data, ...p]);
      setRecentlyAddedIds(prev => {
        const next = new Set(prev);
        next.add(data.id);
        return next;
      });
      // Remove the pulse class after animation finishes
      setTimeout(() => {
        setRecentlyAddedIds(prev => {
          const next = new Set(prev);
          next.delete(data.id);
          return next;
        });
      }, 3000);
    });
    s.on('updateAlert',    ({ id, status, acceptedAt, resolvedAt }) =>
      setAlerts(p => p.map(a => a.id === id ? { ...a, status, acceptedAt, resolvedAt } : a)));
    s.on('alertEscalated', ({ id, priority, message }) => {
      setAlerts(p => p.map(a => a.id === id ? { ...a, priority } : a));
      setEsc(p => ({ ...p, [id]: message }));
    });
    s.on('receive_message', msg =>
      setChats(p => ({ ...p, [msg.alertId]: [...(p[msg.alertId] || []), msg] })));
    s.on('chat_history',   ({ alertId, messages }) => {
      setChats(p => ({ ...p, [alertId]: messages }));
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });
    return () => s.disconnect();
  }, []);

  /* ── Actions ──────────────────────────────────────────────────── */
  const updateStatus = (id, status) => {
    socket?.emit('updateAlert', { id, status });
    setAlerts(p => p.map(a => a.id === id ? { ...a, status } : a));
  };

  const toggleChat = alertId => {
    if (openChatId === alertId) { setOpenChat(null); return; }
    setOpenChat(alertId);
    socket?.emit('join_alert_room', alertId);
    if (!chatMessages[alertId]) socket?.emit('fetch_chat_history', alertId);
    else setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const sendMessage = (e, alertId) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket) return;
    socket.emit('send_message', { alertId, sender: 'Staff', role: 'staff', text: newMessage });
    setNewMsg('');
  };

  /* ── Building map helpers ─────────────────────────────────────── */
  const activeMap = {};
  alerts.forEach(a => { if (a.status !== 'resolved' && !activeMap[a.roomNumber]) activeMap[a.roomNumber] = a; });
  const customRooms = Object.keys(activeMap).filter(r => !STANDARD_ROOMS.has(r));

  const renderRoom = roomNum => {
    const alert = activeMap[roomNum];
    const cls   = ['room-cell', alert ? `active-${alert.type}` : '', selectedRoom === roomNum ? 'selected' : ''].join(' ');
    return (
      <div key={roomNum} className={cls} onClick={() => setRoom(selectedRoom === roomNum ? null : roomNum)}>
        {roomNum}
        {alert && <span className="room-cell-badge">{TYPE_ICON[alert.type]}</span>}
      </div>
    );
  };

  /* ── Stats ────────────────────────────────────────────────────── */
  const pending    = alerts.filter(a => a.status === 'pending').length;
  const active     = alerts.filter(a => ['accepted','in_progress'].includes(a.status)).length;
  const resolved   = alerts.filter(a => a.status === 'resolved').length;

  const displayed  = (selectedRoom ? alerts.filter(a => a.roomNumber === selectedRoom) : alerts)
    .sort((a, b) => {
      // 1. Sort by Priority Weight (Descending)
      const weightA = PRIORITY_WEIGHT[a.priority] || 0;
      const weightB = PRIORITY_WEIGHT[b.priority] || 0;
      if (weightA !== weightB) return weightB - weightA;

      // 2. Sort by Time (Descending - Newest first)
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
  /* ── AI Suggestions Logic ── */
  const getSuggestions = (type) => {
    switch(type) {
      case 'fire': return ['Trigger fire alarm', 'Prepare fire extinguisher', 'Evacuate floor', 'Call Fire Department'];
      case 'medical': return ['Send nearest staff with First Aid', 'Call ambulance', 'Clear pathway for medics', 'Locate AED'];
      case 'security': return ['Send nearest security guard', 'Review CCTV footage', 'Lock down area', 'Call Police'];
      default: return [];
    }
  };
  const aiAlertTarget = selectedRoom ? activeMap[selectedRoom] : alerts.find(a => a.status !== 'resolved');

  return (
    <div className="app-layout">
      <Sidebar alertCount={pending} />

      <div className="main-content">
        {/* Page header */}
        <div className="page-header">
          <div>
            <h2 style={{ marginBottom: 2 }}>Live Alerts</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: 0 }}>Real-time incident monitoring</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className={`conn-dot ${isConnected ? 'online' : ''}`} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{isConnected ? 'Monitoring live' : 'Reconnecting…'}</span>
          </div>
        </div>

        <div className="page-body">
          {/* Stats */}
          <div className="stats-row">
            {[
              { label: 'Pending',    value: pending,  icon: '⏳', color: 'var(--yellow-dim)', iconBg: 'var(--yellow-dim)' },
              { label: 'Active',     value: active,   icon: '⚡',  color: 'var(--blue-dim)',   iconBg: 'var(--blue-dim)'   },
              { label: 'Resolved',   value: resolved, icon: '✅',  color: 'var(--green-dim)',  iconBg: 'var(--green-dim)'  },
              { label: 'Total',      value: alerts.length, icon: '📊', color: 'var(--primary-dim)', iconBg: 'var(--primary-dim)' },
            ].map(s => (
              <div key={s.label} className="stat-card">
                <div className="stat-icon" style={{ background: s.iconBg }}>{s.icon}</div>
                <div>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value">{s.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Two-column: Map + Alerts */}
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* Building Map */}
            <div className="building-map" style={{ flex: '0 0 300px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '0.85rem' }}>Building Map</h3>
                {selectedRoom && (
                  <button className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }} onClick={() => setRoom(null)}>Clear</button>
                )}
              </div>
              {FLOORS.map(floor => (
                <div key={floor} style={{ marginBottom: '0.75rem' }}>
                  <div className="floor-label">Floor {floor}</div>
                  <div className="room-grid">{Array.from({ length: ROOMS_PER_FLOOR }, (_, i) => `${floor}0${i+1}`).map(renderRoom)}</div>
                </div>
              ))}
              {customRooms.length > 0 && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <div className="floor-label" style={{ color: 'var(--orange)' }}>External Rooms</div>
                  <div className="room-grid">{customRooms.map(renderRoom)}</div>
                </div>
              )}
              <div className="map-legend">
                <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--red)'    }} />Fire</div>
                <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--blue)'   }} />Medical</div>
                <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--orange)' }} />Security</div>
              </div>

              {/* AI Assistant Panel */}
              {aiAlertTarget && (
                <div className="card animate-in" style={{ marginTop: '1.5rem', padding: '1.25rem', border: `1px solid ${TYPE_COLOR[aiAlertTarget.type]}40` }}>
                  <h3 style={{ fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: TYPE_COLOR[aiAlertTarget.type] }}>
                    <span style={{ fontSize: '1.2rem' }}>🤖</span> AI Assistant
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.75rem' }}>
                    Suggested actions for <strong style={{color: 'var(--text-1)'}}>Room {aiAlertTarget.roomNumber}</strong> ({aiAlertTarget.type}):
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-1)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {getSuggestions(aiAlertTarget.type).map((sugg, i) => (
                      <li key={i}>{sugg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Alert feed */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {selectedRoom && (
                <div style={{ marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text-2)' }}>
                  Showing alerts for <strong style={{ color: 'var(--text-1)' }}>Room {selectedRoom}</strong>
                </div>
              )}

              {displayed.length === 0 ? (
                <div className="card empty-state">
                  <div className="empty-state-icon">✅</div>
                  <h3>All clear</h3>
                  <p>No active incidents to display</p>
                </div>
              ) : (
                <div className="alert-list">
                  {displayed.map(alert => {
                    const isChatOpen = openChatId === alert.id;
                    const msgs = chatMessages[alert.id] || [];
                    return (
                      <div 
                        key={alert.id} 
                        className={`alert-card animate-in ${alert.priority === 'high' ? 'priority-high' : ''} ${recentlyAddedIds.has(alert.id) ? 'new-alert' : ''}`}
                      >
                        {/* Escalation banner */}
                        {escalations[alert.id] && (
                          <div className="escalation-banner">🚨 <strong>ESCALATED:</strong>&nbsp;{escalations[alert.id]}</div>
                        )}

                        {/* Alert header row */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div className={`alert-type-icon ${TYPE_CLASS[alert.type]}`}>{TYPE_ICON[alert.type]}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.95rem', textTransform: 'capitalize', color: TYPE_COLOR[alert.type] }}>
                                {alert.type} Emergency
                              </span>
                              <span className={`badge ${STATUS_BADGE[alert.status] || ''}`}>{formatStatus(alert.status)}</span>
                              <span className={`badge ${PRIORITY_BADGE[alert.priority] || 'badge-low'}`}>
                                {alert.priority === 'high' ? '⚡ ' : ''}{alert.priority} Priority
                              </span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
                              Room <strong style={{ color: 'var(--text-1)' }}>{alert.roomNumber}</strong>
                              <span style={{ margin: '0 0.5rem', color: 'var(--border)' }}>·</span>
                              {new Date(alert.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        {alert.status !== 'resolved' && (
                          <div className="alert-actions">
                            {alert.status === 'pending' && (
                              <button className="action-btn action-accept" onClick={() => updateStatus(alert.id, 'accepted')}>Accept</button>
                            )}
                            {(alert.status === 'pending' || alert.status === 'accepted') && (
                              <button className="action-btn action-progress" onClick={() => updateStatus(alert.id, 'in_progress')}>In Progress</button>
                            )}
                            <button className="action-btn action-resolve" onClick={() => updateStatus(alert.id, 'resolved')}>Resolve</button>
                            <button className={`action-btn action-chat`} onClick={() => toggleChat(alert.id)}>
                              💬 {isChatOpen ? 'Close' : `Chat${msgs.length ? ` (${msgs.length})` : ''}`}
                            </button>
                          </div>
                        )}

                        {/* Chat panel */}
                        {isChatOpen && (
                          <div className="chat-panel animate-in">
                            <div className="chat-messages">
                              {msgs.length === 0
                                ? <div style={{ color: 'var(--text-3)', fontSize: '0.82rem', textAlign: 'center', margin: 'auto' }}>No messages yet</div>
                                : msgs.map((m, i) => {
                                    const mine = m.role === 'staff';
                                    return (
                                      <div key={i} className={`chat-bubble ${mine ? 'mine' : 'theirs'}`}>
                                        <div className="chat-bubble-text">{m.text}</div>
                                        <div className="chat-bubble-meta">{m.sender} · {new Date(m.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>
                                      </div>
                                    );
                                  })
                              }
                              <div ref={chatEndRef} />
                            </div>
                            <div className="chat-input-row">
                              <form onSubmit={e => sendMessage(e, alert.id)} style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                                <input className="input" value={newMessage} onChange={e => setNewMsg(e.target.value)} placeholder="Reply to guest…" disabled={alert.status === 'resolved'} />
                                <button type="submit" className="btn btn-primary" disabled={!newMessage.trim() || alert.status === 'resolved'}>Send</button>
                              </form>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
