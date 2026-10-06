import {
  extractDocumentSeo,
  formatScore,
  scoreHygiene,
  scorePresence,
  type PresenceInput,
} from './wordpress-review-scores.js';
import type { AuditFinding, AuditReport, Severity } from './wordpress-review-types.js';

export interface HomepageSnapshot {
  host: string
  finalUrl: string | null
  transport: 'https' | 'http' | null
  status: number | null
  headers: Record<string, string>
  html: string
  blocked: boolean
  error: 'timeout' | 'network' | 'tls' | null
  httpFallbackUsed: boolean
  httpsError: 'timeout' | 'network' | 'tls' | null
  /** Homepage response time. Null when the site did not answer. */
  durationMs: number | null
}

export interface PathSnapshot {
  id: string
  path: string
  status: number | null
  finalUrl: string | null
  contentType: string
  /** Short sample used only to tell a real file from an HTML error page. Never returned. */
  bodySample: string
  error: 'timeout' | 'network' | 'tls' | null
  sensitive?: boolean
}

const HEADER_LABELS: { key: string; label: string; serious?: boolean; httpsOnly?: boolean }[] = [
  { key: 'content-security-policy', label: 'Content-Security-Policy', serious: true },
  { key: 'x-frame-options', label: 'X-Frame-Options' },
  { key: 'strict-transport-security', label: 'Strict-Transport-Security', serious: true, httpsOnly: true },
  { key: 'x-content-type-options', label: 'X-Content-Type-Options' },
  { key: 'referrer-policy', label: 'Referrer-Policy' },
  { key: 'permissions-policy', label: 'Permissions-Policy' },
]

