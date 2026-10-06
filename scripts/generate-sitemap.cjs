#!/usr/bin/env node
/**
 * Generate sitemap.xml and robots.txt for anythingitechmv.com.
 *
 * The sitemap is the single source of truth for what the prerender pipeline
 * outputs. Every URL in here must:
 *   - resolve to a 200 in the SPA (no client-side redirects)
 *   - have a stable canonical = its own URL (no homepage-canonical leak)
 *   - prerender successfully via scripts/prerender.cjs
 *
 * Filters applied to live business data (in this order):
 *   1. Town slug must be recognized by the SPA (data/exports/towns.json)
 *   2. Category slug must resolve via LEGACY_CATEGORY_REMAP to a modern slug
 *      that the SPA recognizes (data/exports/business-types.json)
 *   3. Business slug must not be a URL artifact (.com, http, facebook, etc.)
 *   4. Data-completeness score >= THIN_PAGE_MIN_SCORE
 *   5. Category not in REJECT_CATEGORIES (other, unknown, contractors)
 *
 * Run via `npm run sitemap` (or as part of `npm run build:prerender`).
 * Override the API base for testing: SITEMAP_API_BASE=https://example.com
 */

const fs = require('fs');
const path = require('path');
const {
  MV_TOWNS,
  VALID_TOWN_SLUGS,
  CATEGORIES,
  VALID_CATEGORY_SLUGS,
  CATEGORY_TO_SLUG,
} = require('./lib/taxonomy.cjs');

const SITE_URL = 'https://anythingitechmv.com';
const TODAY = new Date().toISOString().split('T')[0];

// Static data files that the SPA bundle uses for client-side route resolution.
// We must keep sitemap entries in sync with what these files recognize, or the
// SPA will redirect-out and the prerendered canonical won't match the URL.
function loadStaticExports() {
  const dataDir = path.join(__dirname, '..', 'data', 'exports');
  let towns = [], types = [];
  try { towns = JSON.parse(fs.readFileSync(path.join(dataDir, 'towns.json'), 'utf8')); } catch {}
  try { types = JSON.parse(fs.readFileSync(path.join(dataDir, 'business-types.json'), 'utf8')); } catch {}
  return {
    knownTowns: new Set(towns.map(t => t.slug)),
    knownTypes: new Set(types.map(t => t.slug)),
    typeByTownCounts: Object.fromEntries(types.map(t => [t.slug, t.byTown || {}])),
  };
}
const STATIC_EXPORTS = loadStaticExports();

// Taxonomy (towns + categories) is sourced from scripts/lib/taxonomy.cjs —
// the SINGLE source of truth across all generators. Don't redefine these
// inline; that's what caused the May-31 regression.

// Legacy category slugs that should be auto-remapped to a modern slug.
// Source-of-truth: a business assigned to one of these is correctly classified,
// just on a stale slug. We remap at sitemap-generation time so the canonical URL
// always uses the modern slug. Vercel.json has matching 308 redirects so the
// legacy URL never appears in the indexable set.
const LEGACY_CATEGORY_REMAP = {
  'lodging-and-tourism': 'lodging',
  'lodging-tourism': 'lodging',
  'shopping-retail': 'shopping-and-specialty-retail',
  'shopping-specialty-retail': 'shopping-and-specialty-retail',
  'health-wellness': 'medical-services-and-providers',
  'professional-services': 'business-and-professional-services',
  'business-professional-services': 'business-and-professional-services',
  'community': 'family-community-government',
  'automotive': 'automotive-and-marine',
  'automotive-marine': 'automotive-and-marine',
  'arts-entertainment': 'arts-and-entertainment',
  'beauty-wellness': 'beauty-and-wellness',
  'building-construction': 'building-and-construction',
  'medical-services-providers': 'medical-services-and-providers',
  'banking-finance-insurance': 'banking-finance-and-insurance',
  'real-estate-rentals': 'real-estate-and-rentals',
  'sports-recreation': 'sports-and-recreation',
  'transportation-utilities': 'transportation-and-utilities',
  'wedding-event-services': 'wedding-and-event-services',
  'home-services-trades': 'home-services-and-trades',
  'house-garden-pets': 'house-garden-and-pets',
  'restaurant': 'restaurants-food-beverages',
  'restaurants': 'restaurants-food-beverages',
};

