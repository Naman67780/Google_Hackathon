const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || 'crisisconnect_jwt_secret_dev';

const corsOptions = {
  origin: process.env.FRONTEND_URL || ['http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET', 'POST'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(server, { cors: corsOptions });

// ─── MongoDB ────────────────────────────────────────────────────────────────
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/crisisconnect';
let dbConnected = false;

mongoose.connect(mongoURI)
  .then(() => { console.log('MongoDB connected'); dbConnected = true; })
  .catch(err => console.log('MongoDB unavailable – using in-memory fallback:', err.message));

// ─── Schemas / Models ────────────────────────────────────────────────────────
const staffSchema = new mongoose.Schema({
  email: { type: String, unique: true, lowercase: true },
  password: String,
  name: String,
});
const StaffUser = mongoose.model('StaffUser', staffSchema);

const alertSchema = new mongoose.Schema({
  id: String, type: String, roomNumber: String, status: String,
  timestamp: Date, acceptedAt: Date, resolvedAt: Date,
  priority: { type: String, default: 'normal' }, // 'normal' | 'high'
});
const Alert = mongoose.model('Alert', alertSchema);

const messageSchema = new mongoose.Schema({
  alertId: String, sender: String, role: String, text: String, timestamp: Date,
});
const Message = mongoose.model('Message', messageSchema);

// ─── In-memory state ────────────────────────────────────────────────────────
let activeAlerts  = [];
let alertMessages = {};

// ─── Auth middleware ─────────────────────────────────────────────────────────
function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.staff = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── REST routes ─────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'CrisisConnect backend running!' });
});

// Register staff (one-time seed or admin use)
app.post('/api/staff/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name)
    return res.status(400).json({ error: 'email, password and name are required' });

  try {
    const hash = await bcrypt.hash(password, 12);
    if (dbConnected) {
      const staff = await StaffUser.create({ email, password: hash, name });
      return res.status(201).json({ id: staff._id, email: staff.email, name: staff.name });
    }
    // In-memory fallback
    const id = crypto.randomUUID();
    inMemoryStaff.push({ id, email: email.toLowerCase(), password: hash, name });
    return res.status(201).json({ id, email, name });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Staff login
app.post('/api/staff/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  try {
    let staff = null;
    if (dbConnected) {
      staff = await StaffUser.findOne({ email: email.toLowerCase() });
    } else {
      staff = inMemoryStaff.find(s => s.email === email.toLowerCase());
    }

    if (!staff || !(await bcrypt.compare(password, staff.password)))
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: staff._id || staff.id, email: staff.email, name: staff.name },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, name: staff.name, email: staff.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify token (used by front-end on refresh)
app.get('/api/staff/me', verifyToken, (req, res) => {
  res.json({ email: req.staff.email, name: req.staff.name });
});

// Fetch all alerts for incident history (protected)
app.get('/api/alerts', verifyToken, (req, res) => {
  // Return a copy sorted newest-first
  const sorted = [...activeAlerts].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(sorted);
});

// ─── In-memory staff list (fallback) ─────────────────────────────────────────
const inMemoryStaff = [];

// Seed a default staff account for easy testing
(async () => {
  const hash = await bcrypt.hash('staff123', 12);
  inMemoryStaff.push({
    id: crypto.randomUUID(),
    email: 'staff@crisisconnect.com',
    password: hash,
    name: 'Admin Staff',
  });
  console.log('Default staff account: staff@crisisconnect.com / staff123');
})();

// ─── Socket.io ───────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('join_role', (role) => {
    socket.join(role);
    if (role === 'staff') socket.emit('initial_alerts', activeAlerts);
  });

  socket.on('emergency_alert', async (data) => {
    // Assign default priority based on type
    let defaultPriority = 'low';
    if (data.type === 'fire') defaultPriority = 'high';
    else if (data.type === 'medical') defaultPriority = 'medium';

    const alertData = {
      id: data.id || crypto.randomUUID(),
      ...data,
      status: 'pending',
      priority: defaultPriority,
    };
    activeAlerts.unshift(alertData);
    alertMessages[alertData.id] = [];
    if (dbConnected) {
      try { await new Alert(alertData).save(); } catch (e) { console.error(e); }
    }
    io.to('staff').emit('newAlert', alertData);

    // ── Auto-escalation: if not accepted within 30 seconds, escalate ──
    setTimeout(() => {
      const idx = activeAlerts.findIndex(a => a.id === alertData.id);
      if (idx !== -1 && activeAlerts[idx].status === 'pending') {
        activeAlerts[idx].priority = 'high';
        console.log(
          `🚨 ESCALATION: Alert ${alertData.id} (${alertData.type.toUpperCase()} – Room ${alertData.roomNumber}) ` +
          `was not accepted within 30 seconds. Priority set to HIGH.`
        );
        console.log('🚒 Emergency services notified (simulated)');

        if (dbConnected) {
          Alert.updateOne({ id: alertData.id }, { priority: 'high' }).catch(console.error);
        }

        // Broadcast escalation to all staff and the originating guest
        io.emit('alertEscalated', {
          id: alertData.id,
          priority: 'high',
          message: `Alert for Room ${alertData.roomNumber} has been escalated. Emergency services notified.`,
        });
      }
    }, 30_000); // 30 seconds
  });

  socket.on('updateAlert', async ({ id, status }) => {
    const idx = activeAlerts.findIndex(a => a.id === id);
    if (idx !== -1) {
      activeAlerts[idx].status = status;
      // Track response timestamps
      if (status === 'accepted' && !activeAlerts[idx].acceptedAt) {
        activeAlerts[idx].acceptedAt = new Date();
      }
      if (status === 'resolved' && !activeAlerts[idx].resolvedAt) {
        activeAlerts[idx].resolvedAt = new Date();
      }
      if (dbConnected) {
        try { await Alert.updateOne({ id }, {
          status,
          ...(status === 'accepted' ? { acceptedAt: activeAlerts[idx].acceptedAt } : {}),
          ...(status === 'resolved' ? { resolvedAt: activeAlerts[idx].resolvedAt } : {}),
        }); } catch (e) { console.error(e); }
      }
      io.emit('updateAlert', {
        id, status,
        acceptedAt: activeAlerts[idx].acceptedAt,
        resolvedAt: activeAlerts[idx].resolvedAt,
      });
    }
  });

  socket.on('join_alert_room', (alertId) => {
    socket.join(`chat_${alertId}`);
  });

  socket.on('fetch_chat_history', async (alertId) => {
    let messages = alertMessages[alertId] || [];
    if (dbConnected && messages.length === 0) {
      try {
        messages = await Message.find({ alertId }).sort({ timestamp: 1 });
        alertMessages[alertId] = messages;
      } catch (e) { console.error(e); }
    }
    socket.emit('chat_history', { alertId, messages });
  });

  socket.on('send_message', async (data) => {
    const msg = { ...data, timestamp: new Date() };
    if (!alertMessages[data.alertId]) alertMessages[data.alertId] = [];
    alertMessages[data.alertId].push(msg);
    if (dbConnected) {
      try { await new Message(msg).save(); } catch (e) { console.error(e); }
    }
    io.to(`chat_${data.alertId}`).emit('receive_message', msg);
  });

  socket.on('disconnect', () => console.log(`Client disconnected: ${socket.id}`));
});

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