export function buildReport(
  home: HomepageSnapshot,
  paths: PathSnapshot[],
  scannedAt: string = new Date().toISOString(),
): AuditReport {
  const findings: AuditFinding[] = []
  const host = home.host

  if (home.error && !home.httpFallbackUsed) {
    findings.push({
      id: 'unreachable',
      severity: 'warn',
      title: 'The site did not respond in time',
      detail: `${host} did not answer on HTTPS or HTTP within the few seconds this review allows. Nothing else was checked.`,
    })
    return finish(home, paths, findings, false, scannedAt)
  }

  if (home.httpFallbackUsed && home.transport === 'http') {
    const why =
      home.httpsError === 'tls'
        ? 'the certificate check failed'
        : home.httpsError === 'timeout'
          ? 'the HTTPS connection timed out'
          : 'HTTPS did not connect'
    findings.push({
      id: 'http-only',
      severity: 'warn',
      title: 'Only HTTP answered',
      detail: `${why} for ${host}. The site responded on HTTP. Later checks used that HTTP origin.`,
    })
  } else if (home.transport === 'https' && home.finalUrl?.startsWith('http://')) {
    findings.push({
      id: 'https-downgrade',
      severity: 'warn',
      title: 'HTTPS redirected to HTTP',
      detail: `${host} accepted HTTPS and then sent the review to an HTTP address. Prefer staying on HTTPS.`,
    })
  }

  if (home.blocked) {
    findings.push({
      id: 'blocked',
      severity: 'warn',
      title: 'The site declined the automated read',
      detail: `${host} refused or challenged the public homepage request (HTTP ${home.status ?? 'blocked'}). This pass stopped there instead of retrying.`,
    })
    return finish(home, paths, findings, false, scannedAt)
  }

  const html = home.html || ''
  const signals = readHtml(html)
  const wpJson = readWpJson(paths.find((path) => path.id === 'wp-json'))
  const readme = readmeExposed(paths.find((path) => path.id === 'readme'))
  const xmlrpc = xmlrpcExposed(paths.find((path) => path.id === 'xmlrpc'))
  const login = loginExposed(paths.find((path) => path.id === 'login'))
  const leaked = paths.filter(isLeakedFile).map((path) => path.path)

  const wordpress = Boolean(
    signals.generatorIsWordPress ||
      signals.hasWpPaths ||
      signals.hasApiLink ||
      wpJson ||
      readme ||
      login.exposed,
  )

  if (home.status && home.status >= 400 && !wordpress) {
    findings.push({
      id: 'homepage-status',
      severity: 'info',
      title: `The homepage returned HTTP ${home.status}`,
      detail: `${host} answered, and the status was ${home.status}. The path checks below still ran once.`,
    })
  }

  if (home.status && home.status < 400 && !html.trim() && !signals.hasWpPaths) {
    findings.push({
      id: 'empty-homepage',
      severity: 'info',
      title: 'The homepage body was empty',
      detail: `${host} returned status ${home.status} without HTML this pass could read.`,
    })
  }

  if (signals.version) {
    const severity = versionSeverity(signals.version)
    const assetNote =
      signals.assetVersion && signals.assetVersion !== signals.version
        ? ` Public script URLs also advertise ${signals.assetVersion}.`
        : ''
    findings.push({
      id: 'version',
      severity,
      title: `The site advertises WordPress ${signals.version}`,
      detail:
        severity === 'high'
          ? `${host} names WordPress ${signals.version} in public HTML. That line is behind the 6.5 releases current sites are on. Publishing the number is a maintenance habit.${assetNote}`
          : `${host} names WordPress ${signals.version} in public HTML. Publishing the version is a habit worth dropping.${assetNote}`,
    })
  } else if (signals.assetVersion) {
    findings.push({
      id: 'version',
      severity: versionSeverity(signals.assetVersion),
      title: `Public WordPress files advertise ${signals.assetVersion}`,
      detail: `${host} does not print a generator tag, but /wp-includes/ URLs include version ${signals.assetVersion}. The number is already public.`,
    })
  }

  if (signals.themes.length || signals.plugins.length) {
    findings.push({
      id: 'theme-plugins',
      severity: 'info',
      title: 'Public assets name the theme and plugins',
      detail: themePluginDetail(host, signals.themes, signals.plugins),
    })
  }

  if (signals.authorLinks > 0) {
    findings.push({
      id: 'author-html',
      severity: 'warn',
      title: 'Homepage HTML links to author archives',
      detail: `${host} links to ${signals.authorLinks} author ${signals.authorLinks === 1 ? 'archive' : 'archives'} in the homepage HTML. Those pages often show usernames. This pass did not open them.`,
    })
  }

  if (wpJson) {
    const names = wpJson.namespaces.length ? wpJson.namespaces.join(', ') : 'wp/v2'
    findings.push({
      id: 'wp-json',
      severity: 'info',
      title: 'The REST index is public',
      detail: `${host}/wp-json/ answered and names these namespaces: ${names}. The index is a map of the site. This pass did not request account records.`,
    })
    if (wpJson.listsUsers) {
      findings.push({
        id: 'wp-json-users',
        severity: 'warn',
        title: 'The public REST index lists a users route',
        detail: `The REST index on ${host} includes a users route. Many WordPress sites expose account names there. This pass did not request that route.`,
      })
    }
  }

  if (readme) {
    findings.push({
      id: 'readme',
      severity: 'warn',
      title: 'readme.html is public',
      detail: `/readme.html on ${host} is public and identifies WordPress. That file is a version billboard. This pass did not archive it.`,
    })
  }

  if (xmlrpc) {
    findings.push({
      id: 'xmlrpc',
      severity: 'warn',
      title: 'xmlrpc.php responds',
      detail: `A public GET to /xmlrpc.php on ${host} returned HTTP ${xmlrpc}. XML-RPC is an old WordPress interface. If it still answers, it is one more thing to maintain. This review did not call any methods.`,
    })
  }

  if (login.exposed) {
    findings.push({
      id: 'wp-login',
      severity: 'info',
      title: 'The login page is on the public internet',
      detail: login.redirected
        ? `A request to /wp-login.php on ${host} redirected to a public login page. That is normal for WordPress, and it is a page someone has to keep. This review did not try to sign in.`
        : `/wp-login.php on ${host} answered a public request. That is normal for WordPress, and it is a page someone has to keep. This review did not try to sign in.`,
    })
  }

  if (leaked.length) {
    findings.push({
      id: 'sensitive-files',
      severity: 'high',
      title: 'A backup or log path answered as a file',
      detail: `On ${host}, these addresses returned a file rather than a normal page: ${leaked.join(', ')}. This review read only a few bytes to tell a file from an error page, and it did not keep the contents. Remove or block them as ordinary upkeep.`,
    })
  }

  if (home.status && home.status < 500) {
    const headerFinding = securityHeaderFinding(host, home)
    if (headerFinding) findings.push(headerFinding)
  }

  const timedOut = paths.filter((path) => path.error === 'timeout').length
  if (timedOut > 0) {
    findings.push({
      id: 'partial',
      severity: 'info',
      title: 'A few checks did not finish',
      detail: `${timedOut} public ${timedOut === 1 ? 'check' : 'checks'} on ${host} did not finish inside the time limit. This pass is partial, and those paths were left out of the score.`,
    })
  }

  if (!wordpress && leaked.length === 0 && !findings.some((finding) => finding.id === 'version')) {
    const already = findings.some((finding) =>
      ['unreachable', 'blocked', 'homepage-status', 'empty-homepage'].includes(finding.id),
    )
    if (!already) {
      findings.push({
        id: 'not-wordpress',
        severity: 'info',
        title: 'This pass did not find WordPress',
        detail: `${host} did not include a WordPress generator tag, wp-content paths, a public REST index, readme.html, or a WordPress login page.`,
      })
    }
  }

  return finish(home, paths, findings, wordpress, scannedAt)
}

