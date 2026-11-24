import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import hrRoutes from './routes/hrRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import { initializePolicyStore } from './rag/policyStore.js';

// Load environment variables from root or backend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // also check current cwd

const app = express();
const PORT = process.env.PORT || 4000;

// Standard middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount Routes according to CONTRACTS.md
// 1. Auth routes mounted at /api/auth (e.g. POST /api/auth/login)
app.use('/api/auth', hrRoutes);

// 2. HR core routes mounted at /api (e.g. /api/me/leave-balance, /api/me/attendance, /api/me/leave-requests, /api/employees/:id/attendance-summary)
app.use('/api', hrRoutes);

// 3. AI Copilot Chat route mounted at /api/chat (e.g. POST /api/chat)
app.use('/api/chat', chatRoutes);

// 404 handler for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Not Found: Cannot ${req.method} ${req.originalUrl}` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[server] Uncaught exception:', err);
  const status = err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

/**
 * Start the Express server and initialize vector store
 */
export async function startServer(port = PORT) {
  try {
    // Initialize in-memory policy store on server startup
    await initializePolicyStore();

    return new Promise((resolve) => {
      const server = app.listen(port, () => {
        console.log(`[server] Acme HR Copilot backend listening on port ${port} (http://localhost:${port})`);
        resolve(server);
      });
    });
  } catch (err) {
    console.error('[server] Failed to start server:', err);
    throw err;
  }
}

// Auto-start server when run directly
const isMain = process.argv[1] && process.argv[1].endsWith('server.js');

if (isMain) {
  startServer(PORT).catch((err) => {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  });
}

export default app;
