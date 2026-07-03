import { Router } from 'express';

// Server-side Mistral proxy. The web app builds the retrieval + prompts locally
// (nothing sensitive), but the actual model call runs here so the MISTRAL_API_KEY
// never ships in the browser bundle. Mirrors the shape reasoning.ts expects.

export const reasoningRouter = Router();

const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
const MODEL = 'mistral-small-latest';

reasoningRouter.post('/chat', async (req, res) => {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) {
    return res.status(503).json({ error: 'Kein Mistral API Key auf dem Server konfiguriert (MISTRAL_API_KEY).' });
  }

  const { messages, json, temperature } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages[] required' });
  }

  try {
    const upstream = await fetch(MISTRAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: typeof temperature === 'number' ? temperature : 0.3,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 200);
      return res.status(502).json({ error: `Mistral ${upstream.status}: ${detail}` });
    }

    const data = await upstream.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    return res.json({ content });
  } catch (error: any) {
    return res.status(502).json({ error: error?.message ?? 'Reasoning proxy failed' });
  }
});