function finish(
  home: HomepageSnapshot,
  paths: PathSnapshot[],
  findings: AuditFinding[],
  wordpress: boolean,
  scannedAt: string,
): AuditReport {
  const unreachable = Boolean(home.error && !home.finalUrl)
  const hygiene = scoreHygiene(findings, { blocked: home.blocked, unreachable })
  const presence = scorePresence(presenceInput(home, paths))
  const checksRun = (home.status || home.error ? 1 : 0) + paths.filter((path) => path.status || path.error).length
  return {
    ok: true,
    domain: home.host,
    finalUrl: home.finalUrl,
    transport: home.transport,
    wordpress,
    summary: summarize(home.host, wordpress, hygiene, presence, { blocked: home.blocked, unreachable }),
    findings,
    hygiene,
    presence,
    scannedAt,
    checksRun,
  }
}

function summarize(
  host: string,
  wordpress: boolean,
  hygiene: AuditReport['hygiene'],
  presence: AuditReport['presence'],
  context: { blocked: boolean; unreachable: boolean },
): string {
  const scores = `Public hygiene is ${formatScore(hygiene.value)}, ${hygiene.band}. SEO and speed is ${formatScore(presence.value)}, ${presence.band}.`
  if (context.unreachable) {
    return `${host} did not answer on HTTPS or HTTP in the few seconds this review allows. ${scores}`
  }
  if (context.blocked) {
    return `${host} declined the automated read, so this is a partial picture. ${scores}`
  }
  if (wordpress) return `${host} is publicly running WordPress. ${scores}`
  return `${host} did not present as WordPress. ${scores}`
}

function presenceInput(home: HomepageSnapshot, paths: PathSnapshot[]): PresenceInput {
  const documentSeo = extractDocumentSeo(home.html || '')
  const https = (home.finalUrl || '').startsWith('https://') || home.transport === 'https'
  return {
    reachable: !home.error || Boolean(home.finalUrl),
    blocked: home.blocked,
    https,
    title: documentSeo.title,
    description: documentSeo.description,
    h1Count: documentSeo.h1Count,
    viewport: documentSeo.viewport,
    robots: textFileState(paths.find((path) => path.id === 'robots'), '/robots.txt', (sample) =>
      /user-agent|disallow|sitemap:/i.test(sample),
    ),
    sitemap: textFileState(paths.find((path) => path.id === 'sitemap'), '/sitemap.xml', (sample, contentType) =>
      /<urlset|<sitemapindex/i.test(sample) || /xml/i.test(contentType),
    ),
    responseMs: home.durationMs,
    htmlBytes: home.html ? home.html.length : null,
  }
}

