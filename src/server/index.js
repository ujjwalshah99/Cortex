import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './db/connection.js';
import { executionRouter } from './routes/execution.js';
import { questionsRouter } from './routes/questions.js';
import { sessionsRouter } from './routes/sessions.js';
import { registerSocketHandlers } from './socket/handler.js';
import { startSnapshotLoop, stopSnapshotLoop } from './services/snapshotLoop.js';
import { startWriteBufferFlusher, stopWriteBufferFlusher, forceFlushAll } from './services/writeBufferFlusher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

app.use('/api', executionRouter);
app.use('/api', questionsRouter);
app.use('/api', sessionsRouter);

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static React build in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '..', 'client', 'build');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/socket.io/')) {
      res.sendFile(path.join(clientBuild, 'index.html'));
    }
  });
}

// Register Socket.io handlers
registerSocketHandlers(io);

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  httpServer.listen(PORT, () => {
    console.log(`Cortex server running on port ${PORT}`);
  });

  // Start background services
  startSnapshotLoop();
  startWriteBufferFlusher();
  console.log('Snapshot loop started (30s interval)');
  console.log('Write buffer flusher started (5s interval)');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  stopSnapshotLoop();
  stopWriteBufferFlusher();
  await forceFlushAll();
  process.exit(0);
});

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export { app, io, httpServer };
