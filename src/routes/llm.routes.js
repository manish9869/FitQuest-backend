import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { llmLimiter } from '../middleware/security.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';

const router = Router();

// ── POST /api/llm/invoke ────────────────────────────────────────────────────
// Same {prompt, response_json_schema} -> text/JSON contract the frontend
// already used when it called Groq directly — only difference now is
// GROQ_API_KEY never leaves this server.
router.post('/invoke', requireAuth, llmLimiter, async (req, res, next) => {
    try {
        const { prompt, response_json_schema } = req.body || {};
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: 'prompt is required.' });
        }

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.groqApiKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{
                    role: 'user',
                    content: response_json_schema
                        ? `${prompt}\n\nRespond ONLY with valid JSON matching this schema: ${JSON.stringify(response_json_schema)}. No markdown, no explanation.`
                        : prompt,
                }],
                max_tokens: 1000,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            logger.error('Groq request failed', { status: response.status, body: errText });
            return res.status(502).json({ error: 'LLM provider request failed.' });
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';

        if (response_json_schema) {
            try {
                return res.json({ result: JSON.parse(text.replace(/```json|```/g, '').trim()) });
            } catch {
                return res.json({ result: {} });
            }
        }
        res.json({ result: text });
    } catch (err) {
        next(err);
    }
});

export default router;
