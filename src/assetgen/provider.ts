/**
 * Image-generation provider abstraction. The GAME NEVER CALLS THIS: it exists for the offline pipeline only.
 * Providers are configured with environment variables; nothing is hard-coded and no key is ever written to disk.
 */
import type { GenAsset } from './types'

export interface ImageRequest { assetId: string; prompt: string; width: number; height: number; seed: number; format: 'webp' | 'png' }
export interface ImageResult { ok: boolean; data?: Uint8Array; format?: string; error?: string }
export interface ProviderStatus { configured: boolean; ready: boolean; provider: string; model: string; detail: string; costPerImage: number | null }

export interface ImageGenerationProvider {
  readonly id: string
  readonly model: string
  checkStatus(): Promise<ProviderStatus>
  generateImage(req: ImageRequest): Promise<ImageResult>
  /** Sequential by default; a provider with real batch support may override. Never throws: failures are reported per image. */
  generateBatch(reqs: ImageRequest[]): Promise<ImageResult[]>
}

export const toRequest = (a: GenAsset, format: 'webp' | 'png' = 'webp'): ImageRequest => ({ assetId: a.assetId, prompt: a.prompt, width: a.width, height: a.height, seed: a.seed, format })

/** Used when no provider is configured. Reports clearly and refuses to generate. The game works fully without any provider. */
export class NullProvider implements ImageGenerationProvider {
  readonly id = 'none'
  readonly model = '-'
  async checkStatus(): Promise<ProviderStatus> {
    return { configured: false, ready: false, provider: 'none', model: '-', detail: 'No image provider configured. Set IMAGE_GEN_PROVIDER=openai-compatible with IMAGE_GEN_API_KEY, IMAGE_GEN_BASE_URL and IMAGE_GEN_MODEL (see docs/ASSETS.md).', costPerImage: null }
  }
  async generateImage(): Promise<ImageResult> { return { ok: false, error: 'No image provider configured' } }
  async generateBatch(reqs: ImageRequest[]): Promise<ImageResult[]> { return reqs.map(() => ({ ok: false, error: 'No image provider configured' })) }
}

type Env = Record<string, string | undefined>
type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>

/**
 * Any service exposing an OpenAI-style `POST {base}/images/generations` that can return `b64_json`.
 * Env: IMAGE_GEN_API_KEY, IMAGE_GEN_BASE_URL, IMAGE_GEN_MODEL, optional IMAGE_GEN_COST_PER_IMAGE (number, for the cost estimate).
 */
export class OpenAICompatibleProvider implements ImageGenerationProvider {
  readonly id = 'openai-compatible'
  readonly model: string
  constructor(private env: Env, private fetchFn: Fetch = (globalThis as unknown as { fetch: Fetch }).fetch) { this.model = env.IMAGE_GEN_MODEL ?? '' }
  private get base() { return (this.env.IMAGE_GEN_BASE_URL ?? '').replace(/\/+$/, '') }
  async checkStatus(): Promise<ProviderStatus> {
    const missing = ['IMAGE_GEN_API_KEY', 'IMAGE_GEN_BASE_URL', 'IMAGE_GEN_MODEL'].filter((k) => !this.env[k])
    const cost = this.env.IMAGE_GEN_COST_PER_IMAGE ? Number(this.env.IMAGE_GEN_COST_PER_IMAGE) : null
    return { configured: missing.length === 0, ready: missing.length === 0, provider: this.id, model: this.model || '-', detail: missing.length ? `Missing ${missing.join(', ')}` : `Endpoint ${this.base}`, costPerImage: cost !== null && Number.isFinite(cost) ? cost : null }
  }
  async generateImage(req: ImageRequest): Promise<ImageResult> {
    const st = await this.checkStatus()
    if (!st.ready) return { ok: false, error: st.detail }
    try {
      const res = await this.fetchFn(`${this.base}/images/generations`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.env.IMAGE_GEN_API_KEY}` },
        body: JSON.stringify({ model: this.model, prompt: req.prompt, size: `${req.width}x${req.height}`, seed: req.seed, n: 1, response_format: 'b64_json', output_format: req.format }),
      })
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` }
      const j = (await res.json()) as { data?: { b64_json?: string }[] }
      const b64 = j.data?.[0]?.b64_json
      if (!b64) return { ok: false, error: 'Provider returned no image data' }
      return { ok: true, data: Uint8Array.from(Buffer.from(b64, 'base64')), format: req.format }
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
  }
  async generateBatch(reqs: ImageRequest[]): Promise<ImageResult[]> { const out: ImageResult[] = []; for (const r of reqs) out.push(await this.generateImage(r)); return out }
}

export function providerFromEnv(env: Env): ImageGenerationProvider {
  const id = (env.IMAGE_GEN_PROVIDER ?? '').toLowerCase()
  if (id === 'openai-compatible') return new OpenAICompatibleProvider(env)
  return new NullProvider()
}
