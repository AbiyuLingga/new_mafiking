const { GoogleGenAI } = require('@google/genai');

const GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite';

function extractGeneratedText(response) {
  if (!response) return '';
  const directText = typeof response.text === 'function' ? response.text() : response.text;
  if (String(directText || '').trim()) return String(directText);

  const parts = Array.isArray(response?.candidates?.[0]?.content?.parts)
    ? response.candidates[0].content.parts
    : [];
  return parts
    .filter((part) => part && !part.thought && part.text)
    .map((part) => part.text)
    .join('');
}

function isRetryableStatus(status) {
  return status === 429 || status === 503 || (status >= 500 && status < 600);
}

class GeminiClient {
  constructor() {
    this.model = GEMINI_FLASH_LITE_MODEL;
  }

  async call({ key, model, parts, prompt, schema, maxOutputTokens, temperature, systemInstruction }) {
    if (!key) {
      const error = new Error('Tidak ada Gemini API key. Set GEMINI_KEY_1 di .env');
      error.status = 500;
      throw error;
    }

    const ai = new GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: model || this.model,
      contents: [{ role: 'user', parts }],
      config: {
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        ...(schema ? { responseJsonSchema: schema, responseMimeType: 'application/json' } : {}),
        systemInstruction: systemInstruction || prompt,
        temperature: temperature != null ? temperature : 0.1,
      },
    });

    const text = extractGeneratedText(response);

    return {
      text,
      modelUsed: model || this.model,
      usageMetadata: response.usageMetadata || {},
    };
  }
}

module.exports = { GeminiClient, GEMINI_FLASH_LITE_MODEL };
