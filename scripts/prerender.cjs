/**
 * Prerender every URL in dist/sitemap.xml to a static HTML file.
 *
 * Why: this is a Vite SPA. Without prerender, Vercel serves dist/index.html
 * (the SPA shell) for every directory URL. Googlebot reads the shell's hardcoded
 * canonical (https://anythingitechmv.com/) and treats every directory page as a
 * duplicate of the homepage. That triggered the GSC "Page with redirect" spike
 * we're solving for.
 *
 * Pipeline:
 *   1. Spin up a local static server on PORT, proxying /api/* to live API
 *   2. For each URL in dist/sitemap.xml (concurrency = PRERENDER_CONCURRENCY):
 *      a. Puppeteer loads the URL
 *      b. Wait for React + SEO-component effects to flush
 *      c. Serialize document.documentElement.outerHTML
 *      d. Write to dist/{path}/index.html
 *      e. Validate <link rel="canonical"> matches the URL we rendered
 *
 * Invariants:
 *   - The sitemap is the single source of truth for what gets prerendered.
 *     Sitemap and prerender output stay in lockstep automatically.
 *   - Every prerendered page must declare a canonical tag matching its own URL.
 *     A mismatch is logged as a warning; investigate before deploy.
 *   - The output is consumed by Vercel via outputDirectory=dist. Don't write
 *     anywhere else — the deploy pipeline copies dist/ verbatim.
 *
 * Failure modes:
 *   - API proxy 502 → live API down/rate-limited; React hydrates with empty
 *     data; canonical may end up pointing at /marthas-vineyard fallback.
 *   - Canonical mismatch → SPA route detected the URL as invalid (e.g. town
 *     not in static exports) and redirected client-side. Fix by updating
 *     data/exports/towns.json or business-types.json.
 *
 * Run: `npm run build:prerender` (preferred) or `npm run prerender` (if dist
 * already populated). Tune concurrency via PRERENDER_CONCURRENCY env var.
 */

const puppeteer = require('puppeteer-core');
const { createServer } = require('http');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const { join, dirname } = require('path');

/**
 * Resolve a Chromium executable across environments:
 *   - Vercel/Lambda Linux: use @sparticuz/chromium's bundled binary
 *   - Local macOS dev:     use the system Chrome / Chrome Canary
 *   - Local Linux dev:     use system chromium / google-chrome
 *
 * Override with PUPPETEER_EXECUTABLE_PATH env var if needed.
 */
async function resolveBrowserLaunchOptions() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    };
  }

  // Vercel build env, Lambda, or any Linux server
  if (process.platform === 'linux') {
    const chromium = require('@sparticuz/chromium');
    return {
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    };
  }

  // macOS local dev — try common install paths
  const fs = require('fs');
  const macPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  for (const p of macPaths) {
    if (fs.existsSync(p)) {
      return {
        executablePath: p,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true,
      };
    }
  }
  throw new Error(
    'No Chromium executable found. Install Google Chrome, or set PUPPETEER_EXECUTABLE_PATH.'
  );
}

const DIST_DIR = join(__dirname, '..', 'dist');
const SITE_URL = 'https://anythingitechmv.com';

/**
 * Routes to explicitly skip during prerender. Empty by default — the
 * /businesses/* filter pages used to live here, but the static-stub for
 * /api/directory/businesses (below) now lets them prerender cleanly along
 * with the rest of the directory.
 *
 * Add a route here only if it depends on an /api/* endpoint we don't stub
 * AND we don't want to fail the build over it.
 */
const PRERENDER_SKIP_PATHS = new Set();

/**
 * Static tool pages come from the sitemap and must be prerendered.
 * /tech-tools/wordpress-site-review is one of them — do not add it to the
 * skip set above. The generator in scripts/generate-sitemap.cjs is the source.
 */
const REQUIRED_STATIC_PATHS = ['/tech-tools/wordpress-site-review'];

/**
 * Read all URLs from sitemap.xml and convert to local paths.
 * The sitemap is the single source of truth for what gets prerendered —
 * sitemap and prerender stay in lockstep automatically, minus the small
 * skip-list above for API-dependent routes.
 */
