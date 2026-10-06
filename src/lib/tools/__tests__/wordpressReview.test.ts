import { describe, expect, it } from 'vitest';
import { isPrivateIp } from '../../../../api/_lib/wordpress-review-guard';
import { leadFieldErrors, normalizeDomain } from '../../../../api/_lib/wordpress-review-normalize';
import { buildReport, isChallenge, type HomepageSnapshot, type PathSnapshot } from '../../../../api/_lib/wordpress-review-report';
import { extractDocumentSeo } from '../../../../api/_lib/wordpress-review-scores';

const SECRET = 'db-secret-should-not-leak'

function home(partial: Partial<HomepageSnapshot> & Pick<HomepageSnapshot, 'host' | 'html'>): HomepageSnapshot {
  return {
    finalUrl: `https://${partial.host}/`,
    transport: 'https',
    status: 200,
    headers: {},
    blocked: false,
    error: null,
    httpFallbackUsed: false,
    httpsError: null,
    durationMs: 400,
    ...partial,
  }
}

function path(partial: Partial<PathSnapshot> & Pick<PathSnapshot, 'id' | 'path'>): PathSnapshot {
  return {
    status: 404,
    finalUrl: `https://example.com${partial.path}`,
    contentType: 'text/html',
    bodySample: '<!doctype html><title>Not found</title>',
    error: null,
    ...partial,
  }
}

describe('normalizeDomain', () => {
  it('strips protocol and path', () => {
    expect(normalizeDomain('HTTPS://Example.com/blog/post?x=1')).toEqual({ host: 'example.com' })
  })

  it('rejects ip literals, localhost, and custom ports', () => {
    expect('error' in normalizeDomain('http://127.0.0.1')).toBe(true)
    expect('error' in normalizeDomain('localhost')).toBe(true)
    expect('error' in normalizeDomain('https://example.com:8443/wp-admin')).toBe(true)
    expect('error' in normalizeDomain('')).toBe(true)
  })
})

describe('leadFieldErrors', () => {
  it('requires domain, name, and email', () => {
    const errors = leadFieldErrors({ domain: '', name: '', email: 'not-an-email' })
    expect(errors.domain).toBeTruthy()
    expect(errors.name).toBeTruthy()
    expect(errors.email).toBeTruthy()
  })
})

describe('isPrivateIp', () => {
  it('flags private and link-local addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.20', '172.16.5.5', '169.254.169.254', '::1']) {
      expect(isPrivateIp(ip)).toBe(true)
    }
    expect(isPrivateIp('8.8.8.8')).toBe(false)
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true)
  })
})

