import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileSearch, Loader2 } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { PageHeader } from "@/components/site/PageHeader";
import { CTASection } from "@/components/site/CTASection";
import { SEO } from "@/components/SEO";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuditFinding, AuditReport, ReviewScore, Severity } from "../../../api/_lib/wordpress-review-types";
import {
  HYGIENE_SCALE,
  PRESENCE_SCALE,
  REVIEW_DISCLAIMER,
  buildInquiryMessage,
  formatScore,
} from "@/lib/tools/wordpress-review-display";
import { WordPressReviewInquiry } from "./WordPressReviewInquiry";

const FAQS = [
  {
    q: "What does this review look at?",
    a: "The public homepage and a short list of well-known WordPress addresses. It reads response headers, the title, the meta description, the H1, HTTPS, the viewport tag, robots.txt, and sitemap.xml. It does not log in, guess passwords, or try to break anything.",
  },
  {
    q: "What do the two scores mean?",
    a: `Each score runs from 1 to 10, and half points are allowed. 10 is the strong end. 1 is the weak end. Public hygiene: ${HYGIENE_SCALE}. SEO and speed: ${PRESENCE_SCALE}. Speed here is how fast the homepage answered, not a full lab run.`,
  },
  {
    q: "Is this a penetration test?",
    a: `${REVIEW_DISCLAIMER} It looks only at pages and headers that are already public.`,
  },
  {
    q: "What if the site blocks the check?",
    a: "You will see that plainly, and the scores are marked as a partial picture. The review stops instead of retrying.",
  },
] as const;

