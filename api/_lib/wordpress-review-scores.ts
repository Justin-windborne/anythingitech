import type { AuditFinding, ReviewScore, Severity } from './wordpress-review-types.js';

/** 10 is the strong end. 1 is the weak end. Half points use both neighboring names. */
export const HYGIENE_BANDS: Record<number, string> = {
  10: 'Fortified',
  9: 'Hardened',
  8: 'Solid',
  7: 'Steady',
  6: 'Adequate',
  5: 'Patchy',
  4: 'Exposed',
  3: 'Fragile',
  2: 'Leaky',
  1: 'Wide open',
}

export const PRESENCE_BANDS: Record<number, string> = {
  10: 'Polished',
  9: 'Sharp',
  8: 'Strong',
  7: 'Healthy',
  6: 'Serviceable',
  5: 'Uneven',
  4: 'Sluggish',
  3: 'Thin',
  2: 'Buried',
  1: 'Broken',
}

export const HYGIENE_SCALE =
  '10 Fortified · 9 Hardened · 8 Solid · 7 Steady · 6 Adequate · 5 Patchy · 4 Exposed · 3 Fragile · 2 Leaky · 1 Wide open'

export const PRESENCE_SCALE =
  '10 Polished · 9 Sharp · 8 Strong · 7 Healthy · 6 Serviceable · 5 Uneven · 4 Sluggish · 3 Thin · 2 Buried · 1 Broken'

export const REVIEW_DISCLAIMER =
  'This is a public site review of hygiene, speed, and basic SEO. It is not a penetration test and it is not a security certification.'

export interface PresenceInput {
  reachable: boolean
  blocked: boolean
  https: boolean
  title: string | null
  description: string | null
  h1Count: number
  viewport: boolean
  robots: 'present' | 'absent' | 'unknown'
  sitemap: 'present' | 'absent' | 'unknown'
  responseMs: number | null
  htmlBytes: number | null
}

export function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function bandLabel(value: number, bands: Record<number, string>): string {
  const safe = toHalf(value)
  const lower = Math.floor(safe)
  const upper = Math.ceil(safe)
  if (lower === upper) return bands[lower] || bands[1]
  return `${bands[lower]} / ${bands[upper]}`
}

export function scoreHygiene(
  findings: Pick<AuditFinding, 'id' | 'severity' | 'title'>[],
  context: { blocked: boolean; unreachable: boolean },
): ReviewScore {
  if (context.unreachable) {
    return {
      value: 5,
      band: HYGIENE_BANDS[5],
      limited: true,
      notes: ['The site did not answer, so this is not a judgment of its upkeep.'],
    }
  }

  if (context.blocked) {
    return {
      value: 7,
      band: HYGIENE_BANDS[7],
      limited: true,
      notes: ['The site declined the automated read. This number is only a partial picture.'],
    }
  }

  let score = 10
  for (const finding of findings) score -= hygieneDeduction(finding)
  const value = toHalf(score)
  return {
    value,
    band: bandLabel(value, HYGIENE_BANDS),
    limited: false,
    notes: [],
  }
}

