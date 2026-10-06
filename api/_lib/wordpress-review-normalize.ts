export interface LeadFields {
  domain: string;
  name: string;
  email: string;
}

export interface LeadFieldErrors {
  domain?: string;
  name?: string;
  email?: string;
}

const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Strip protocol, path, query, and port. Force a later HTTPS fetch.
 * IP literals are rejected here so the review only accepts domain names.
 */
export function normalizeDomain(input: string): { host: string } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: 'Enter a domain, such as yoursite.com.' };
  if (trimmed.length > 300) return { error: 'That domain is too long.' };

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { error: 'Enter a public domain, such as yoursite.com.' };
  }

  if (url.username || url.password) {
    return { error: 'Enter the domain only, without a username.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'Enter a public website domain.' };
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    return { error: 'Enter the domain without a custom port.' };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return { error: 'Enter a public domain, such as yoursite.com.' };
  if (isBlockedHostname(host) || isIpLiteral(host) || !HOSTNAME.test(host)) {
    return { error: 'Enter a public domain, such as yoursite.com.' };
  }

  return { host };
}

export function leadFieldErrors(input: LeadFields): LeadFieldErrors {
  const errors: LeadFieldErrors = {};
  const domain = normalizeDomain(input.domain);
  if ('error' in domain) errors.domain = domain.error;

  const name = input.name.trim();
  if (name.length < 2 || !/\p{L}/u.test(name)) errors.name = 'Enter your name.';
  else if (name.length > 80) errors.name = 'Use a shorter name.';

  const email = input.email.trim();
  if (!email) errors.email = 'Enter an email.';
  else if (email.length > 120 || !EMAIL.test(email)) errors.email = 'Enter a valid email.';

  return errors;
}

function isBlockedHostname(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localdomain') ||
    host === 'metadata.google.internal'
  );
}

function isIpLiteral(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.includes(':')) return true;
  return false;
}
