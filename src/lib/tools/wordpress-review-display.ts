/**
 * Client copy for the WordPress site review.
 * Score bands live with the server scorer; these strings must stay identical.
 */

export const HYGIENE_SCALE =
  "10 Fortified · 9 Hardened · 8 Solid · 7 Steady · 6 Adequate · 5 Patchy · 4 Exposed · 3 Fragile · 2 Leaky · 1 Wide open";

export const PRESENCE_SCALE =
  "10 Polished · 9 Sharp · 8 Strong · 7 Healthy · 6 Serviceable · 5 Uneven · 4 Sluggish · 3 Thin · 2 Buried · 1 Broken";

export const REVIEW_DISCLAIMER =
  "This is a public site review of hygiene, speed, and basic SEO. It is not a penetration test and it is not a security certification.";

export function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Message prefilled into the on-page inquiry.
 * Kept within the contact form's limits: 15–5000 characters, at most one URL,
 * and never the phrase the spam scorer treats as a sales pitch.
 */
export function buildInquiryMessage(input: {
  domain: string;
  hygiene: { value: number; band: string };
  presence: { value: number; band: string };
}): string {
  const domain = cleanFragment(input.domain) || "the site";
  const hygiene = cleanFragment(`${formatScore(input.hygiene.value)}, ${input.hygiene.band}`);
  const presence = cleanFragment(`${formatScore(input.presence.value)}, ${input.presence.band}`);
  let message = `I used the WordPress site review on ${domain}. Public hygiene: ${hygiene}. SEO and speed: ${presence}. Please take a look when you have a moment.`;
  message = cleanFragment(message);
  if (message.length < 15) {
    message = `${message} Please take a look when you have a moment.`.trim();
  }
  if (message.length > 5000) message = message.slice(0, 5000).trim();
  return message;
}

function cleanFragment(value: string): string {
  return value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/seo services/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