function readSitemapPaths() {
  const sitemapPath = join(DIST_DIR, 'sitemap.xml');
  if (!existsSync(sitemapPath)) {
    throw new Error(`sitemap.xml not found at ${sitemapPath}. Run scripts/generate-sitemap.cjs first.`);
  }
  const xml = readFileSync(sitemapPath, 'utf8');
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
  const paths = urls.map(url => {
    const u = new URL(url);
    return u.pathname || '/';
  });
  const unique = [...new Set(paths)];
  const skipped = unique.filter(p => PRERENDER_SKIP_PATHS.has(p));
  if (skipped.length > 0) {
    console.log(`Skipping ${skipped.length} API-dependent route(s): ${skipped.join(', ')}`);
  }
  // Dedupe and sort (root first)
  return unique
    .filter(p => !PRERENDER_SKIP_PATHS.has(p))
    .sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
}

const ROUTES = readSitemapPaths();
for (const required of REQUIRED_STATIC_PATHS) {
  if (!ROUTES.includes(required)) {
    throw new Error(
      `Sitemap is missing ${required}. Add it in scripts/generate-sitemap.cjs before prerender.`,
    );
  }
}
console.log(`Loaded ${ROUTES.length} routes from sitemap.xml`);

const PORT = 3456;
// Where to proxy /api/* during prerender. Production was the historical
// default, but production's /api/directory/businesses returned HTTP 500 for
// months — which caused every business page to fail prerender (the SPA waited
// on a request that never resolved, Puppeteer hit networkidle0 timeout, the
// page wrote out as the SPA shell with the homepage canonical, and Google
// indexed nothing in the directory).
//
// The fix is to serve /api/directory/businesses from the same static export
// the sitemap uses (data/exports/businesses.json), making prerender entirely
// self-contained and deterministic. Other /api/* paths fall back to the
// upstream proxy so unrelated endpoints still work.
const API_PROXY_BASE = process.env.PRERENDER_API_BASE || 'https://anythingitechmv.com';

// Static export, used to serve /api/directory/businesses during prerender.
// Same data the sitemap is built from, so the two stay in sync.
const STATIC_BUSINESSES = (() => {
  try {
    const p = join(__dirname, '..', 'data', 'exports', 'businesses.json');
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(parsed) ? parsed : (parsed.businesses || []);
  } catch (err) {
    console.warn(`Could not load static businesses.json: ${err.message}`);
    return [];
  }
})();
console.log(`Prerender API stub loaded ${STATIC_BUSINESSES.length} businesses`);

// Serve /api/directory/businesses from the static export. Matches the
// shape the production handler returns ({ businesses: [...] } or
// { business: {...} } for a slug lookup), and applies the same filters the
// SPA passes (town, type, slug, search).
function handleBusinessesStub(reqUrl, res) {
  const url = new URL(reqUrl, 'http://localhost');
  const slug = url.searchParams.get('slug');
  const town = url.searchParams.get('town');
  const type = url.searchParams.get('type');
  const search = url.searchParams.get('search');

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Data-Source', 'prerender-static-stub');

  if (slug) {
    const b = STATIC_BUSINESSES.find((x) => x.slug === slug);
    if (!b) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Business not found' }));
      return;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ business: b }));
    return;
  }

  let list = STATIC_BUSINESSES;
  if (town) list = list.filter((b) => b.townSlug === town);
  if (type) list = list.filter((b) => b.businessType === type);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q)
    );
  }
  res.writeHead(200);
  res.end(JSON.stringify({ businesses: list }));
}

// Simple static file server with /api/* proxy to production for SPA data needs
function createStaticServer() {
  return createServer(async (req, res) => {
    // Serve the businesses endpoint from the static export. Bypasses any
    // production-API outage so prerender remains deterministic.
    if (req.url.startsWith('/api/directory/businesses')) {
      handleBusinessesStub(req.url, res);
      return;
    }

    // Other /api/* paths still proxy to the upstream — most aren't used by
    // any prerendered page, but keep the door open for future endpoints.
    if (req.url.startsWith('/api/')) {
      try {
        const upstream = await fetch(`${API_PROXY_BASE}${req.url}`, {
          headers: { 'User-Agent': 'prerender-proxy/1.0' },
        });
        const body = await upstream.arrayBuffer();
        const headers = {};
        upstream.headers.forEach((value, key) => {
          if (key !== 'transfer-encoding' && key !== 'content-encoding') {
            headers[key] = value;
          }
        });
        res.writeHead(upstream.status, headers);
        res.end(Buffer.from(body));
      } catch (err) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'proxy_failed', message: err.message }));
      }
      return;
    }

    let filePath = join(DIST_DIR, req.url === '/' ? 'index.html' : req.url);
    if (!filePath.includes('.') || !existsSync(filePath)) {
      filePath = join(DIST_DIR, 'index.html');
    }

    try {
      const content = readFileSync(filePath);
      const ext = filePath.split('.').pop();
      const mimeTypes = {
        'html': 'text/html',
        'js': 'application/javascript',
        'css': 'text/css',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon',
        'xml': 'application/xml',
        'txt': 'text/plain',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      res.end(content);
    } catch (e) {
      res.writeHead(404);
      res.end('Not found');
    }
  });
}

