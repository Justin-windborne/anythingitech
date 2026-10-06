import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class AuditInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditInputError';
  }
}

/** True for loopback, link-local, private, CGNAT, multicast, and reserved ranges. */
export function isPrivateIp(raw: string): boolean {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);

  const dottedMapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dottedMapped) return isPrivateIp(dottedMapped[1]);

  if (ip.startsWith('::ffff:')) {
    const rest = ip.slice('::ffff:'.length);
    const parts = rest.split(':');
    if (parts.length === 2 && parts[0] && parts[1]) {
      const hi = Number.parseInt(parts[0], 16);
      const lo = Number.parseInt(parts[1], 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
        return isPrivateIp(v4);
      }
    }
  }

  const kind = isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind === 6) return isPrivateV6(ip.split('%')[0] || ip);
  return true;
}

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map((part) => Number(part));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && (b === 168 || b === 0)) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a === 203 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateV6(ip: string): boolean {
  if (ip === '::' || ip === '::1') return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;
  return false;
}

/** Resolve a hostname and refuse anything that is not a public address. */
export function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return checkHost(host);
}

async function checkHost(host: string): Promise<void> {
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localdomain') ||
    host === 'metadata.google.internal'
  ) {
    throw new AuditInputError('Enter a public website domain.');
  }

  if (isIP(host)) {
    if (isPrivateIp(host)) throw new AuditInputError('That address is not a public website.');
    throw new AuditInputError('Enter a domain name, not an IP address.');
  }

  let records: { address: string }[];
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new AuditInputError('That domain did not resolve.');
  }

  if (records.length === 0 || records.some((record) => isPrivateIp(record.address))) {
    throw new AuditInputError('That domain does not point at a public address.');
  }
}
