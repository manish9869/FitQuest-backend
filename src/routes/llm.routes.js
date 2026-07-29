import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { llmLimiter } from '../middleware/security.js';
import { config } from '../config/env.js';
import logger from '../config/logger.js';

const router = Router();

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function schemaSuffix(response_json_schema) {
    return response_json_schema
        ? `\n\nRespond ONLY with valid JSON matching this schema: ${JSON.stringify(response_json_schema)}. No markdown, no explanation.`
        : '';
}

function parseJsonResult(text) {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ── Groq (text-only) ─────────────────────────────────────────────────────────
async function invokeGroqText(res, { prompt, response_json_schema }) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.groqApiKey}`,
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt + schemaSuffix(response_json_schema) }],
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
            return res.json({ result: parseJsonResult(text) });
        } catch (parseErr) {
            logger.error('Groq returned unparseable JSON', { error: parseErr.message, raw: text.slice(0, 500) });
            return res.status(502).json({ error: 'AI response could not be parsed. Please try again.' });
        }
    }
    res.json({ result: text });
}

// ── Gemini (vision) ──────────────────────────────────────────────────────────
// Only reached when the request includes file_urls (e.g. the Food Scanner).
// Groq's models on this account are text-only, so image-bearing requests are
// routed here instead — the backend fetches the image itself (the URL is a
// Supabase Storage URL, never trusted as-is) and sends the raw bytes to
// Gemini, rather than assuming Gemini can fetch an arbitrary external URL.
async function invokeGeminiVision(res, { prompt, file_urls, response_json_schema }) {
    if (!config.geminiApiKey) {
        return res.status(503).json({ error: 'Image analysis is not configured on this server.' });
    }

    const imageUrl = file_urls[0];
    let imageResp;
    try {
        imageResp = await fetch(imageUrl);
    } catch {
        return res.status(400).json({ error: 'Could not fetch the provided image.' });
    }
    if (!imageResp.ok) {
        return res.status(400).json({ error: 'Could not fetch the provided image.' });
    }

    const contentType = imageResp.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
        return res.status(400).json({ error: 'Provided file is not an image.' });
    }

    const buf = Buffer.from(await imageResp.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) {
        return res.status(400).json({ error: 'Image is too large to analyze.' });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt + schemaSuffix(response_json_schema) },
                    { inline_data: { mime_type: contentType, data: buf.toString('base64') } },
                ],
            }],
            generationConfig: {
                temperature: 0.4,
                ...(response_json_schema ? { responseMimeType: 'application/json' } : {}),
            },
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        logger.error('Gemini request failed', { status: response.status, body: errText.slice(0, 500) });
        return res.status(502).json({ error: 'LLM provider request failed.' });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (response_json_schema) {
        try {
            return res.json({ result: parseJsonResult(text) });
        } catch (parseErr) {
            logger.error('Gemini returned unparseable JSON', { error: parseErr.message, raw: text.slice(0, 500) });
            return res.status(502).json({ error: 'AI response could not be parsed. Please try again.' });
        }
    }
    res.json({ result: text });
}

// ── POST /api/llm/invoke ────────────────────────────────────────────────────
// Same {prompt, file_urls, response_json_schema} -> text/JSON contract the
// frontend already used. Requests with file_urls go to Gemini (vision);
// everything else goes to Groq (text) — GROQ_API_KEY/GEMINI_API_KEY never
// leave this server either way.
router.post('/invoke', requireAuth, llmLimiter, async (req, res, next) => {
    try {
        const { prompt, file_urls, response_json_schema } = req.body || {};
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: 'prompt is required.' });
        }

        if (Array.isArray(file_urls) && file_urls.length > 0) {
            await invokeGeminiVision(res, { prompt, file_urls, response_json_schema });
        } else {
            await invokeGroqText(res, { prompt, response_json_schema });
        }
    } catch (err) {
        next(err);
    }
});

export default router;
