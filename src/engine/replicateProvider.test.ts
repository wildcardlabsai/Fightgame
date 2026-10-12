/** Replicate adapter against a scripted HTTP double: request shape, auth, polling, 429, output forms, token hygiene. No network, no real token. */
import { describe, expect, it } from 'vitest'
import { ReplicateProvider, outputRef, scrub, DEFAULT_REPLICATE_MODEL, type HttpFetch, type HttpResponse } from '../assetgen/replicate'
import { providerFromEnv } from '../assetgen/provider'

const TOKEN = 'r8_FAKE0000000000000000000000000000TEST'
const API = 'https://api.replicate.com/v1'
const res = (status: number, body: unknown, headers: Record<string, string> = {}, bytes?: Uint8Array): HttpResponse => ({
  ok: status >= 200 && status < 300, status, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
  json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), arrayBuffer: async () => (bytes ?? new Uint8Array(2000)).buffer as ArrayBuffer,
})
interface Call { url: string; method: string; headers: Record<string, string>; body?: string }
const rig = (script: (c: Call, n: number) => HttpResponse) => {
  const calls: Call[] = []
  const http: HttpFetch = async (url, init) => { const c = { url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body }; calls.push(c); return script(c, calls.length) }
  const p = new ReplicateProvider({ REPLICATE_API_TOKEN: TOKEN }, http, async () => {}, 0, 5000)
  return { p, calls }
}
const SCHEMA = { latest_version: { openapi_schema: { components: { schemas: { Input: { properties: { prompt: {}, aspect_ratio: {}, width: {}, height: {}, seed: {}, output_format: {}, safety_tolerance: {} } }, Output: { type: 'string', format: 'uri' } } } } } }
const req = { assetId: 'portrait.7', prompt: 'a fictional boxer', width: 832, height: 1040, seed: 100007, format: 'png' as const }

