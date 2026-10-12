/**
 * Replicate provider (offline pipeline only; the game never calls it).
 *
 * REQUEST  POST https://api.replicate.com/v1/models/{owner}/{name}/predictions        (official models: no version id)
 *          Authorization: Bearer $REPLICATE_API_TOKEN · Content-Type: application/json · Prefer: wait=60
 *          body {"input": {…model inputs…}}
 * RESPONSE a prediction object {id, status, output, error, urls:{get,cancel}}. With `Prefer: wait` the call holds up to 60 s and usually returns
 *          status "succeeded"; otherwise the adapter polls `urls.get` (same host, same token) until a terminal status
 *          (succeeded | failed | canceled). A 429 carries `retry_after` (seconds); the adapter waits and retries.
 * OUTPUT   FLUX.2 [pro] declares a single string in URI format: an https URL of the finished file (replicate.delivery). Older FLUX models return a
 *          list of URLs; the adapter accepts a string, a list, `{url}` or a data: URI. The file is then DOWNLOADED WITHOUT the API token (the token is
 *          only ever sent to api.replicate.com) and handed to the pipeline as bytes. Delivery URLs expire, so the download happens immediately.
 * AUTH     only the environment variable REPLICATE_API_TOKEN. It is never logged, written to disk or included in an error message (`scrub`).
 *
 * The input fields below come from the model's published schema; `verify()` (the `--provider-check` command) re-reads the live schema with a free GET
 * and `generateImage` drops any input the live schema does not declare, so a schema change cannot turn into a paid failed request.
 */
import type { ImageGenerationProvider, ImageRequest, ImageResult, ProviderStatus } from './provider'

export const REPLICATE_API = 'https://api.replicate.com/v1'
export const DEFAULT_REPLICATE_MODEL = 'black-forest-labs/flux-2-pro'
/** Estimated price, USD per image at ≤1 MP: published figures range from about $0.03 to $0.055 (see docs/FIGHTER_IDENTITY.md); override with REPLICATE_COST_PER_IMAGE. */
export const REPLICATE_COST_RANGE = { low: 0.03, high: 0.055 }

type Env = Record<string, string | undefined>
export interface HttpResponse { ok: boolean; status: number; headers: { get(name: string): string | null }; json(): Promise<unknown>; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }
export type HttpFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<HttpResponse>

interface Prediction { id?: string; status?: string; output?: unknown; error?: unknown; urls?: { get?: string }; detail?: string; retry_after?: number }

/** Removes anything that looks like a Replicate token (and the configured one) from text that may be logged or recorded. */
export const scrub = (text: string, env: Env = {}): string => {
  let t = text.replace(/r8_[A-Za-z0-9]+/g, '[redacted]')
  const tok = env.REPLICATE_API_TOKEN
  if (tok) t = t.split(tok).join('[redacted]')
  return t
}

/** The first usable file in a prediction's `output`: a URL string, a list of them, `{url}`, or a data: URI. */
export function outputRef(output: unknown): { kind: 'url' | 'data'; value: string } | null {
  const first = Array.isArray(output) ? output[0] : output
  const s = typeof first === 'string' ? first : first && typeof first === 'object' && typeof (first as { url?: unknown }).url === 'string' ? (first as { url: string }).url : null
  if (!s) return null
  if (s.startsWith('data:')) return { kind: 'data', value: s }
  return /^https:\/\//i.test(s) ? { kind: 'url', value: s } : null
}

export class ReplicateProvider implements ImageGenerationProvider {
  readonly id = 'replicate'
  readonly model: string
  /** 4:5 at about 0.87 MP (multiples of 16): plenty for a 480×600 file, and priced as one megapixel or less. */
  readonly portraitSize = { w: 832, h: 1040 }
  private schemaProps: Set<string> | null | undefined
  constructor(
    private env: Env,
    private http: HttpFetch = (globalThis as unknown as { fetch: HttpFetch }).fetch,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private pollMs = 2000,
    private timeoutMs = 300_000,
  ) { this.model = (env.REPLICATE_MODEL ?? DEFAULT_REPLICATE_MODEL).trim() }

