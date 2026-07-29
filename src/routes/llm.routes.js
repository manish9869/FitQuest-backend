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
                max_tokens: 1500,
                temperature: 0.4,
                // Groq's real structured-output mode (OpenAI-compatible) — the
                // model is constrained to emit valid JSON at the API level,
                // instead of just being asked nicely in the prompt text. Cuts
                // down substantially on malformed/truncated responses.
                ...(response_json_schema ? { response_format: { type: 'json_object' } } : {}),
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
            } catch (parseErr) {
                // Previously silently returned {}, which meant the frontend
                // just rendered blank with no explanation. Surface it as a
                // real error instead so the UI can show "please retry".
                logger.error('LLM returned unparseable JSON', { error: parseErr.message, raw: text.slice(0, 500) });
                return res.status(502).json({ error: 'AI response could not be parsed. Please try again.' });
            }
        }
        res.json({ result: text });
    } catch (err) {
        next(err);
    }
});

export default router;