// Categories that have NO modern equivalent — businesses assigned here are
// excluded from sitemap+prerender. Their URLs 308 redirect to the town index.
const REJECT_CATEGORIES = new Set([
  'other',
  'unknown',
  'contractors',
]);

// Thin-page exclusion list. Set by content-quality scorer below.
// Centrally defined so prerender.cjs can import the same logic if needed.
const THIN_PAGE_MIN_SCORE = 2;

// Invalid business slug patterns
const INVALID_SLUG_PATTERNS = [
  /^facebook/i,
  /^instagram/i,
  /^menu-/i,
  /menu-vineyard-haven/i,
  /redirecting/i,
  /-closed$/i,
  /^http/i,
  /http:/i,
  /^www\./i,
  /\.com$/i,
  /\.com-/i,
  /\.org$/i,
  /\.net$/i,
  /^securemy/i,
  /^campaign/i,
  /^subscribe/i,
  /^home-page/i,
  /^directories/i,
  /^welcome-/i,
  /^contact-us/i,
  /^about-us/i,
];

// ============================================================
// Static pages with their priorities
// ============================================================
const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: 1.0, lastmod: TODAY },
  { path: '/services', changefreq: 'monthly', priority: 0.9, lastmod: TODAY },
  { path: '/services/apple-repair', changefreq: 'monthly', priority: 0.8, lastmod: TODAY },
  { path: '/services/wifi-network', changefreq: 'monthly', priority: 0.8, lastmod: TODAY },
  { path: '/services/smart-home', changefreq: 'monthly', priority: 0.8, lastmod: TODAY },
  { path: '/services/tv-audio', changefreq: 'monthly', priority: 0.8, lastmod: TODAY },
  { path: '/services/business-it', changefreq: 'monthly', priority: 0.8, lastmod: TODAY },
  { path: '/services/mv-app-design', changefreq: 'monthly', priority: 0.8, lastmod: TODAY },
  { path: '/about', changefreq: 'monthly', priority: 0.7, lastmod: TODAY },
  { path: '/anything-itech-mv', changefreq: 'monthly', priority: 0.6, lastmod: TODAY },
  { path: '/contact', changefreq: 'monthly', priority: 0.7, lastmod: TODAY },
  { path: '/service-areas', changefreq: 'monthly', priority: 0.7, lastmod: TODAY },
  { path: '/tech-tips', changefreq: 'weekly', priority: 0.8, lastmod: TODAY },
  // Tech Tools — browser-based technician utilities. Add new tools in
  // src/App.tsx, the TOOLS registry in src/pages/tech-tools/TechTools.tsx,
  // and this list. Prerender reads the sitemap; scripts/prerender.cjs also
  // requires /tech-tools/wordpress-site-review to be present.
  { path: '/tech-tools', changefreq: 'monthly', priority: 0.8, lastmod: TODAY },
  { path: '/tech-tools/network-diagnostics', changefreq: 'monthly', priority: 0.8, lastmod: TODAY },
  { path: '/tech-tools/subnet-calculator', changefreq: 'monthly', priority: 0.6, lastmod: TODAY },
  { path: '/tech-tools/wifi-qr', changefreq: 'monthly', priority: 0.6, lastmod: TODAY },
  { path: '/tech-tools/latency-monitor', changefreq: 'monthly', priority: 0.6, lastmod: TODAY },
  { path: '/tech-tools/video-call-readiness', changefreq: 'monthly', priority: 0.6, lastmod: TODAY },
  { path: '/tech-tools/service-checker', changefreq: 'monthly', priority: 0.6, lastmod: TODAY },
  { path: '/tech-tools/wordpress-site-review', changefreq: 'monthly', priority: 0.6, lastmod: TODAY },
  { path: '/marthas-vineyard', changefreq: 'daily', priority: 0.9, lastmod: TODAY },
  { path: '/marthas-vineyard/submit', changefreq: 'monthly', priority: 0.5, lastmod: TODAY },
  // Filter-driven landing pages. These mirror the /businesses/* routes wired
  // up in src/App.tsx via FILTERS in pages/businesses/FilteredBusinessesPage.tsx.
  // When adding a filter, update both files together — there's no single
  // source of truth across the Node script and the SPA bundle.
  { path: '/businesses/verified', changefreq: 'weekly', priority: 0.8, lastmod: TODAY },
  { path: '/businesses/chamber-listed', changefreq: 'weekly', priority: 0.7, lastmod: TODAY },
  { path: '/businesses/gazette-listed', changefreq: 'weekly', priority: 0.7, lastmod: TODAY },
  { path: '/businesses/gomv-listed', changefreq: 'weekly', priority: 0.7, lastmod: TODAY },
  { path: '/businesses/black-owned', changefreq: 'weekly', priority: 0.7, lastmod: TODAY },
];