  private auth(): Record<string, string> { return { authorization: `Bearer ${this.env.REPLICATE_API_TOKEN}` } }
  private err(msg: string): string { return scrub(msg, this.env).slice(0, 300) }

  async checkStatus(): Promise<ProviderStatus> {
    const missing = this.env.REPLICATE_API_TOKEN ? [] : ['REPLICATE_API_TOKEN']
    const modelOk = /^[\w.-]+\/[\w.-]+$/.test(this.model)
    const cost = this.env.REPLICATE_COST_PER_IMAGE ? Number(this.env.REPLICATE_COST_PER_IMAGE) : REPLICATE_COST_RANGE.high
    const ready = missing.length === 0 && modelOk
    return { configured: ready, ready, provider: this.id, model: this.model, detail: missing.length ? `Missing ${missing.join(', ')}` : modelOk ? `Model ${this.model} (token set; not yet verified: run --provider-check)` : `REPLICATE_MODEL must look like owner/name, got "${this.model}"`, costPerImage: Number.isFinite(cost) ? cost : null }
  }

  /** Free, read-only checks: the token is accepted, the model exists, and the live input/output schema still has the fields the pipeline sends. */
  async verify(): Promise<{ ok: boolean; lines: string[] }> {
    const lines: string[] = []
    const st = await this.checkStatus()
    if (!st.ready) return { ok: false, lines: [st.detail] }
    try {
      const acct = await this.http(`${REPLICATE_API}/account`, { headers: this.auth() })
      lines.push(acct.ok ? 'token accepted by api.replicate.com (GET /v1/account)' : `token REJECTED (HTTP ${acct.status})`)
      if (!acct.ok) return { ok: false, lines }
      const m = await this.http(`${REPLICATE_API}/models/${this.model}`, { headers: this.auth() })
      if (!m.ok) return { ok: false, lines: [...lines, `model ${this.model} not found or not accessible (HTTP ${m.status})`] }
      const j = (await m.json()) as { latest_version?: { openapi_schema?: { components?: { schemas?: Record<string, { properties?: Record<string, { type?: string; enum?: unknown[]; format?: string }> }> } } } }
      const schemas = j.latest_version?.openapi_schema?.components?.schemas
      const input = schemas?.Input?.properties
      const out = schemas?.Output as { type?: string; format?: string; items?: { format?: string } } | undefined
      if (!input) return { ok: false, lines: [...lines, 'the model page returned no input schema; nothing was sent'] }
      const want = ['prompt', 'aspect_ratio', 'width', 'height', 'seed', 'output_format', 'safety_tolerance']
      const missing = want.filter((k) => !(k in input))
      lines.push(`model ${this.model}: input fields ${Object.keys(input).join(', ')}`)
      lines.push(`output schema: ${JSON.stringify(out ?? null)}`)
      if (missing.length) lines.push(`WARNING: declared inputs missing: ${missing.join(', ')} (they will be left out of requests)`)
      return { ok: true, lines }
    } catch (e) { return { ok: false, lines: [...lines, `request failed: ${this.err(e instanceof Error ? e.message : String(e))}`] } }
  }

  private async liveInputs(): Promise<Set<string> | null> {
    if (this.schemaProps !== undefined) return this.schemaProps
    try {
      const r = await this.http(`${REPLICATE_API}/models/${this.model}`, { headers: this.auth() })
      const j = r.ok ? ((await r.json()) as { latest_version?: { openapi_schema?: { components?: { schemas?: { Input?: { properties?: Record<string, unknown> } } } } } }) : null
      const p = j?.latest_version?.openapi_schema?.components?.schemas?.Input?.properties
      this.schemaProps = p ? new Set(Object.keys(p)) : null
    } catch { this.schemaProps = null }
    return this.schemaProps
  }

