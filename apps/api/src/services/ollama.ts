/**
 * Shared Ollama service for all AI features.
 *
 * Wraps axios calls to the Ollama API with:
 * - Circuit breaker (fast-fail when Ollama is down)
 * - Configurable model/temperature/maxTokens
 * - Retry on transient errors (2 attempts with backoff)
 * - Simple response caching (TTL LRU)
 *
 * Usage:
 *   import { ollama } from '../services/ollama';
 *   const reply = await ollama.chat(messages, { temperature: 0.3 });
 *   const text  = await ollama.generate(prompt, { maxTokens: 512 });
 */
import axios from 'axios';
import logger from '../utils/logger';
import { CircuitBreaker } from '../utils/circuit-breaker';

const BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'thewindmom/llama3-med42-8b:latest';

const breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 60_000, name: 'ollama' });

// Simple LRU cache (max 200 entries, 5-min TTL)
const cache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_MAX = 200;
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheGet(key: string): any | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return undefined; }
  return entry.data;
}

function cacheSet(key: string, data: any): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export interface OllamaOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  systemPrompt?: string;
  /** Skip cache for this call */
  noCache?: boolean;
  /** Force JSON output grammar (Ollama format parameter) */
  format?: 'json';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callWithRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const isTransient = axios.isAxiosError(err) && (
        err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNRESET' || (err.response?.status ?? 0) >= 500
      );
      if (!isTransient || attempt === retries) throw err;
      logger.warn(`[ollama] Transient error (attempt ${attempt + 1}/${retries + 1}), retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs));
      delayMs *= 2;
    }
  }
  throw new Error('unreachable');
}

/**
 * Send a chat-style request to Ollama (multi-turn conversation).
 * Returns the assistant's reply text.
 */
async function chat(messages: ChatMessage[], opts: OllamaOptions = {}): Promise<string> {
  const model = opts.model ?? DEFAULT_MODEL;
  const timeout = opts.timeoutMs ?? 120_000;

  // Prepend system prompt if provided
  const fullMessages = opts.systemPrompt
    ? [{ role: 'system' as const, content: opts.systemPrompt }, ...messages]
    : messages;

  // Cache key = model + last user message (simple heuristic)
  const lastUser = messages.filter(m => m.role === 'user').pop()?.content ?? '';
  const cacheKey = `chat:${model}:${lastUser.slice(0, 200)}`;
  if (!opts.noCache) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }

  const ollamaOpts = {
    ...(opts.temperature != null && { temperature: opts.temperature }),
    ...(opts.maxTokens  != null && { num_predict: opts.maxTokens }),
  };

  const data = await breaker.call(() => callWithRetry(() =>
    axios.post(`${BASE_URL}/api/chat`, {
      model,
      messages: fullMessages,
      stream: false,
      ...(Object.keys(ollamaOpts).length > 0 && { options: ollamaOpts }),
    }, { timeout }),
  ));

  const reply: string = data.data?.message?.content ?? '';
  if (!opts.noCache && reply) cacheSet(cacheKey, reply);
  return reply;
}

/**
 * Send a single-turn generate request to Ollama.
 * Returns the generated text.
 */
async function generate(prompt: string, opts: OllamaOptions = {}): Promise<string> {
  const model = opts.model ?? DEFAULT_MODEL;
  const timeout = opts.timeoutMs ?? 60_000;

  const cacheKey = `gen:${model}:${prompt.slice(0, 200)}`;
  if (!opts.noCache) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }

  const generateOpts = {
    ...(opts.temperature != null && { temperature: opts.temperature }),
    ...(opts.maxTokens  != null && { num_predict: opts.maxTokens }),
  };

  const data = await breaker.call(() => callWithRetry(() =>
    axios.post(`${BASE_URL}/api/generate`, {
      model,
      prompt: opts.systemPrompt ? `${opts.systemPrompt}\n\n${prompt}` : prompt,
      stream: false,
      ...(opts.format && { format: opts.format }),
      ...(Object.keys(generateOpts).length > 0 && { options: generateOpts }),
    }, { timeout }),
  ));

  const text: string = data.data?.response ?? '';
  if (!opts.noCache && text) cacheSet(cacheKey, text);
  return text;
}

/** Check if Ollama is reachable. */
async function isHealthy(): Promise<boolean> {
  if (breaker.isOpen) return false;
  try {
    await axios.get(`${BASE_URL}/api/tags`, { timeout: 5_000 });
    return true;
  } catch { return false; }
}

export const ollama = { chat, generate, isHealthy };