describe('Replicate adapter', () => {
  it('is selected by IMAGE_GEN_PROVIDER=replicate, defaults to FLUX.2 [pro], and needs only REPLICATE_API_TOKEN', async () => {
    expect(providerFromEnv({ IMAGE_GEN_PROVIDER: 'replicate' }).id).toBe('replicate')
    const none = await providerFromEnv({ IMAGE_GEN_PROVIDER: 'replicate' }).checkStatus()
    expect(none.ready).toBe(false); expect(none.detail).toMatch(/REPLICATE_API_TOKEN/)
    const ok = await providerFromEnv({ IMAGE_GEN_PROVIDER: 'replicate', REPLICATE_API_TOKEN: TOKEN }).checkStatus()
    expect(ok.ready).toBe(true); expect(ok.model).toBe(DEFAULT_REPLICATE_MODEL); expect(DEFAULT_REPLICATE_MODEL).toBe('black-forest-labs/flux-2-pro')
    expect(JSON.stringify(ok)).not.toContain(TOKEN)
    expect((await providerFromEnv({ IMAGE_GEN_PROVIDER: 'openai-compatible' }).checkStatus()).provider).toBe('openai-compatible') // existing provider untouched
  })

  it('sends the documented request: official-model endpoint, Bearer token, Prefer: wait, {input}, custom 4:5 size in multiples of 16, seed', async () => {
    const { p, calls } = rig((c) => (c.url.endsWith('/predictions') ? res(201, { status: 'succeeded', output: 'https://replicate.delivery/x/out.png' }) : c.url.includes('/models/') ? res(200, SCHEMA) : res(200, 'img')))
    const r = await p.generateImage(req)
    expect(r.ok).toBe(true)
    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toBe(`${API}/models/black-forest-labs/flux-2-pro/predictions`)
    expect(post.headers.authorization).toBe(`Bearer ${TOKEN}`); expect(post.headers.prefer).toBe('wait=60')
    const body = JSON.parse(post.body!)
    expect(body.input).toMatchObject({ prompt: 'a fictional boxer', aspect_ratio: 'custom', width: 832, height: 1040, seed: 100007, output_format: 'png' })
    expect(body.input.width % 16).toBe(0); expect(body.input.height % 16).toBe(0)
  })

  it('downloads the output file WITHOUT the API token', async () => {
    const { p, calls } = rig((c) => (c.url.endsWith('/predictions') ? res(201, { status: 'succeeded', output: 'https://replicate.delivery/x/out.png' }) : c.url.includes('/models/') ? res(200, SCHEMA) : res(200, 'img', { 'content-type': 'image/png' })))
    const r = await p.generateImage(req)
    const dl = calls.find((c) => c.url.startsWith('https://replicate.delivery'))!
    expect(dl.headers.authorization).toBeUndefined(); expect(r.ok && r.data!.length).toBe(2000)
  })

  it('polls urls.get until the prediction finishes, then downloads', async () => {
    let polls = 0
    const { p } = rig((c) => {
      if (c.url.endsWith('/predictions')) return res(201, { status: 'processing', urls: { get: `${API}/predictions/abc` } })
      if (c.url === `${API}/predictions/abc`) { polls++; return res(200, polls < 3 ? { status: 'processing', urls: { get: `${API}/predictions/abc` } } : { status: 'succeeded', output: ['https://replicate.delivery/y.png'] }) }
      return c.url.includes('/models/') ? res(200, SCHEMA) : res(200, 'img')
    })
    expect((await p.generateImage(req)).ok).toBe(true); expect(polls).toBe(3)
  })

  it('waits out a 429 using retry_after, then succeeds; a failed prediction reports the model error', async () => {
    let posts = 0
    const a = rig((c) => (c.method === 'POST' ? (++posts === 1 ? res(429, { retry_after: 2 }) : res(201, { status: 'succeeded', output: 'https://replicate.delivery/z.png' })) : c.url.includes('/models/') ? res(200, SCHEMA) : res(200, 'img')))
    expect((await a.p.generateImage(req)).ok).toBe(true); expect(posts).toBe(2)
    const b = rig((c) => (c.method === 'POST' ? res(201, { status: 'failed', error: 'NSFW content detected' }) : res(200, SCHEMA)))
    const r = await b.p.generateImage(req)
    expect(r.ok).toBe(false); expect(r.error).toMatch(/failed: NSFW content detected/)
  })

  it('drops inputs the live schema does not declare (no paid failed request on schema drift)', async () => {
    const slim = { latest_version: { openapi_schema: { components: { schemas: { Input: { properties: { prompt: {}, width: {}, height: {}, seed: {} } } } } } } }
    const { p, calls } = rig((c) => (c.method === 'POST' ? res(201, { status: 'succeeded', output: 'https://replicate.delivery/z.png' }) : c.url.includes('/models/') ? res(200, slim) : res(200, 'img')))
    await p.generateImage(req)
    expect(Object.keys(JSON.parse(calls.find((c) => c.method === 'POST')!.body!).input).sort()).toEqual(['height', 'prompt', 'seed', 'width'])
  })

  it('understands every output form and refuses non-https output', () => {
    expect(outputRef('https://a/b.png')).toEqual({ kind: 'url', value: 'https://a/b.png' })
    expect(outputRef(['https://a/b.png', 'https://a/c.png'])?.value).toBe('https://a/b.png')
    expect(outputRef({ url: 'https://a/b.png' })?.value).toBe('https://a/b.png')
    expect(outputRef('data:image/png;base64,AAAA')?.kind).toBe('data')
    expect(outputRef('http://insecure/b.png')).toBeNull(); expect(outputRef(null)).toBeNull(); expect(outputRef([])).toBeNull()
  })

  it('never lets the token reach an error message, a status line or a thrown failure', async () => {
    const leaky = rig((c) => (c.method === 'POST' ? res(401, `Invalid token ${TOKEN}`) : res(200, SCHEMA)))
    const r = await leaky.p.generateImage(req)
    expect(r.ok).toBe(false); expect(r.error).not.toContain(TOKEN); expect(r.error).toContain('[redacted]')
    const boom = new ReplicateProvider({ REPLICATE_API_TOKEN: TOKEN }, async () => { throw new Error(`connect failed for Bearer ${TOKEN}`) }, async () => {})
    expect((await boom.generateImage(req)).error).not.toContain(TOKEN)
    expect(scrub(`x ${TOKEN} y r8_abcDEF123`, { REPLICATE_API_TOKEN: TOKEN })).toBe('x [redacted] y [redacted]')
  })

  it('--provider-check is read-only (GET only), reports the live schema, and flags a rejected token', async () => {
    const good = rig((c) => (c.url.endsWith('/account') ? res(200, { username: 'u' }) : res(200, SCHEMA)))
    const v = await good.p.verify()
    expect(v.ok).toBe(true); expect(good.calls.every((c) => c.method === 'GET')).toBe(true)
    expect(v.lines.join('\n')).toMatch(/input fields prompt, aspect_ratio/); expect(v.lines.join('\n')).not.toContain(TOKEN)
    const bad = rig(() => res(401, { detail: 'bad' }))
    expect((await bad.p.verify()).ok).toBe(false)
  })

  it('times out a prediction that never finishes and rejects a poll URL that is not on api.replicate.com', async () => {
    const stuck = new ReplicateProvider({ REPLICATE_API_TOKEN: TOKEN }, async (u, i) => (i?.method === 'POST' ? res(201, { status: 'processing', urls: { get: `${API}/predictions/s` } }) : u.includes('/models/') ? res(200, SCHEMA) : res(200, { status: 'processing', urls: { get: `${API}/predictions/s` } })), async () => { await new Promise((r) => setTimeout(r, 3)) }, 0, 20)
    expect((await stuck.generateImage(req)).error).toMatch(/timed out/)
    const evil = rig((c) => (c.method === 'POST' ? res(201, { status: 'processing', urls: { get: 'https://evil.example/steal' } }) : res(200, SCHEMA)))
    expect((await evil.p.generateImage(req)).error).toMatch(/no poll URL on api.replicate.com/)
    expect(evil.calls.some((c) => c.url.includes('evil.example'))).toBe(false)
  })
})