function textFileState(
  path: PathSnapshot | undefined,
  pathname: string,
  looksReal: (sample: string, contentType: string) => boolean,
): 'present' | 'absent' | 'unknown' {
  if (!path || path.error) return 'unknown'
  if (path.status === 200 && pathEndsWith(path.finalUrl, pathname)) {
    const sample = path.bodySample
    if (/<!doctype|<html/i.test(sample)) return 'absent'
    if (looksReal(sample, path.contentType) || (sample.trim().length > 0 && !sample.includes('<'))) return 'present'
    return 'absent'
  }
  return 'absent'
}

function securityHeaderFinding(host: string, home: HomepageSnapshot): AuditFinding | null {
  const onHttps = (home.finalUrl || '').startsWith('https://') || home.transport === 'https'
  const csp = home.headers['content-security-policy'] || ''
  const missing = HEADER_LABELS.filter((item) => {
    if (item.httpsOnly && !onHttps) return false
    if (item.key === 'x-frame-options' && /frame-ancestors/i.test(csp)) return false
    return !home.headers[item.key]
  })

  if (missing.length === 0) {
    return {
      id: 'security-headers',
      severity: 'info',
      title: 'Common security headers are present',
      detail: `${host} sent Content-Security-Policy, frame protection, and the other headers this pass looks for.`,
    }
  }

  const serious = missing.some((item) => item.serious)
  const severity: Severity = serious || missing.length >= 3 ? 'warn' : 'info'
  return {
    id: 'security-headers',
    severity,
    title: 'Some security headers are missing',
      detail: `${host} responded without ${missing.map((item) => item.label).join(', ')}. These are public headers. Missing ones are a maintenance item.`,
  }
}

interface HtmlSignals {
  generatorIsWordPress: boolean
  version: string | null
  assetVersion: string | null
  themes: string[]
  plugins: string[]
  authorLinks: number
  hasWpPaths: boolean
  hasApiLink: boolean
}

function readHtml(html: string): HtmlSignals {
  const generator = metaContent(html, 'generator') || ''
  const generatorIsWordPress = /wordpress/i.test(generator)
  const version = generator.match(/wordpress\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i)?.[1] || null
  const assetVersion =
    html.match(/\/wp-includes\/[^"'?\s>]+?\?ver=([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i)?.[1] || null

  return {
    generatorIsWordPress,
    version,
    assetVersion,
    themes: uniqueMatches(html, /\/wp-content\/themes\/([a-z0-9_-]+)/gi),
    plugins: uniqueMatches(html, /\/wp-content\/plugins\/([a-z0-9_-]+)/gi),
    authorLinks: (html.match(/\/author\/[a-z0-9_-]+/gi) || []).length,
    hasWpPaths: /\/wp-content\/|\/wp-includes\//i.test(html),
    hasApiLink: /api\.w\.org/i.test(html),
  }
}

function metaContent(html: string, name: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) || []
  for (const tag of tags) {
    const named = new RegExp(`\\b(?:name|property)=["']${name}["']`, 'i').test(tag)
    if (!named) continue
    const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1]
    if (content) return content
  }
  return null
}

function uniqueMatches(html: string, pattern: RegExp): string[] {
  const found = new Set<string>()
  for (const match of html.matchAll(pattern)) {
    const value = match[1]?.toLowerCase()
    if (value) found.add(value)
    if (found.size >= 8) break
  }
  return [...found]
}

function themePluginDetail(host: string, themes: string[], plugins: string[]): string {
  const themeText = themes.length
    ? `the theme ${themes.slice(0, 2).join(' and ')}`
    : 'no theme folder'
  const pluginText = plugins.length
    ? `plugins ${plugins.slice(0, 6).join(', ')}`
    : 'no plugin folders'
  return `Asset URLs on ${host} name ${themeText} and ${pluginText}. The list comes from this homepage only.`
}

