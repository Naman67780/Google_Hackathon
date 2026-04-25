import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { Link } from 'react-router-dom';

const TYPE_ICON = { fire: '🔥', medical: '⚕️', security: '🛡️' };
const TYPE_COLOR = { fire: 'var(--red)', medical: 'var(--blue)', security: 'var(--orange)' };
const formatStatus = s => (s || '').replace('_', ' ').toUpperCase();

export default function GuestDashboard() {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedEmergency, setSelectedEmergency] = useState(null);
  const [roomNumber, setRoomNumber] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [activeAlert, setActiveAlert] = useState(null);
  
  // Chat state
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [escalationNotice, setEscalationNotice] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [pendingOfflineAlert, setPendingOfflineAlert] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const newSocket = io('http://localhost:5001');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
      newSocket.emit('join_role', 'guest');
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('updateAlert', (data) => {
      setActiveAlert((prev) => {
        if (prev && prev.id === data.id) {
          const updatedStatusText = formatStatus(data.status);
          setConfirmation(`Update on your emergency: Status is now ${updatedStatusText}`);
          return { ...prev, status: data.status };
        }
        return prev;
      });
    });

    newSocket.on('alertEscalated', (data) => {
      setActiveAlert((prev) => {
        if (prev && prev.id === data.id) {
          setEscalationNotice(data.message);
          return { ...prev, priority: data.priority };
        }
        return prev;
      });
    });

    newSocket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    newSocket.on('chat_history', (data) => {
      if (activeAlert && data.alertId === activeAlert.id) {
        setMessages(data.messages);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    });

    return () => newSocket.disconnect();
  }, [activeAlert?.id]);

  useEffect(() => {
    if (socket && activeAlert) {
      socket.emit('join_alert_room', activeAlert.id);
      socket.emit('fetch_chat_history', activeAlert.id);
    }
  }, [socket, activeAlert?.id]);

  /* ── Voice Recognition ── */
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Your browser doesn't support speech recognition.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setTranscript('Listening...');
      setVoiceError('');
    };

    recognition.onresult = (event) => {
      const current = event.resultIndex;
      const result = event.results[current][0].transcript.toLowerCase();
      setTranscript(result);

      if (event.results[current].isFinal) {
        handleVoiceCommand(result);
      }
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setVoiceError(`Voice error: ${event.error}`);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleVoiceCommand = (cmd) => {
    if (cmd.includes('fire')) {
      handleEmergencyClick('fire');
    } else if (cmd.includes('medical') || cmd.includes('doctor') || cmd.includes('ambulance')) {
      handleEmergencyClick('medical');
    } else if (cmd.includes('security') || cmd.includes('police') || cmd.includes('help') || cmd.includes('emergency')) {
      handleEmergencyClick('security');
    }
  };

  const handleEmergencyClick = (type) => {
    setSelectedEmergency(type);
    setConfirmation('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!roomNumber.trim()) return;

    const alertId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString() + Math.random().toString();
    
    const alertData = {
      id: alertId,
      type: selectedEmergency,
      roomNumber,
      status: "pending",
      timestamp: new Date().toISOString()
    };

    if (isConnected && socket) {
      socket.emit('emergency_alert', alertData);
      setConfirmation("Help is on the way! (Status: PENDING)");
    } else {
      setPendingOfflineAlert(alertData);
      setConfirmation("Trying to reconnect... (Alert saved locally)");
    }

    setActiveAlert(alertData);
    setSelectedEmergency(null);
    setRoomNumber('');
  };

  // Offline fallback retry mechanism
  useEffect(() => {
    let intervalId;
    if (pendingOfflineAlert) {
      intervalId = setInterval(() => {
        if (isConnected && socket) {
          socket.emit('emergency_alert', pendingOfflineAlert);
          setPendingOfflineAlert(null);
          setConfirmation("Help is on the way! (Status: PENDING)");
          clearInterval(intervalId);
        }
      }, 3000); // Retry every 3 seconds
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [pendingOfflineAlert, isConnected, socket]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeAlert || !socket) return;
    
    socket.emit('send_message', {
      alertId: activeAlert.id,
      sender: 'Guest',
      role: 'guest',
      text: newMessage
    });
    
    setNewMessage('');
  };

  return (
    <div className="home-page">
      <div style={{ width: '100%', maxWidth: 600 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <Link to="/" className="btn btn-ghost" style={{ fontSize: '0.8rem' }}>← Back</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className={`conn-dot ${isConnected ? 'online' : ''}`} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{isConnected ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        {!activeAlert ? (
          <div className="animate-in">
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <h1 style={{ marginBottom: '0.5rem' }}>Emergency Services</h1>
              <p style={{ marginBottom: '1.5rem' }}>Select type or use voice command</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                <button 
                  onClick={startListening} 
                  className={`btn ${isListening ? 'btn-danger' : 'btn-primary'}`}
                  style={{ borderRadius: '50px', padding: '1rem 2rem', gap: '0.75rem', animation: isListening ? 'pulse 1.5s infinite' : 'none' }}
                >
                  <span style={{ fontSize: '1.2rem' }}>{isListening ? '🛑' : '🎙️'}</span>
                  {isListening ? 'Listening...' : 'Voice Emergency Trigger'}
                </button>
                
                {transcript && (
                  <div style={{ 
                    fontSize: '0.9rem', color: isListening ? 'var(--primary)' : 'var(--text-2)', 
                    background: 'var(--bg-card)', padding: '0.5rem 1rem', borderRadius: '20px',
                    border: '1px solid var(--border)', fontStyle: 'italic'
                  }}>
                    "{transcript}"
                  </div>
                )}
                {voiceError && <div style={{ fontSize: '0.8rem', color: 'var(--red)' }}>{voiceError}</div>}
              </div>
            </div>

            <div className="emergency-grid">
              {[
                { id: 'fire', label: 'Fire', icon: '🔥', class: 'emergency-btn-fire' },
                { id: 'medical', label: 'Medical', icon: '⚕️', class: 'emergency-btn-medical' },
                { id: 'security', label: 'Security', icon: '🛡️', class: 'emergency-btn-security' },
              ].map(item => (
                <button 
                  key={item.id}
                  className={`emergency-btn ${item.class} ${selectedEmergency === item.id ? 'active' : ''}`}
                  onClick={() => handleEmergencyClick(item.id)}
                  style={{ opacity: selectedEmergency && selectedEmergency !== item.id ? 0.5 : 1 }}
                >
                  <div className="emergency-icon">{item.icon}</div>
                  <div className="emergency-label">{item.label}</div>
                </button>
              ))}
            </div>

            {selectedEmergency && (
              <div className="card animate-in" style={{ marginTop: '2rem', padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                  {TYPE_ICON[selectedEmergency]} Confirm {selectedEmergency.toUpperCase()} Emergency
                </h3>
                <form onSubmit={handleSubmit}>
                  <div style={{ marginBottom: '1.5rem' }}>
                    <label htmlFor="room" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Where is the emergency?</label>
                    
                    {/* Quick tap rooms */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                      {['Room 101', 'Room 205', 'Lobby', 'Pool', 'Gym'].map(r => (
                        <button 
                          key={r}
                          type="button" 
                          className="btn btn-ghost" 
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '20px' }}
                          onClick={() => setRoomNumber(r)}
                        >
                          + {r}
                        </button>
                      ))}
                    </div>

                    <input 
                      type="text" 
                      id="room" 
                      className="input"
                      style={{ padding: '1rem', fontSize: '1.1rem' }}
                      value={roomNumber}
                      onChange={(e) => setRoomNumber(e.target.value)}
                      required
                      placeholder="Type room or location..."
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '1.2rem', fontSize: '1.1rem' }}>
                      Send Alert Now
                    </button>
                    <button type="button" onClick={() => setSelectedEmergency(null)} className="btn btn-ghost" style={{ width: '100%', padding: '0.8rem' }}>
                      Go Back
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        ) : (
          <div className="animate-in">
            <div className="card" style={{ padding: '2rem', overflow: 'hidden' }}>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ 
                  width: 64, height: 64, borderRadius: '50%', 
                  background: TYPE_COLOR[activeAlert.type] + '22', 
                  color: TYPE_COLOR[activeAlert.type],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2rem', margin: '0 auto 1rem',
                  border: `2px solid ${TYPE_COLOR[activeAlert.type]}`,
                  animation: 'room-pulse 2s infinite'
                }}>
                  {TYPE_ICON[activeAlert.type]}
                </div>
                <h2 style={{ marginBottom: '0.5rem' }}>{activeAlert.type.toUpperCase()} Emergency</h2>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-2)' }}>Location: <strong>{activeAlert.roomNumber}</strong></div>
              </div>

              {escalationNotice && (
                <div className="escalation-banner" style={{ marginBottom: '1.5rem' }}>
                  🚨 <strong>ESCALATED:</strong> {escalationNotice}
                </div>
              )}

              <div style={{ 
                background: 'var(--bg-surface)', 
                borderRadius: 'var(--radius-md)', 
                padding: '1rem', 
                border: '1px solid var(--border)',
                marginBottom: '2rem',
                textAlign: 'center'
              }}>
                <span className={`badge ${activeAlert.status === 'resolved' ? 'badge-resolved' : 'badge-pending'}`} style={{ marginBottom: '0.5rem' }}>
                  {formatStatus(activeAlert.status)}
                </span>
                {activeAlert.priority && (
                  <span className={`badge ${activeAlert.priority === 'high' ? 'badge-high' : activeAlert.priority === 'medium' ? 'badge-medium' : 'badge-low'}`} style={{ marginLeft: '0.5rem', marginBottom: '0.5rem' }}>
                    {activeAlert.priority.toUpperCase()} PRIORITY
                  </span>
                )}
                <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{confirmation}</div>
              </div>

              <div className="chat-panel" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', height: '400px' }}>
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)' }}>
                  DIRECT CHAT WITH STAFF
                </div>
                <div className="chat-messages">
                  {messages.length === 0 ? (
                    <div style={{ color: 'var(--text-3)', fontSize: '0.82rem', textAlign: 'center', margin: 'auto' }}>
                      Staff has been notified. You can send additional details here.
                    </div>
                  ) : (
                    messages.map((msg, idx) => {
                      const isGuest = msg.role === 'guest';
                      return (
                        <div key={idx} className={`chat-bubble ${isGuest ? 'mine' : 'theirs'}`}>
                          <div className="chat-bubble-text" style={{ background: isGuest ? TYPE_COLOR[activeAlert.type] : 'var(--bg-hover)' }}>
                            {msg.text}
                          </div>
                          <div className="chat-bubble-meta">{msg.sender} · {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>
                
                <div className="chat-input-row">
                  <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                    <input 
                      className="input"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a message..."
                      disabled={activeAlert.status === 'resolved'}
                    />
                    <button type="submit" disabled={!newMessage.trim() || activeAlert.status === 'resolved'} className="btn btn-primary">
                      Send
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
