/**
 * WordPress site review — public hygiene, SEO, and homepage response time.
 *
 * POST /api/tools/wordpress-site-review
 *   { domain: "example.com", company_website?: "" }
 *
 * Security: the domain is normalized to a public hostname; every request and
 * redirect is resolved and refused if it is loopback, private, or reserved
 * (SSRF guard); the whole read is time-bounded; a small in-memory per-IP
 * rate limit throttles bursts. The scan is logged on the server. It does
 * not send email. Follow-up messages go through the existing contact form.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { auditDomain, AuditInputError } from '../_lib/wordpress-review-crawl.js';
import { normalizeDomain } from '../_lib/wordpress-review-normalize.js';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_SCANS = 20;
const MAX_BODY = 20_000;

// Best-effort per-instance rate limit (resets on cold start).
const hits = new Map<string, number[]>();

function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (raw) return raw.split(',')[0]?.trim() || 'unknown';
  return req.socket?.remoteAddress || 'unknown';
}

function allowScan(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((stamp) => now - stamp < WINDOW_MS);
  if (recent.length >= MAX_SCANS) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function readPayload(req: VercelRequest): { error?: string; payload?: Record<string, unknown> } {
  const declared = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    return { error: 'That submission is too large.' };
  }

  let payload: unknown = req.body ?? {};
  if (typeof payload === 'string') {
    if (payload.length > MAX_BODY) return { error: 'That submission is too large.' };
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      return { error: 'The form could not be read.' };
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'The form could not be read.' };
  }

  return { payload: payload as Record<string, unknown> };
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const parsed = readPayload(req);
  if (parsed.error || !parsed.payload) {
    return res.status(400).json({ error: parsed.error || 'The form could not be read.' });
  }

  const payload = parsed.payload;
  if (typeof payload.company_website === 'string' && payload.company_website.trim() !== '') {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const normalized = normalizeDomain(stringField(payload.domain));
  if ('error' in normalized) {
    return res.status(400).json({ error: normalized.error });
  }

  if (!allowScan(clientIp(req))) {
    return res.status(429).json({
      error: 'This review allows a few checks at a time. Wait a few minutes and try again.',
    });
  }

  try {
    const report = await auditDomain(normalized.host);
    console.info(
      JSON.stringify({
        tag: 'wordpress-site-review',
        at: report.scannedAt,
        domain: report.domain,
        finalUrl: report.finalUrl,
        transport: report.transport,
        wordpress: report.wordpress,
        hygiene: report.hygiene.value,
        hygieneBand: report.hygiene.band,
        presence: report.presence.value,
        presenceBand: report.presence.band,
        checksRun: report.checksRun,
        findings: report.findings.map((finding) => ({
          id: finding.id,
          severity: finding.severity,
          title: finding.title,
        })),
      }),
    );
    return res.status(200).json(report);
  } catch (error) {
    if (error instanceof AuditInputError) {
      return res.status(400).json({ error: error.message });
    }
    console.error(
      '[wordpress-site-review] review failed',
      error instanceof Error ? error.name : 'unknown',
    );
    return res.status(500).json({ error: 'The review did not finish. Try again in a moment.' });
  }
}