const WordPressSiteReview = () => {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [message, setMessage] = useState("");
  const formLoadedAtRef = useRef<number>(Date.now());
  const reviewFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    formLoadedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!report) return;
    const el = document.getElementById("audit-results");
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [report]);

  const prefill = report ? buildInquiryMessage(report) : "";

  const onReview = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const formData = reviewFormRef.current ? new FormData(reviewFormRef.current) : new FormData();
    const companyWebsite =
      typeof formData.get("company_website") === "string" ? String(formData.get("company_website")) : "";

    setLoading(true);
    try {
      const res = await fetch("/api/tools/wordpress-site-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domain.trim(),
          company_website: companyWebsite,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<AuditReport> & {
        error?: string;
        skipped?: boolean;
      };
      if (body.skipped) {
        setReport(null);
        setNotice("Received.");
        return;
      }
      if (!res.ok || !body.ok) {
        setReport(null);
        throw new Error(body.error || "The review did not finish. Try again in a moment.");
      }
      const next = body as AuditReport;
      setReport(next);
      setMessage(buildInquiryMessage(next));
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "The review did not finish. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SiteLayout>
      <SEO
        title="WordPress Site Review | Martha's Vineyard IT"
        description="A public review of a WordPress site for Martha's Vineyard businesses. Two scores, from 10 to 1, for hygiene and for SEO and speed, plus the findings behind them."
        canonical="https://anythingitechmv.com/tech-tools/wordpress-site-review"
      />

      <PageHeader
        id="wordpress-review"
        eyebrow={
          <Link to="/tech-tools" className="hover:text-foreground transition-colors">
            Tech Tools
          </Link>
        }
        title="A public review of your WordPress site."
        description="We read what a WordPress site already shows the public: hygiene, how fast the homepage answers, and the basics a search result needs. For businesses on Martha's Vineyard. The review stays on this page."
        actions={
          <form ref={reviewFormRef} onSubmit={onReview} className="max-w-xl space-y-4" noValidate>
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-10000px",
                top: "auto",
                width: "1px",
                height: "1px",
                overflow: "hidden",
              }}
            >
              <label htmlFor="review-honeypot">Company website (leave blank)</label>
              <input id="review-honeypot" name="company_website" type="text" tabIndex={-1} autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-domain">Website domain</Label>
              <Input
                id="review-domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                type="text"
                inputMode="url"
                autoComplete="url"
                autoCapitalize="off"
                spellCheck={false}
                required
                placeholder="yoursite.com"
                className="h-12 bg-background"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "review-domain-error" : "review-domain-hint"}
              />
              <p id="review-domain-hint" className="text-xs text-muted-foreground leading-relaxed">
                A public domain only. No login, and no password guesses. {REVIEW_DISCLAIMER}
              </p>
            </div>
            {error ? (
              <p id="review-domain-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
            <Button
              type="submit"
              size="lg"
              className="rounded-full px-7 w-full sm:w-auto"
              disabled={loading || !domain.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Reading the public site…
                </>
              ) : (
                <>
                  <FileSearch className="h-4 w-4" /> Review this site
                </>
              )}
            </Button>
          </form>
        }
      />

      {report ? (
        <section id="audit-results" className="py-16 md:py-20 scroll-mt-28 border-b border-border">
          <div className="container-editorial">
            <h2 className="display-md text-balance">Public review of {report.domain}</h2>
            <p className="mt-5 max-w-3xl text-lg text-muted-foreground leading-relaxed">{report.summary}</p>
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              Both scores run from 10 to 1. 10 is strong. 1 is weak. Half points are allowed.
            </p>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <ScoreCard label="Public hygiene" score={report.hygiene} scale={HYGIENE_SCALE} />
              <ScoreCard label="SEO and speed" score={report.presence} scale={PRESENCE_SCALE} />
            </div>

            <p className="mt-6 max-w-3xl text-sm text-muted-foreground leading-relaxed">{REVIEW_DISCLAIMER}</p>

            <ul className="mt-8 space-y-4">
              {report.findings.map((finding) => (
                <li key={finding.id}>
                  <FindingCard finding={finding} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {report ? (
        <section id="review-follow-up" className="py-16 md:py-24 scroll-mt-28">
          <div className="container-editorial max-w-3xl">
            <p className="eyebrow mb-6">Follow up</p>
            <h2 className="display-md text-balance">Want us to look at this with you?</h2>
            <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
              Call (508) 560-3510 or send a message. Service by appointment. We'll respond within one
              business day.
            </p>
            <div className="mt-8">
              <WordPressReviewInquiry
                message={message}
                onMessageChange={setMessage}
                prefill={prefill}
                formLoadedAtRef={formLoadedAtRef}
              />
            </div>
          </div>
        </section>
      ) : null}

      <section className="py-16 md:py-20 border-t border-border">
        <div className="container-editorial max-w-3xl">
          <p className="eyebrow mb-6">FAQ</p>
          <h2 className="display-md text-balance">Questions about this review</h2>
          <Accordion type="single" collapsible className="mt-8">
            {FAQS.map((item) => (
              <AccordionItem key={item.q} value={item.q}>
                <AccordionTrigger className="text-left text-base">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <CTASection
        title="Need a technician on-site?"
        description="Call (508) 560-3510 or send a message on this page. Service by appointment."
        buttonText={report ? "Send a message" : "Review a site"}
        buttonLink={
          report
            ? "/tech-tools/wordpress-site-review#review-follow-up"
            : "/tech-tools/wordpress-site-review#wordpress-review"
        }
      />
    </SiteLayout>
  );
};

function ScoreCard({ label, score, scale }: { label: string; score: ReviewScore; scale: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="eyebrow">{label}</p>
        <p className="mt-4 font-display text-5xl font-light tracking-tight text-foreground">
          <span className="tabular-nums">{formatScore(score.value)}</span>
          <span className="ml-3 align-middle font-display text-2xl text-accent">{score.band}</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">10 is strong. 1 is weak.</p>
        {score.limited ? (
          <p className="mt-2 text-sm text-muted-foreground">Partial picture. This number is not a full read.</p>
        ) : null}
        {score.notes.length ? (
          <ul className="mt-4 space-y-1.5 text-sm leading-relaxed text-muted-foreground">
            {score.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{scale}</p>
      </CardContent>
    </Card>
  );
}

function FindingCard({ finding }: { finding: AuditFinding }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <SeverityBadge severity={finding.severity} />
          <h3 className="font-display text-xl font-medium tracking-tight">{finding.title}</h3>
        </div>
        <p className="mt-3 max-w-3xl text-sm sm:text-base leading-relaxed text-muted-foreground">{finding.detail}</p>
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const label = severity === "high" ? "Exposure" : severity === "warn" ? "Upkeep" : "Note";
  const variant = severity === "high" ? "destructive" : severity === "warn" ? "secondary" : "outline";
  return <Badge variant={variant}>{label}</Badge>;
}

export default WordPressSiteReview;