const CONCURRENCY = parseInt(process.env.PRERENDER_CONCURRENCY || '4', 10);

async function prerenderRoute(browser, route) {
  const page = await browser.newPage();
  try {
    await page.goto(`http://localhost:${PORT}${route}`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    // Small settle delay for any trailing async React effects (SEO writes, JSON-LD).
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 600)));

    const html = await page.content();
    const outputPath = route === '/'
      ? join(DIST_DIR, 'index.html')
      : join(DIST_DIR, route, 'index.html');
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, html);

    // Validation: extract canonical and verify it matches the route we just prerendered.
    const canonicalMatch = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/);
    const canonical = canonicalMatch ? canonicalMatch[1] : null;
    const expected = `${SITE_URL}${route}`;
    let warning = null;
    if (!canonical) {
      warning = 'no canonical tag';
    } else if (canonical !== expected) {
      warning = `canonical mismatch: got ${canonical}, expected ${expected}`;
    }
    return { route, canonical, warning };
  } finally {
    await page.close();
  }
}

async function prerender() {
  console.log('Starting pre-render process...');
  console.log(`Concurrency: ${CONCURRENCY}\n`);

  const server = createStaticServer();
  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`Static server running on http://localhost:${PORT}\n`);

  const launchOptions = await resolveBrowserLaunchOptions();
  console.log(`Launching browser: ${launchOptions.executablePath || '(system default)'}`);
  const browser = await puppeteer.launch(launchOptions);

  let successCount = 0;
  let errorCount = 0;
  let warningCount = 0;
  const errors = [];
  const warnings = [];
  let cursor = 0;

  async function worker(workerId) {
    while (true) {
      const idx = cursor++;
      if (idx >= ROUTES.length) return;
      const route = ROUTES[idx];
      try {
        const { warning } = await prerenderRoute(browser, route);
        successCount++;
        if (warning) {
          warningCount++;
          warnings.push({ route, warning });
        }
        if (idx % 25 === 0 || idx === ROUTES.length - 1) {
          process.stdout.write(`  [${idx + 1}/${ROUTES.length}] ${route}${warning ? ' ⚠ ' + warning : ''}\n`);
        }
      } catch (error) {
        errorCount++;
        errors.push({ route, error: error.message });
        process.stdout.write(`  ✗ ${route}: ${error.message}\n`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  await browser.close();
  server.close();

  console.log(`\nPre-render complete: ${successCount} ok, ${warningCount} warnings, ${errorCount} failed`);
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    warnings.slice(0, 20).forEach(w => console.log(`  ${w.route}: ${w.warning}`));
    if (warnings.length > 20) console.log(`  ... and ${warnings.length - 20} more`);
  }
  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.slice(0, 20).forEach(e => console.log(`  ${e.route}: ${e.error}`));
    if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more`);

    // Don't sink the entire deploy over a single flaky timeout. A small number
    // of failed routes are served as the SPA shell at runtime — degraded SEO
    // for those specific pages, but the rest of the site ships. Real failures
    // (build issues, mass timeouts, env problems) still exit non-zero.
    // Override with PRERENDER_MAX_FAILURES env var if you want stricter gating.
    const maxFailures = parseInt(process.env.PRERENDER_MAX_FAILURES || '2', 10);
    if (errors.length > maxFailures) {
      console.error(`\n${errors.length} prerender failures exceed PRERENDER_MAX_FAILURES=${maxFailures}; exiting.`);
      process.exit(1);
    }
    console.warn(`\n${errors.length} prerender failure(s) tolerated (limit=${maxFailures}). Affected routes will be served as the SPA shell.`);
  }
}

prerender().catch(err => {
  console.error('Pre-render failed:', err);
  process.exit(1);
});
