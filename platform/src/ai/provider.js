import { config } from '../config.js';
import { AppError, TransientError } from '../core/errors.js';
import { log } from '../core/logger.js';
import { offlineComplete } from './offline.js';

/**
 * AI provider abstraction.
 *
 * Two implementations:
 *  - `anthropic`: the real thing, used when ANTHROPIC_API_KEY is set.
 *  - `offline`:   deterministic heuristics (src/ai/offline.js). The whole
 *                 product — scoring, drafting, briefs — works without an API
 *                 key so the platform can be demoed, tested and run in CI.
 *
 * Model output is untrusted input: every agent validates it against a schema
 * before anything downstream sees it (src/ai/agents/base.js).
 */

/** @typedef {{system:string, prompt:string, task:string, input:any, maxTokens?:number, heavy?:boolean}} CompletionRequest */
/** @typedef {{json:any, text:string, model:string, tokensIn:number, tokensOut:number}} CompletionResult */

/** @param {CompletionRequest} req @returns {Promise<CompletionResult>} */
export async function complete(req) {
  if (config.ai.provider !== 'anthropic' || !config.ai.apiKey) {
    return offlineComplete(req);
  }
  return anthropicComplete(req);
}

/** @param {CompletionRequest} req @returns {Promise<CompletionResult>} */
async function anthropicComplete(req) {
  const model = req.heavy ? config.ai.heavyModel : config.ai.model;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.ai.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens ?? config.ai.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
      }),
    });

    if (res.status === 429 || res.status >= 500) {
      throw new TransientError(`AI provider returned ${res.status}`, Number(res.headers.get('retry-after') ?? 20));
    }
    if (!res.ok) {
      const detail = await res.text();
      throw new AppError(res.status, 'ai_error', `AI provider rejected the request: ${detail.slice(0, 400)}`);
    }

    const body = await res.json();
    const text = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return {
      json: extractJson(text),
      text,
      model,
      tokensIn: body.usage?.input_tokens ?? 0,
      tokensOut: body.usage?.output_tokens ?? 0,
    };
  } catch (err) {
    if (err?.name === 'AbortError') throw new TransientError('AI provider timed out', 20);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pull a JSON object out of a model response, tolerating fenced code blocks
 * and surrounding prose. Returns null when there is nothing parseable — the
 * agent then fails its schema check rather than passing junk downstream.
 */
export function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    try { return JSON.parse(trimmed); } catch { /* try harder */ }
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* fall through */ }
    }
  }
  log.warn('ai_json_parse_failed', { preview: String(text).slice(0, 200) });
  return null;
}

export function providerName() {
  return config.ai.provider === 'anthropic' && config.ai.apiKey ? 'anthropic' : 'offline';
}
