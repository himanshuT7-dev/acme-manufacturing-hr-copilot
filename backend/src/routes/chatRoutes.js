import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { handleChat } from '../ai/copilot.js';

const router = express.Router();

/**
 * POST /api/chat
 * Main conversational copilot endpoint integrating LLM, tools, RAG, and confirmations.
 * Protected by JWT authentication.
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { message, confirmation_payload } = req.body || {};

    if (!message && !confirmation_payload) {
      return res.status(400).json({
        error: 'Bad Request: "message" or "confirmation_payload" is required in request body.'
      });
    }

    const response = await handleChat({
      message: message || '',
      user: req.user,
      confirmation_payload: confirmation_payload || null
    });

    return res.status(200).json({
      reply: response.reply,
      tools_used: response.tools_used || [],
      citations: response.citations || [],
      pending_confirmation: response.pending_confirmation || null
    });
  } catch (err) {
    console.error('[chatRoutes] Error handling chat message:', err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message || 'Internal server error processing chat request.'
    });
  }
});

// Also support POST /chat if mounted at /api directly
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { message, confirmation_payload } = req.body || {};

    if (!message && !confirmation_payload) {
      return res.status(400).json({
        error: 'Bad Request: "message" or "confirmation_payload" is required in request body.'
      });
    }

    const response = await handleChat({
      message: message || '',
      user: req.user,
      confirmation_payload: confirmation_payload || null
    });

    return res.status(200).json({
      reply: response.reply,
      tools_used: response.tools_used || [],
      citations: response.citations || [],
      pending_confirmation: response.pending_confirmation || null
    });
  } catch (err) {
    console.error('[chatRoutes] Error handling chat message:', err);
    const status = err.statusCode || 500;
    return res.status(status).json({
      error: err.message || 'Internal server error processing chat request.'
    });
  }
});

export default router;
