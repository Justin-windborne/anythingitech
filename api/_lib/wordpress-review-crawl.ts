import { assertPublicHost, AuditInputError } from './wordpress-review-guard.js';
import { buildReport, isChallenge, type HomepageSnapshot, type PathSnapshot } from './wordpress-review-report.js';
import type { AuditReport } from './wordpress-review-types.js';

export const REVIEW_USER_AGENT =
  'AnythingiTechSiteReview/1.0 (+https://anythingitechmv.com/tech-tools/wordpress-site-review; public site review)'

const TOTAL_MS = 6000
const REQUEST_MS = 4500
const MAX_REDIRECTS = 3
const CONCURRENCY = 4
const HOME_BYTES = 180_000

/**
 * Public read of a WordPress site.
 * GET only. No logins, no method calls, no exploit payloads.
 * Sensitive paths are sniffed (a few hundred bytes), not downloaded.
 */

const PROBES: { id: string; path: string; maxBytes: number; sensitive?: boolean }[] = [
  { id: 'wp-json', path: '/wp-json/', maxBytes: 24_000 },
  { id: 'readme', path: '/readme.html', maxBytes: 12_000 },
  { id: 'xmlrpc', path: '/xmlrpc.php', maxBytes: 4_000 },
  { id: 'login', path: '/wp-login.php', maxBytes: 30_000 },
  { id: 'config-bak', path: '/wp-config.php.bak', maxBytes: 480, sensitive: true },
  { id: 'config-old', path: '/wp-config.php.old', maxBytes: 480, sensitive: true },
  { id: 'config-tilde', path: '/wp-config.php~', maxBytes: 480, sensitive: true },
  { id: 'debug-content', path: '/wp-content/debug.log', maxBytes: 480, sensitive: true },
  { id: 'debug-root', path: '/debug.log', maxBytes: 480, sensitive: true },
  { id: 'robots', path: '/robots.txt', maxBytes: 4_000 },
  { id: 'sitemap', path: '/sitemap.xml', maxBytes: 2_000 },
]

type FetchError = 'timeout' | 'network' | 'tls' | 'invalid' | 'private-host'

interface FetchHit {
  kind: 'response'
  status: number
  url: string
  headers: Record<string, string>
  body: string
  contentType: string
}

interface FetchMiss {
  kind: 'error'
  reason: FetchError
}

export async function auditDomain(host: string, now: Date = new Date()): Promise<AuditReport> {
  const parent = AbortSignal.timeout(TOTAL_MS)
  const hosts = new Map<string, Promise<void>>()
  const allowHost = (hostname: string) => {
    const key = hostname.toLowerCase()
    const cached = hosts.get(key)
    if (cached) return cached
    const pending = assertPublicHost(key)
    hosts.set(key, pending)
    return pending
  }
  const home = await loadHomepage(host, parent, allowHost)

  if (home.error || home.blocked || !home.finalUrl) {
    return buildReport(home, [], now.toISOString())
  }

  const origin = new URL(home.finalUrl).origin
  const paths = await mapPool(PROBES, CONCURRENCY, (probe) => probePath(origin, probe, parent, allowHost))
  return buildReport(home, paths, now.toISOString())
}

type AllowHost = (hostname: string) => Promise<void>

async function loadHomepage(host: string, parent: AbortSignal, allowHost: AllowHost): Promise<HomepageSnapshot> {
  const httpsStarted = Date.now()
  const https = await fetchPublic(`https://${host}/`, parent, HOME_BYTES, false, allowHost)

  if (https.kind === 'response') {
    return snapshotHome(host, https, false, null, Date.now() - httpsStarted)
  }

  if (https.reason === 'invalid') {
    throw new AuditInputError('Enter a public domain, such as yoursite.com.')
  }

  const httpStarted = Date.now()
  const http = await fetchPublic(`http://${host}/`, parent, HOME_BYTES, false, allowHost)
  if (http.kind === 'error' && http.reason === 'invalid') {
    throw new AuditInputError('Enter a public domain, such as yoursite.com.')
  }
  if (http.kind === 'error') {
    return {
      host,
      finalUrl: null,
      transport: null,
      status: null,
      headers: {},
      html: '',
      blocked: false,
      error: http.reason === 'timeout' || http.reason === 'tls' ? http.reason : 'network',
      httpFallbackUsed: false,
      httpsError: https.reason === 'tls' || https.reason === 'timeout' ? https.reason : 'network',
      durationMs: null,
    }
  }

  const snap = snapshotHome(
    host,
    http,
    true,
    https.reason === 'tls' || https.reason === 'timeout' ? https.reason : 'network',
    Date.now() - httpStarted,
  )
  snap.transport = 'http'
  return snap
}

