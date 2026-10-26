require('dotenv').config();
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const taskRoutes = require('./routes/tasks');
const sessionRoutes = require('./routes/sessions');
const pushRoutes = require('./routes/push');
const statsRoutes = require('./routes/stats');
const priorityRoutes = require('./routes/priority');
const recommendationsRoutes = require('./routes/recommendations');
const recommendationEventRoutes = require('./routes/recommendationEvents');
const habitsRoutes = require('./routes/habits');
const aiRoutes = require('./routes/ai');
const integrationsRoutes = require('./routes/integrations');
const blockingRoutes = require('./routes/blocking');
const plannerRoutes = require('./routes/planner');
const subjectRoutes = require('./routes/subjects');
const timetableRoutes = require('./routes/timetable');
const rhythmRoutes = require('./routes/rhythm');
const speechRoutes = require('./routes/speech');
const accountRoutes = require('./routes/account');

const deadlineChecker = require('./jobs/deadlineChecker');
const integrationSync  = require('./jobs/integrationSync');


const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = (process.env.FRONTEND_URL || 'http://localhost:5173')
        .split(',').map(o => o.trim().replace(/\/$/, ''));
      if (allowed.includes(origin) || origin.startsWith('chrome-extension://')) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.id;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`);
  socket.on('disconnect', () => {});
});

// Make io accessible in route handlers via req.app.get('io')
app.set('io', io);

// Security headers
app.use(helmet());

// Restrict CORS to known origins
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim().replace(/\/$/, ''));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow Chrome extension origins
    if (origin.startsWith('chrome-extension://')) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '50kb' }));

// connect mongodb
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error', err));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/stats', statsRoutes);

app.use('/api/priority', priorityRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/recommendation-events', recommendationEventRoutes);
app.use('/api/habits', habitsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/blocking', blockingRoutes);
app.use('/api/planner', plannerRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/rhythm', rhythmRoutes);
app.use('/api/accessibility', speechRoutes);
app.use('/api/account', accountRoutes);

// health
app.get('/ping', (req,res)=> res.json({ ok: true }));
app.get('/health', (req,res)=> res.json({ status: 'ok' }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Errors are answered in JSON without stack traces or internal details.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error('[error]', req.method, req.path, err.message);
  const message = status === 400 && err.type === 'entity.parse.failed'
    ? 'The request body could not be read.'
    : status === 413
      ? 'That request is too large.'
      : status < 500 && err.expose
        ? err.message
        : 'Something went wrong on the server. Please try again.';
  res.status(status).json({ error: message });
});

// Cron and the HTTP listener only run on a real server (not Vercel serverless)
if (!process.env.VERCEL) {
  // Schedule cron: run deadline checker every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('[cron] running deadline checker');
      await deadlineChecker();
    } catch(err) {
      console.error('[cron] checker error', err);
    }
  });

  // Sync integrations every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      console.log('[cron] running integration sync');
      await integrationSync();
    } catch(err) {
      console.error('[cron] integration sync error', err);
    }
  });

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, ()=> console.log(`Server running on port ${PORT}`));
}

module.exports = app;