// Tech tip blog posts (validated real articles)
const TECH_TIP_SLUGS = [
  'why-business-wifi-fails',
  'comcast-wifi-large-marthas-vineyard-homes',
  'why-i-built-is-the-ferry-running',
  'wi-fi-coverage-for-large-properties',
  'office-wireless-network-installation',
  'professional-wireless-network-installation',
  'future-proof-luxury-wireless-network-marthas-vineyard',
  'luxury-home-wireless-network-marthas-vineyard',
  'marthas-vineyard-network-installations',
  'common-quick-fixes',
  'something-broken-iphone-ya-gonna-call-louis-hall',
  'malicious-ios-popups',
  'anything-apple-jingle',
  'weekly-tip-start-taking-advantage-cloud',
  'year-louis-hall-anything-apple-marthas-vineyard',
  'the-end-of-an-era',
];

// MV_TOWNS, CATEGORIES, CATEGORY_TO_SLUG are imported from
// scripts/lib/taxonomy.cjs above.

// ============================================================
// Business data source
// ============================================================

// Historical context (don't restore): this used to fetch from the live
// /api/directory/businesses endpoint during the build. That endpoint
// returned HTTP 500 in production, so every build saw zero businesses
// and the sitemap shipped without any business detail URLs — which meant
// prerender never produced static HTML for them — which meant Vercel
// served the SPA shell (with the homepage canonical) for every business
// page. Google indexed nothing in the directory section.
//
// The fix is to source from the static export the registry pipeline
// already writes (data/exports/businesses.json). It's regenerated by
// `npm run registry:export` and committed to the repo, so the build is
// fully self-contained and deterministic. The runtime SPA still hits the
// API; that's a separate concern.

const BUSINESSES_JSON_PATH = path.join(
  __dirname,
  '..',
  'data',
  'exports',
  'businesses.json'
);