function snapshotHome(
  host: string,
  hit: FetchHit,
  httpFallbackUsed: boolean,
  httpsError: HomepageSnapshot['httpsError'],
  durationMs: number,
): HomepageSnapshot {
  const transport = hit.url.startsWith('http://') ? 'http' : 'https'
  const blocked = isChallenge(hit.status, hit.headers, hit.body)
  return {
    host,
    finalUrl: hit.url,
    transport,
    status: hit.status,
    headers: hit.headers,
    html: blocked ? '' : hit.body,
    blocked,
    error: null,
    httpFallbackUsed,
    httpsError,
    durationMs,
  }
}

async function probePath(
  origin: string,
  probe: (typeof PROBES)[number],
  parent: AbortSignal,
  allowHost: AllowHost,
): Promise<PathSnapshot> {
  const target = new URL(probe.path, origin).toString()
  let result: FetchHit | FetchMiss
  try {
    result = await fetchPublic(target, parent, probe.maxBytes, Boolean(probe.sensitive), allowHost)
  } catch {
    return {
      id: probe.id,
      path: probe.path,
      status: null,
      finalUrl: null,
      contentType: '',
      bodySample: '',
      error: 'network',
      sensitive: probe.sensitive,
    }
  }
  if (result.kind === 'error') {
    return {
      id: probe.id,
      path: probe.path,
      status: null,
      finalUrl: null,
      contentType: '',
      bodySample: '',
      error: result.reason === 'timeout' ? 'timeout' : result.reason === 'tls' ? 'tls' : 'network',
      sensitive: probe.sensitive,
    }
  }
  return {
    id: probe.id,
    path: probe.path,
    status: result.status,
    finalUrl: result.url,
    contentType: result.contentType,
    bodySample: result.body,
    error: null,
    sensitive: probe.sensitive,
  }
}

async function fetchPublic(
  startUrl: string,
  parent: AbortSignal,
  maxBytes: number,
  sensitive: boolean,
  allowHost: AllowHost,
): Promise<FetchHit | FetchMiss> {
  let current = startUrl
  const seen = new Set<string>()

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (parent.aborted) return { kind: 'error', reason: 'timeout' }
    if (seen.has(current)) return { kind: 'error', reason: 'network' }
    seen.add(current)

    let url: URL
    try {
      url = new URL(current)
    } catch {
      return { kind: 'error', reason: 'invalid' }
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'error', reason: 'invalid' }
    if (url.port && url.port !== '80' && url.port !== '443') return { kind: 'error', reason: 'invalid' }

    await allowHost(url.hostname)

    const signal = AbortSignal.any([parent, AbortSignal.timeout(REQUEST_MS)])
    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        signal,
        headers: {
          'User-Agent': REVIEW_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          ...(sensitive ? { Range: 'bytes=0-479' } : {}),
        },
      })
    } catch (error) {
      return { kind: 'error', reason: classifyError(error) }
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel().catch(() => undefined)
      if (!location || hop === MAX_REDIRECTS) {
        return {
          kind: 'response',
          status: response.status,
          url: url.toString(),
          headers: headerRecord(response.headers),
          body: '',
          contentType: response.headers.get('content-type') || '',
        }
      }
      try {
        current = new URL(location, url).toString()
      } catch {
        return { kind: 'error', reason: 'invalid' }
      }
      continue
    }

    const contentType = response.headers.get('content-type') || ''
    const body = await readLimited(response, maxBytes)
    return {
      kind: 'response',
      status: response.status,
      url: url.toString(),
      headers: headerRecord(response.headers),
      body,
      contentType,
    }
  }

  return { kind: 'error', reason: 'network' }
}

async function readLimited(response: Response, maxBytes: number): Promise<string> {
  const stream = response.body
  if (!stream) return ''
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let text = ''
  try {
    while (received < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      const room = maxBytes - received
      const slice = value.byteLength > room ? value.subarray(0, room) : value
      received += slice.byteLength
      text += decoder.decode(slice, { stream: true })
    }
    text += decoder.decode()
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return text
}

function headerRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    const name = key.toLowerCase()
    if (name === 'set-cookie' || name === 'cookie') return
    out[name] = value.slice(0, 400)
  })
  return out
}

function classifyError(error: unknown): FetchError {
  if (!error || typeof error !== 'object') return 'network'
  const name = 'name' in error ? String(error.name) : ''
  if (name === 'AbortError' || name === 'TimeoutError') return 'timeout'
  const cause = 'cause' in error && error.cause && typeof error.cause === 'object' ? error.cause : null
  const code = cause && 'code' in cause ? String((cause as { code?: unknown }).code || '') : ''
  const message = `${'message' in error ? String(error.message) : ''} ${code}`
  if (/CERT_|TLS|SSL|UNABLE_TO_VERIFY|ERR_TLS|DEPTH_ZERO/i.test(message)) return 'tls'
  if (/abort|timeout/i.test(message)) return 'timeout'
  return 'network'
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index] as T)
    }
  }
  const workers = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

export { AuditInputError }