export function scorePresence(input: PresenceInput): ReviewScore {
  if (!input.reachable) {
    return {
      value: 1,
      band: PRESENCE_BANDS[1],
      limited: true,
      notes: ['The homepage did not answer, so speed and SEO tags were not read.'],
    }
  }

  if (input.blocked) {
    const notes = [
      input.https ? 'HTTPS answered.' : 'HTTPS did not hold.',
      'The homepage declined the read, so the title, H1, and speed were not measured.',
    ]
    if (input.responseMs != null) notes.push(`The response came back in ${input.responseMs} ms.`)
    return {
      value: input.https ? 5 : 3,
      band: input.https ? PRESENCE_BANDS[5] : PRESENCE_BANDS[3],
      limited: true,
      notes,
    }
  }

  let score = 10
  const notes: string[] = []
  let limited = false

  if (input.https) notes.push('HTTPS is on.')
  else {
    score -= 2
    notes.push('The public page is not on HTTPS.')
  }

  if (!input.title) {
    score -= 1.5
    notes.push('No title tag.')
  } else if (input.title.length < 10 || input.title.length > 70) {
    score -= 0.5
    notes.push(`Title: ${clip(input.title)}`)
  } else notes.push(`Title: ${clip(input.title)}`)

  if (!input.description) {
    score -= 1.5
    notes.push('No meta description.')
  } else if (input.description.length < 50 || input.description.length > 180) {
    score -= 0.5
    notes.push('Meta description is present, and the length is off a typical result.')
  } else notes.push('Meta description is present.')

  if (input.h1Count === 1) notes.push('One H1.')
  else if (input.h1Count === 0) {
    score -= 1.5
    notes.push('No H1.')
  } else {
    score -= 0.5
    notes.push(`${input.h1Count} H1s.`)
  }

  if (input.viewport) notes.push('Viewport tag is present.')
  else {
    score -= 1
    notes.push('No viewport tag.')
  }

  const robots = markerNote('robots.txt', input.robots)
  notes.push(robots.note)
  score -= robots.deduct
  if (input.robots === 'unknown') limited = true

  const sitemap = markerNote('sitemap.xml', input.sitemap)
  notes.push(sitemap.note)
  score -= sitemap.deduct
  if (input.sitemap === 'unknown') limited = true

  if (input.responseMs == null) {
    notes.push('Homepage response time was not measured.')
    limited = true
  } else {
    score -= speedDeduction(input.responseMs)
    notes.push(`Homepage answered in ${input.responseMs} ms. This is response time, not a Lighthouse run.`)
  }

  if (input.htmlBytes != null && input.htmlBytes >= 180_000) {
    score -= 1
    notes.push('The homepage HTML was larger than this review reads in one pass.')
  } else if (input.htmlBytes != null && input.htmlBytes > 120_000) {
    score -= 0.5
    notes.push('The homepage HTML is on the heavy side.')
  }

  const value = toHalf(score)
  return { value, band: bandLabel(value, PRESENCE_BANDS), limited, notes }
}

export function extractDocumentSeo(html: string): {
  title: string | null
  description: string | null
  h1Count: number
  viewport: boolean
} {
  const title = decodeEntities(html.match(/<title[^>]*>([^<]{0,200})/i)?.[1] || '').replace(/\s+/g, ' ').trim() || null
  const description = decodeEntities(metaContent(html, 'description') || '').replace(/\s+/g, ' ').trim() || null
  const h1Count = (html.match(/<h1\b/gi) || []).length
  const viewport = Boolean(metaContent(html, 'viewport'))
  return {
    title: title || null,
    description: description || null,
    h1Count,
    viewport,
  }
}

function hygieneDeduction(finding: { id: string; severity: Severity; title: string }): number {
  switch (finding.id) {
    case 'sensitive-files':
      return 3
    case 'version':
      return finding.severity === 'high' ? 2 : finding.severity === 'warn' ? 1 : 0
    case 'readme':
    case 'xmlrpc':
    case 'wp-json-users':
      return 1
    case 'author-html':
    case 'wp-login':
      return 0.5
    case 'http-only':
      return 1.5
    case 'https-downgrade':
      return 1
    case 'security-headers':
      if (finding.severity === 'warn') return 1.5
      if (finding.severity === 'info' && finding.title.startsWith('Some')) return 0.5
      return 0
    default:
      return 0
  }
}

function markerNote(
  name: string,
  state: 'present' | 'absent' | 'unknown',
): { note: string; deduct: number } {
  if (state === 'present') return { note: `${name} is present.`, deduct: 0 }
  if (state === 'absent') return { note: `No ${name}.`, deduct: 0.5 }
  return { note: `${name} was not confirmed in this pass.`, deduct: 0 }
}

function speedDeduction(ms: number): number {
  if (ms < 600) return 0
  if (ms < 1200) return 0.5
  if (ms < 2000) return 1
  if (ms < 3500) return 2
  return 3
}

function toHalf(value: number): number {
  const clamped = Math.min(10, Math.max(1, value))
  return Math.round(clamped * 2) / 2
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (match, digits) => codePoint(Number(digits), match))
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => codePoint(Number.parseInt(hex, 16), match))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

function codePoint(code: number, fallback: string): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return fallback
  return String.fromCodePoint(code)
}

function clip(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value
}

function metaContent(html: string, name: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) || []
  for (const tag of tags) {
    if (!new RegExp(`\\b(?:name|property)=["']${name}["']`, 'i').test(tag)) continue
    const content = tag.match(/\bcontent=["']([^"']*)["']/i)?.[1]
    if (content) return content
  }
  return null
}