  async buildInput(req: ImageRequest): Promise<Record<string, unknown>> {
    const w = Math.max(256, Math.min(2048, Math.round(req.width / 16) * 16)), h = Math.max(256, Math.min(2048, Math.round(req.height / 16) * 16))
    const all: Record<string, unknown> = { prompt: req.prompt, aspect_ratio: 'custom', width: w, height: h, seed: req.seed, output_format: req.format === 'webp' ? 'webp' : 'png', safety_tolerance: 2 }
    const live = await this.liveInputs()
    return live ? Object.fromEntries(Object.entries(all).filter(([k]) => live.has(k))) : all
  }

  async generateImage(req: ImageRequest): Promise<ImageResult> {
    const st = await this.checkStatus()
    if (!st.ready) return { ok: false, error: st.detail }
    try {
      const input = await this.buildInput(req)
      let pred: Prediction | null = null
      for (let attempt = 1; attempt <= 4; attempt++) {
        const res = await this.http(`${REPLICATE_API}/models/${this.model}/predictions`, { method: 'POST', headers: { ...this.auth(), 'content-type': 'application/json', prefer: 'wait=60' }, body: JSON.stringify({ input }) })
        if (res.status === 429 && attempt < 4) {
          const body = (await res.json().catch(() => ({}))) as Prediction
          const wait = Number(body.retry_after ?? res.headers.get('retry-after') ?? 5)
          await this.sleep(Math.min(Math.max(Number.isFinite(wait) ? wait : 5, 1), 30) * 1000)
          continue
        }
        if (!res.ok) return { ok: false, error: this.err(`HTTP ${res.status}: ${await res.text()}`) }
        pred = (await res.json()) as Prediction
        break
      }
      if (!pred) return { ok: false, error: 'rate limited' }
      const started = Date.now()
      while (pred.status === 'starting' || pred.status === 'processing') {
        const url = pred.urls?.get
        if (!url || !url.startsWith(`${REPLICATE_API}/`)) return { ok: false, error: 'prediction is still running but has no poll URL on api.replicate.com' }
        if (Date.now() - started > this.timeoutMs) return { ok: false, error: `timed out after ${Math.round(this.timeoutMs / 1000)} s` }
        await this.sleep(this.pollMs)
        const r = await this.http(url, { headers: this.auth() })
        if (!r.ok) return { ok: false, error: this.err(`poll HTTP ${r.status}`) }
        pred = (await r.json()) as Prediction
      }
      if (pred.status !== 'succeeded') return { ok: false, error: this.err(`prediction ${pred.status ?? 'unknown'}: ${typeof pred.error === 'string' ? pred.error : JSON.stringify(pred.error ?? pred.detail ?? '')}`) }
      const ref = outputRef(pred.output)
      if (!ref) return { ok: false, error: 'prediction succeeded but its output has no https URL' }
      if (ref.kind === 'data') {
        const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(ref.value)
        if (!m) return { ok: false, error: 'unreadable data URI' }
        return { ok: true, data: Uint8Array.from(Buffer.from(decodeURIComponent(m[3]), m[2] ? 'base64' : 'utf8')), format: m[1] ?? 'image' }
      }
      // The file is fetched with NO Authorization header: the token never leaves api.replicate.com.
      const file = await this.http(ref.value)
      if (!file.ok) return { ok: false, error: this.err(`download HTTP ${file.status}`) }
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (bytes.length < 1000) return { ok: false, error: `downloaded file is only ${bytes.length} bytes` }
      return { ok: true, data: bytes, format: file.headers.get('content-type') ?? 'image' }
    } catch (e) { return { ok: false, error: this.err(e instanceof Error ? e.message : String(e)) } }
  }

  async generateBatch(reqs: ImageRequest[]): Promise<ImageResult[]> { const out: ImageResult[] = []; for (const r of reqs) out.push(await this.generateImage(r)); return out }
}
