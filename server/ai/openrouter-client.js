const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_DEFAULT_MODEL = 'google/gemma-4-31b-it:free';
const OPENROUTER_TIMEOUT_MS = 60000;

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504 || (status >= 500 && status < 600);
}

class OpenRouterClient {
  constructor() {
    this.baseUrl = OPENROUTER_BASE_URL;
    this.model = OPENROUTER_DEFAULT_MODEL;
  }

  async call({ key, model, parts, prompt, schema, maxOutputTokens, temperature, systemInstruction }) {
    if (!key) {
      const error = new Error('OPENROUTER_API_KEY belum diset di .env');
      error.status = 500;
      throw error;
    }

    const messages = this.buildMessages(parts, systemInstruction || prompt);
    if (schema) {
      const schemaHint = 'Balas hanya JSON valid. Schema field yang diharapkan: ' + JSON.stringify(schema);
      if (messages.length > 0 && messages[0].role === 'system') {
        messages[0].content = messages[0].content + '\n\n' + schemaHint;
      } else {
        messages.unshift({ role: 'system', content: schemaHint });
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.PUBLIC_APP_URL || 'https://mafiking.com',
          'X-OpenRouter-Title': 'Mafiking',
        },
        body: JSON.stringify({
          model: model || this.model,
          messages,
          response_format: { type: 'json_object' },
          max_tokens: maxOutputTokens || 2600,
          temperature: temperature != null ? temperature : 0.1,
        }),
        signal: controller.signal,
      });
    } catch (caught) {
      clearTimeout(timeoutId);
      if (caught.name === 'AbortError') {
        const error = new Error('OpenRouter request timeout (60s)');
        error.status = 504;
        error.retryable = true;
        throw error;
      }
      const error = new Error(`OpenRouter network error: ${caught.message}`);
      error.status = 503;
      error.retryable = true;
      throw error;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const error = new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`);
      error.status = response.status;
      error.retryable = isRetryableStatus(response.status);
      throw error;
    }

    const data = await response.json().catch(() => ({}));
    const text = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};

    return {
      text,
      modelUsed: data.model || model || this.model,
      usageMetadata: {
        totalTokenCount: usage.total_tokens || 0,
        promptTokenCount: usage.prompt_tokens || 0,
        candidatesTokenCount: usage.completion_tokens || 0,
      },
    };
  }

  buildMessages(parts, systemPrompt) {
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    const userContent = (parts || []).map((part) => {
      if (!part) return null;
      if (part.text) return { type: 'text', text: part.text };
      if (part.inlineData) {
        return {
          type: 'image_url',
          image_url: { url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` },
        };
      }
      return null;
    }).filter(Boolean);
    messages.push({ role: 'user', content: userContent });
    return messages;
  }
}

module.exports = { OpenRouterClient, OPENROUTER_BASE_URL, OPENROUTER_DEFAULT_MODEL };