function readWpJson(path: PathSnapshot | undefined): { namespaces: string[]; listsUsers: boolean } | null {
  if (!path || path.status !== 200 || path.error) return null
  if (!pathEndsWith(path.finalUrl, '/wp-json')) return null
  const sample = path.bodySample
  // The index is often larger than the bytes we keep. Namespaces sit near the
  // front; do not download the rest of the routes table.
  const inline = sample.match(/"namespaces"\s*:\s*\[([^\]]{0,800})\]/)
  const namespaces = inline
    ? [...inline[1].matchAll(/"([^"]{1,80})"/g)]
        .map((match) => match[1]?.replace(/\\\//g, '/'))
        .filter((name): name is string => Boolean(name))
        .slice(0, 12)
    : []
  const listsUsers = sample.includes('"/wp/v2/users"')
  if (!namespaces.length && !listsUsers) return null
  return { namespaces, listsUsers }
}

function readmeExposed(path: PathSnapshot | undefined): boolean {
  if (!path || path.status !== 200 || path.error) return false
  if (!pathEndsWith(path.finalUrl, '/readme.html')) return false
  return /wordpress/i.test(path.bodySample)
}

function xmlrpcExposed(path: PathSnapshot | undefined): number | null {
  if (!path || path.error) return null
  if (!pathEndsWith(path.finalUrl, '/xmlrpc.php')) return null
  if (path.status === 405) return 405
  if (path.status === 200 && /xml-rpc|methodResponse|XML-RPC/i.test(path.bodySample)) return 200
  return null
}

function loginExposed(path: PathSnapshot | undefined): { exposed: boolean; redirected: boolean } {
  if (!path || path.error || path.status !== 200) return { exposed: false, redirected: false }
  const sample = path.bodySample
  const form = /name=["']log["']|id=["']user_login["']|name=["']pwd["']/i.test(sample)
  const title = sample.match(/<title[^>]*>([^<]{0,160})/i)?.[1] || ''
  const titleIsLogin = /log[\s-]?in/i.test(title)
  const mentionsWp = /wordpress/i.test(title) || /wordpress/i.test(sample.slice(0, 2000))
  const onLogin = pathEndsWith(path.finalUrl, '/wp-login.php')
  if (form && (onLogin || mentionsWp)) return { exposed: true, redirected: !onLogin }
  if (onLogin && titleIsLogin) return { exposed: true, redirected: false }
  if (!onLogin && titleIsLogin && mentionsWp) return { exposed: true, redirected: true }
  return { exposed: false, redirected: false }
}

function isLeakedFile(path: PathSnapshot): boolean {
  if (!path.sensitive || path.error) return false
  if (path.status !== 200 && path.status !== 206) return false
  if (!pathEndsWith(path.finalUrl, path.path)) return false

  const sample = path.bodySample.slice(0, 400)
  const lower = sample.toLowerCase()
  const contentType = path.contentType.toLowerCase()
  const html =
    contentType.includes('text/html') || lower.includes('<html') || lower.includes('<!doctype')

  if (html) {
    return (
      /define\s*\(\s*['"]db_|db_password|db_name/.test(lower) ||
      /php (fatal|warning|notice)|wordpress database error|stack trace/.test(lower)
    )
  }

  return sample.trim().length > 0
}

function pathEndsWith(finalUrl: string | null, pathname: string): boolean {
  if (!finalUrl) return false
  try {
    const path = decodeURIComponent(new URL(finalUrl).pathname).replace(/\/+$/, '').toLowerCase()
    const wanted = pathname.replace(/\/+$/, '').toLowerCase()
    return path === wanted
  } catch {
    return false
  }
}

function versionSeverity(version: string): Severity {
  const [majorRaw, minorRaw] = version.split('.')
  const major = Number.parseInt(majorRaw || '', 10)
  const minor = Number.parseInt(minorRaw || '0', 10)
  if (!Number.isFinite(major)) return 'warn'
  if (major < 6) return 'high'
  if (major === 6 && minor < 5) return 'high'
  return 'warn'
}

export function isChallenge(status: number, headers: Record<string, string>, body: string): boolean {
  if (status === 401 || status === 403 || status === 429) return true
  if (headers['cf-mitigated']) return true
  const title = (body.match(/<title[^>]*>([^<]{0,160})/i)?.[1] || '').toLowerCase()
  const cloudflare = Boolean(headers['cf-ray']) || (headers['server'] || '').toLowerCase().includes('cloudflare')
  if (
    (cloudflare || status === 503) &&
    /just a moment|attention required|access denied|verify you are human|pardon our interruption/.test(title)
  ) {
    return true
  }
  return false
}
