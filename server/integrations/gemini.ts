import { config } from '../config';

export async function askGemini(system: string, user: string) {
  if (config.ai.provider !== 'gemini' || !config.ai.apiKey) throw new Error('AI provider is not configured. Set GEMINI_API_KEY.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.ai.model)}:generateContent?key=${encodeURIComponent(config.ai.apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 4000 } }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Gemini API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('')?.trim();
  if (!text) throw new Error('Gemini returned no text');
  return text;
}