async function fetchBusinesses() {
  // Optional override for local testing — fall back to env if explicitly set.
  if (process.env.SITEMAP_API_BASE) {
    const API_BASE = process.env.SITEMAP_API_BASE;
    try {
      const res = await fetch(`${API_BASE}/api/directory/businesses?limit=2000`);
      if (!res.ok) {
        console.error(`fetchBusinesses (override): HTTP ${res.status} from ${API_BASE}`);
        return [];
      }
      const data = await res.json();
      return data.businesses || [];
    } catch (err) {
      console.error('fetchBusinesses (override) error:', err.message);
      return [];
    }
  }

  try {
    const raw = fs.readFileSync(BUSINESSES_JSON_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // The exporter writes a top-level array. Be tolerant of either shape
    // (array or { businesses: [...] }) in case it changes later.
    const businesses = Array.isArray(parsed) ? parsed : parsed.businesses || [];
    console.log(`  Loaded ${businesses.length} businesses from ${path.relative(process.cwd(), BUSINESSES_JSON_PATH)}`);
    return businesses;
  } catch (err) {
    console.error(`fetchBusinesses: failed to read ${BUSINESSES_JSON_PATH}: ${err.message}`);
    console.error('Run `npm run registry:export` first to regenerate data/exports/businesses.json.');
    return [];
  }
}

// ============================================================
// Validation Functions
// ============================================================

function slugify(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCategorySlug(category) {
  if (!category) return null;
  const normalized = category.toLowerCase().trim();
  return CATEGORY_TO_SLUG[normalized] || null;
}

// Resolve a business's effective category slug:
//  1. Map the human-readable `category` field via CATEGORY_TO_SLUG (preferred)
//  2. Fall back to its raw `businessType` slug, applying LEGACY_CATEGORY_REMAP
//  3. Reject if the result is in REJECT_CATEGORIES or unmappable
function resolveBusinessCategory(biz) {
  let slug = getCategorySlug(biz.category);
  if (!slug && biz.businessType) {
    slug = LEGACY_CATEGORY_REMAP[biz.businessType] || biz.businessType;
  }
  if (!slug) return null;
  if (REJECT_CATEGORIES.has(slug)) return null;
  if (!VALID_CATEGORY_SLUGS.has(slug)) return null;
  return slug;
}

// Score a business on data completeness. Used to exclude empty/near-empty pages.
function scoreBusiness(biz) {
  let score = 0;
  if (biz.description && biz.description.length > 60) score += 2;
  else if (biz.description) score += 1;
  if (biz.phone) score++;
  if (biz.website) score++;
  if (biz.address && biz.address.length > 5) score++;
  if (biz.social && (biz.social.facebook || biz.social.instagram || biz.social.yelp || biz.social.tripadvisor)) score++;
  if (biz.hours) score++;
  return score;
}

function getTownSlug(town) {
  if (!town) return null;
  const slug = slugify(town);
  return VALID_TOWN_SLUGS.has(slug) ? slug : null;
}

function isValidBusinessSlug(slug) {
  if (!slug || typeof slug !== 'string') return false;
  if (slug.length < 3 || slug.length > 100) return false;

  // Check against invalid patterns
  for (const pattern of INVALID_SLUG_PATTERNS) {
    if (pattern.test(slug)) return false;
  }

  return true;
}

function isValidBusiness(biz) {
  // Must have required fields (category may be on businessType instead)
  if (!biz.slug) return false;
  if (!biz.town && !biz.townSlug) return false;
  if (!biz.category && !biz.businessType) return false;

  // Must be active
  if (biz.business_status === 'inactive' || biz.business_status === 'closed') return false;
  if (biz.status === 'inactive' || biz.status === 'closed') return false;

  // Must not need manual review
  if (biz.needs_manual_review === 1 || biz.needs_manual_review === true) return false;

  // Must not be a duplicate
  if (biz.is_duplicate === 1 || biz.is_duplicate === true) return false;

  // Town must be valid (not unknown)
  const townSlug = getTownSlug(biz.town || biz.townSlug);
  if (!townSlug) return false;

  // Category must resolve to a valid modern slug (after legacy remap)
  const categorySlug = resolveBusinessCategory(biz);
  if (!categorySlug) return false;

  // Business slug must be valid
  if (!isValidBusinessSlug(biz.slug)) return false;

  // Reject empty/near-empty pages
  if (scoreBusiness(biz) < THIN_PAGE_MIN_SCORE) return false;

  // Reject if the SPA's static bundle doesn't recognize this town or type —
  // those URLs will redirect client-side and the prerendered canonical won't
  // match the URL. Manual cleanup will surface in the rejection report.
  if (!STATIC_EXPORTS.knownTowns.has(townSlug)) return false;
  if (!STATIC_EXPORTS.knownTypes.has(categorySlug)) return false;

  return true;
}

// ============================================================
// Sitemap Generation
// ============================================================

function generateSitemap(businesses) {
  const urls = [];
  const rejected = [];

  // Add static pages
  STATIC_PAGES.forEach(page => {
    urls.push({
      loc: `${SITE_URL}${page.path}`,
      lastmod: page.lastmod,
      changefreq: page.changefreq,
      priority: page.priority
    });
  });

  // Add tech tips
  TECH_TIP_SLUGS.forEach(slug => {
    urls.push({
      loc: `${SITE_URL}/tech-tips/${slug}`,
      lastmod: TODAY,
      changefreq: 'monthly',
      priority: 0.6
    });
  });

  // Add town pages — only towns recognized by the static SPA data
  MV_TOWNS.forEach(town => {
    if (!STATIC_EXPORTS.knownTowns.has(town.slug)) return;
    urls.push({
      loc: `${SITE_URL}/marthas-vineyard/${town.slug}`,
      lastmod: TODAY,
      changefreq: 'weekly',
      priority: 0.8
    });
  });

  // Add category pages — only categories with enough businesses to warrant
  // a search slot. Categories with fewer than the threshold are also emitted
  // as `noindex, follow` by BusinessTypePage.tsx, so keeping them out of the
  // sitemap keeps the two signals aligned.
  const THIN_CATEGORY_THRESHOLD = 3;
  CATEGORIES.forEach(cat => {
    if (!STATIC_EXPORTS.knownTypes.has(cat.slug)) return;
    const byTown = STATIC_EXPORTS.typeByTownCounts[cat.slug] || {};
    const total = Object.values(byTown).reduce((a, b) => a + b, 0);
    if (total < THIN_CATEGORY_THRESHOLD) return;
    urls.push({
      loc: `${SITE_URL}/marthas-vineyard/${cat.slug}`,
      lastmod: TODAY,
      changefreq: 'weekly',
      priority: 0.7
    });
  });

  // Add town+category combo pages (only for combinations that have businesses)
  const townCategoryCombos = new Set();

  // Add valid business pages
  businesses.forEach(biz => {
    if (!isValidBusiness(biz)) {
      rejected.push({
        slug: biz.slug,
        reason: getRejectReason(biz)
      });
      return;
    }

    const townSlug = getTownSlug(biz.town || biz.townSlug);
    const categorySlug = resolveBusinessCategory(biz);
    const lastmod = biz.updated_at ? biz.updated_at.split('T')[0] : TODAY;

    // Track town+category combos
    townCategoryCombos.add(`${townSlug}/${categorySlug}`);

    urls.push({
      loc: `${SITE_URL}/marthas-vineyard/${townSlug}/${categorySlug}/${biz.slug}`,
      lastmod: lastmod,
      changefreq: 'weekly',
      priority: 0.6
    });
  });

  // Add town+category pages for valid combinations
  townCategoryCombos.forEach(combo => {
    urls.push({
      loc: `${SITE_URL}/marthas-vineyard/${combo}`,
      lastmod: TODAY,
      changefreq: 'weekly',
      priority: 0.7
    });
  });

  // Generate XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return { xml, count: urls.length, rejected };
}

function getRejectReason(biz) {
  if (!biz.slug) return 'missing slug';
  if (!biz.town && !biz.townSlug) return 'missing town';
  if (!biz.category && !biz.businessType) return 'missing category';
  if (biz.business_status === 'inactive' || biz.status === 'inactive') return 'inactive';
  if (biz.business_status === 'closed' || biz.status === 'closed') return 'closed';
  if (biz.needs_manual_review) return 'needs manual review';
  if (biz.is_duplicate) return 'duplicate';
  const ts = getTownSlug(biz.town || biz.townSlug);
  if (!ts) return `invalid town: ${biz.town || biz.townSlug}`;
  const cs = resolveBusinessCategory(biz);
  if (!cs) return `unmappable category: ${biz.category || biz.businessType}`;
  if (!isValidBusinessSlug(biz.slug)) return `invalid slug pattern: ${biz.slug}`;
  if (scoreBusiness(biz) < THIN_PAGE_MIN_SCORE) return `thin page (score ${scoreBusiness(biz)})`;
  if (!STATIC_EXPORTS.knownTowns.has(ts)) return `town not in static exports: ${ts}`;
  if (!STATIC_EXPORTS.knownTypes.has(cs)) return `type not in static exports: ${cs}`;
  return 'unknown';
}

function generateRobotsTxt() {
  return `# Robots.txt for anythingitechmv.com
# Generated: ${new Date().toISOString()}

User-agent: *
Allow: /

# Disallow admin and API routes
Disallow: /admin
Disallow: /admin/
Disallow: /api
Disallow: /api/

# Sitemap
Sitemap: ${SITE_URL}/sitemap.xml
Host: anythingitechmv.com
`;
}

// ============================================================
// Validation Check
// ============================================================

function validateSitemap(xml) {
  const errors = [];

  const FORBIDDEN_PATTERNS = [
    { pattern: /\/unknown\//g, desc: '/unknown/' },
    { pattern: /\/other\//g, desc: '/other/' },
    { pattern: /\/restaurant\//g, desc: '/restaurant/ (legacy)' },
    { pattern: /\/shopping-retail\//g, desc: '/shopping-retail/ (legacy)' },
    { pattern: /\/health-wellness\//g, desc: '/health-wellness/ (legacy)' },
    { pattern: /\/professional-services\//g, desc: '/professional-services/ (legacy)' },
    { pattern: /\/community\//g, desc: '/community/ (legacy)' },
    { pattern: /\/automotive\//g, desc: '/automotive/ (legacy)' },
    { pattern: /\/lodging-and-tourism\//g, desc: '/lodging-and-tourism/ (legacy — now /lodging/)' },
    { pattern: /http:\/\/(?!www\.sitemaps\.org)/g, desc: 'http:// (should be https)' },
    { pattern: /facebook/gi, desc: 'facebook' },
    { pattern: /instagram/gi, desc: 'instagram' },
    { pattern: /menu-vineyard-haven/gi, desc: 'menu-vineyard-haven' },
    { pattern: /redirecting/gi, desc: 'redirecting' },
    { pattern: /phillips-hardware-closed/gi, desc: 'phillips-hardware-closed' },
    { pattern: /<script/gi, desc: '<script tag' },
  ];

  for (const { pattern, desc } of FORBIDDEN_PATTERNS) {
    const matches = xml.match(pattern);
    if (matches && matches.length > 0) {
      errors.push(`Found ${matches.length} occurrence(s) of ${desc}`);
    }
  }

  return errors;
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('='.repeat(60));
  console.log('Generating sitemap.xml and robots.txt');
  console.log('='.repeat(60));
  console.log('');

  // Fetch businesses
  console.log('Fetching businesses from API...');
  const businesses = await fetchBusinesses();
  console.log(`Found ${businesses.length} total businesses in database\n`);

  // Generate sitemap
  const { xml: sitemapXml, count: urlCount, rejected } = generateSitemap(businesses);

  // Validate sitemap
  console.log('Validating sitemap...');
  const validationErrors = validateSitemap(sitemapXml);

  if (validationErrors.length > 0) {
    console.error('\n❌ VALIDATION FAILED:');
    validationErrors.forEach(err => console.error(`   - ${err}`));
    console.error('\nSitemap NOT written. Fix the issues above.\n');
    process.exit(1);
  }

  console.log('✅ Validation passed\n');

  // Generate robots.txt
  const robotsTxt = generateRobotsTxt();

  // Write files
  const publicDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const sitemapPath = path.join(publicDir, 'sitemap.xml');
  const robotsPath = path.join(publicDir, 'robots.txt');

  fs.writeFileSync(sitemapPath, sitemapXml);
  fs.writeFileSync(robotsPath, robotsTxt);

  // Count business URLs
  const businessUrlCount = businesses.filter(b => isValidBusiness(b)).length;

  console.log('Files generated:');
  console.log(`  ${sitemapPath}`);
  console.log(`  ${robotsPath}`);
  console.log('');
  console.log(`Sitemap contains ${urlCount} URLs:`);
  console.log(`  - Static pages: ${STATIC_PAGES.length}`);
  console.log(`  - Tech tips: ${TECH_TIP_SLUGS.length}`);
  console.log(`  - Town pages: ${MV_TOWNS.length}`);
  console.log(`  - Category pages: ${CATEGORIES.length}`);
  console.log(`  - Town+Category pages: ${new Set(businesses.filter(b => isValidBusiness(b)).map(b => `${getTownSlug(b.town)}/${getCategorySlug(b.category)}`)).size}`);
  console.log(`  - Business pages: ${businessUrlCount}`);
  console.log('');
  console.log(`Rejected ${rejected.length} businesses:`);

  // Group rejections by reason
  const rejectionCounts = {};
  rejected.forEach(r => {
    const key = r.reason.split(':')[0];
    rejectionCounts[key] = (rejectionCounts[key] || 0) + 1;
  });
  Object.entries(rejectionCounts).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
    console.log(`  - ${reason}: ${count}`);
  });

  console.log('');
  console.log('='.repeat(60));
  console.log('✅ Sitemap generation complete');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
