import app, { startServer } from './server.js';

const PORT = process.env.PORT || 4000;

startServer(PORT).catch((err) => {
  console.error('Fatal startup error in index.js:', err);
  process.exit(1);
});

export { app, startServer };
