import { describe, expect, it } from "vitest";
import {
  HYGIENE_SCALE as SERVER_HYGIENE_SCALE,
  PRESENCE_SCALE as SERVER_PRESENCE_SCALE,
  REVIEW_DISCLAIMER as SERVER_DISCLAIMER,
  formatScore as serverFormatScore,
} from "../../../../api/_lib/wordpress-review-scores";
import {
  HYGIENE_SCALE,
  PRESENCE_SCALE,
  REVIEW_DISCLAIMER,
  buildInquiryMessage,
  formatScore,
} from "../wordpress-review-display";

describe("review display copy", () => {
  it("matches the server score scales", () => {
    expect(HYGIENE_SCALE).toBe(SERVER_HYGIENE_SCALE);
    expect(PRESENCE_SCALE).toBe(SERVER_PRESENCE_SCALE);
    expect(REVIEW_DISCLAIMER).toBe(SERVER_DISCLAIMER);
    for (const value of [10, 7.5, 5, 1]) {
      expect(formatScore(value)).toBe(serverFormatScore(value));
    }
  });
});

describe("buildInquiryMessage", () => {
  it("includes the domain and both scores inside the contact limits", () => {
    const message = buildInquiryMessage({
      domain: "harbor.example",
      hygiene: { value: 7, band: "Steady" },
      presence: { value: 8.5, band: "Strong / Sharp" },
    });
    expect(message).toContain("harbor.example");
    expect(message).toContain("7, Steady");
    expect(message).toContain("8.5, Strong / Sharp");
    expect(message.length).toBeGreaterThanOrEqual(15);
    expect(message.length).toBeLessThanOrEqual(5000);
    expect(message.match(/https?:\/\//gi) ?? []).toHaveLength(0);
    expect(message.toLowerCase()).not.toContain("seo services");
  });

  it("strips extra URLs and the blocked phrase if a score label carries them", () => {
    const message = buildInquiryMessage({
      domain: "https://evil.example/one https://evil.example/two",
      hygiene: { value: 4, band: "seo services" },
      presence: { value: 3, band: "https://elsewhere.example/path" },
    });
    expect(message.match(/https?:\/\//gi) ?? []).toHaveLength(0);
    expect(message.toLowerCase()).not.toContain("seo services");
    expect(message.length).toBeGreaterThanOrEqual(15);
    expect(message.length).toBeLessThanOrEqual(5000);
  });
});