describe('buildReport', () => {
  it('differentiates a WordPress homepage from a static site', () => {
    const wpHtml = `<!doctype html><html><head>
      <meta name="generator" content="WordPress 5.8.3" />
      <link rel="https://api.w.org/" href="https://old.example/wp-json/" />
      </head><body>
      <a href="/author/admin/">Admin</a>
      <script src="/wp-content/themes/flavor/app.js"></script>
      <script src="/wp-content/plugins/contact-form-7/includes/js/index.js"></script>
      <script src="/wp-includes/js/jquery.js?ver=5.8.3"></script>
      </body></html>`

    const wp = buildReport(
      home({
        host: 'old.example',
        html: wpHtml,
        headers: { server: 'nginx' },
      }),
      [
        path({
          id: 'wp-json',
          path: '/wp-json/',
          status: 200,
          contentType: 'application/json',
          bodySample: '{"namespaces":["oembed/1.0","wp/v2"],"routes":{"/wp/v2/users":{}}}',
        }),
        path({
          id: 'readme',
          path: '/readme.html',
          status: 200,
          bodySample: '<html><title>WordPress</title></html>',
        }),
        path({
          id: 'xmlrpc',
          path: '/xmlrpc.php',
          status: 405,
          contentType: 'text/plain',
          bodySample: '',
        }),
        path({
          id: 'login',
          path: '/wp-login.php',
          status: 200,
          bodySample: '<form><input name="log" id="user_login" /></form>',
        }),
        path({
          id: 'debug-root',
          path: '/debug.log',
          status: 200,
          contentType: 'text/plain',
          sensitive: true,
          bodySample: `<?php define('DB_PASSWORD', '${SECRET}');`,
        }),
      ],
    )

    expect(wp.wordpress).toBe(true)
    expect(wp.summary).toMatch(/old\.example/)
    expect(wp.summary).toMatch(/WordPress/)
    const ids = wp.findings.map((finding) => finding.id)
    expect(ids.includes('version')).toBeTruthy()
    expect(ids.includes('sensitive-files')).toBeTruthy()
    expect(ids.includes('readme')).toBeTruthy()
    expect(ids.includes('xmlrpc')).toBeTruthy()
    expect(wp.findings.find((finding) => finding.id === 'version')?.severity).toBe('high')
    expect(JSON.stringify(wp).includes(SECRET)).toBe(false)

    const plain = buildReport(
      home({
        host: 'example.com',
        html: '<!doctype html><html><head><title>Example</title></head><body><p>Hello</p></body></html>',
        headers: {
          'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
          'strict-transport-security': 'max-age=63072000',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'permissions-policy': 'camera=()',
        },
      }),
      [
        path({ id: 'wp-json', path: '/wp-json/' }),
        path({ id: 'readme', path: '/readme.html' }),
        path({ id: 'xmlrpc', path: '/xmlrpc.php' }),
        path({ id: 'login', path: '/wp-login.php' }),
        path({ id: 'debug-root', path: '/debug.log', sensitive: true }),
      ],
    )

    expect(plain.wordpress).toBe(false)
    expect(plain.summary.includes('did not present as WordPress')).toBe(true)
    expect(wp.hygiene.value < plain.hygiene.value).toBeTruthy()
    expect(wp.hygiene.value >= 1 && wp.hygiene.value <= 10).toBeTruthy()
    expect(plain.presence.value >= 1 && plain.presence.value <= 10).toBeTruthy()
    expect(JSON.stringify(wp).includes('penetration')).toBe(false)
    expect(plain.findings.some((finding) => finding.id === 'sensitive-files')).toBe(false)
    expect(wp.findings.map((finding) => finding.id)).not.toEqual(plain.findings.map((finding) => finding.id))
  })

  it('treats a redirected wp-login page as reachable without copying the document', () => {
    const report = buildReport(home({ host: 'wordpress.org', html: '<html>WordPress</html>' }), [
      path({
        id: 'login',
        path: '/wp-login.php',
        status: 200,
        finalUrl: 'https://login.wordpress.org/',
        bodySample: '<html><title>WordPress.org Login</title><p>Sign in</p></html>',
      }),
    ])
    const login = report.findings.find((finding) => finding.id === 'wp-login')
    expect(login).toBeTruthy()
    expect(login.detail).toMatch(/redirected/)
    expect(login.detail.includes('<title>')).toBe(false)
    expect(report.wordpress).toBe(true)
  })

  it('stops at a block instead of treating it as WordPress', () => {
    const report = buildReport(
      home({
        host: 'blocked.example',
        html: '',
        status: 403,
        blocked: true,
        headers: { 'cf-ray': 'abc' },
      }),
      [],
    )
    expect(report.wordpress).toBe(false)
    expect(report.findings.some((finding) => finding.id === 'blocked')).toBe(true)
    expect(report.summary).toMatch(/declined/)
    expect(report.hygiene.limited).toBe(true)
    expect(report.hygiene.value).toBe(7)
    expect(report.hygiene.band).toBe('Steady')
    expect(report.presence.limited).toBe(true)
  })

  it('scores SEO and speed from public homepage signals', () => {
    const report = buildReport(
      home({
        host: 'clean.example',
        durationMs: 420,
        html: `<!doctype html><html><head>
          <title>Harbor cafe in Vineyard Haven</title>
          <meta name="description" content="Breakfast and dinner on Main Street, with a short menu and a longer porch." />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          </head><body><h1>Harbor cafe</h1></body></html>`,
        headers: {
          'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
          'strict-transport-security': 'max-age=63072000',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'permissions-policy': 'camera=()',
        },
      }),
      [
        path({
          id: 'robots',
          path: '/robots.txt',
          status: 200,
          contentType: 'text/plain',
          bodySample: 'User-agent: *\nDisallow:\nSitemap: https://clean.example/sitemap.xml',
        }),
        path({
          id: 'sitemap',
          path: '/sitemap.xml',
          status: 200,
          contentType: 'application/xml',
          bodySample: '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
        }),
      ],
    )
    expect(report.presence.value).toBe(10)
    expect(report.presence.band).toBe('Polished')
    const notes = report.presence.notes.join('\n')
    expect(notes).toMatch(/HTTPS is on/)
    expect(notes).toMatch(/One H1/)
    expect(notes).toMatch(/robots.txt is present/)
    expect(notes).toMatch(/sitemap.xml is present/)
    expect(notes).toMatch(/not a Lighthouse run/)
    expect(report.summary).toMatch(/Public hygiene is 10, Fortified/)
  })

  it('does not treat an HTML soft 404 as a leaked file', () => {
    const report = buildReport(home({ host: 'soft.example', html: '<html></html>' }), [
      path({
        id: 'config-bak',
        path: '/wp-config.php.bak',
        status: 200,
        sensitive: true,
        contentType: 'text/html',
        bodySample: '<!doctype html><html><title>Not found</title></html>',
      }),
    ])
    expect(report.findings.some((finding) => finding.id === 'sensitive-files')).toBe(false)
  })
})

describe('extractDocumentSeo', () => {
  it('decodes title entities before scoring length', () => {
    const seo = extractDocumentSeo('<title>CMS &#8211; WordPress.org</title><meta name="description" content="A &amp; B">')
    expect(seo.title).toBe(`CMS ${String.fromCodePoint(8211)} WordPress.org`)
    expect(seo.description).toBe('A & B')
  })
})

describe('isChallenge', () => {
  it('recognizes a forbid and a challenge title', () => {
    expect(isChallenge(403, {}, '')).toBe(true)
    expect(isChallenge(200, { 'cf-ray': '1', server: 'cloudflare' }, '<title>Just a moment...</title>')).toBe(true)
    expect(isChallenge(200, { 'cf-ray': '1', server: 'cloudflare' }, '<title>Harbor Cafe</title>')).toBe(false)
  })
})
