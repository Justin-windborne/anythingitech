import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Same public site key as Contact.tsx. Safe to ship to the browser.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY as string | undefined;

const TOWNS = [
  "Aquinnah",
  "Chilmark",
  "Edgartown",
  "Oak Bluffs",
  "Vineyard Haven",
  "West Tisbury",
  "Other / Not sure",
] as const;

const PROJECT_TYPE = "Something else / not sure";

/**
 * The contact form from src/pages/Contact.tsx, kept on this page so a review
 * can be followed up without leaving. Field names, honeypot, timing, Turnstile
 * reset, toasts, and POST /api/contact match that page. Contact.tsx itself is
 * unchanged.
 */
export function WordPressReviewInquiry({
  message,
  onMessageChange,
  prefill,
  formLoadedAtRef,
}: {
  message: string;
  onMessageChange: (value: string) => void;
  prefill: string;
  formLoadedAtRef: React.RefObject<number>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [projectType, setProjectType] = useState(PROJECT_TYPE);
  const turnstileTokenRef = useRef<string>("");
  const turnstileWidgetRef = useRef<string>("");
  const turnstileContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;

    const SCRIPT_ID = "cf-turnstile-script";
    const renderWidget = () => {
      if (!window.turnstile || !turnstileContainerRef.current) return;
      if (turnstileWidgetRef.current) return;
      turnstileWidgetRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        size: "flexible",
        appearance: "interaction-only",
        callback: (token: string) => {
          turnstileTokenRef.current = token;
        },
        "expired-callback": () => {
          turnstileTokenRef.current = "";
        },
        "error-callback": () => {
          turnstileTokenRef.current = "";
        },
      });
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }
    if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.onload = renderWidget;
      document.head.appendChild(s);
    }
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const data: Record<string, unknown> = Object.fromEntries(formData.entries());
    data.form_loaded_at = formLoadedAtRef.current;
    data.turnstile_token = turnstileTokenRef.current;
    data.message = message;
    data.project_type = projectType;

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        toast.success("Thanks — we'll be in touch within one business day.");
        form.reset();
        setProjectType(PROJECT_TYPE);
        onMessageChange(prefill);
        turnstileTokenRef.current = "";
        if (window.turnstile && turnstileWidgetRef.current) {
          window.turnstile.reset(turnstileWidgetRef.current);
        }
      } else if (response.status === 429) {
        toast.error("You've sent a few messages recently — please wait a bit before sending another.");
      } else if (response.status === 400) {
        toast.error("Please try submitting again, or call (508) 560-3510.");
      } else {
        toast.error("Something went wrong. Please try again or call (508) 560-3510.");
      }
    } catch {
      toast.error("Something went wrong. Please try again or call (508) 560-3510.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="bg-card border border-border rounded-xl p-5 sm:p-8 md:p-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="review-name" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Full Name
          </Label>
          <Input id="review-name" name="name" required className="h-12 rounded-md bg-background" placeholder="Jane Smith" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="review-email" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Email
          </Label>
          <Input
            id="review-email"
            name="email"
            type="email"
            required
            className="h-12 rounded-md bg-background"
            placeholder="jane@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="review-phone" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Phone
          </Label>
          <Input id="review-phone" name="phone" className="h-12 rounded-md bg-background" placeholder="(508) 555 0123" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="review-town" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Town
          </Label>
          <select
            id="review-town"
            name="town"
            defaultValue=""
            className="h-12 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
          >
            <option value="">Select a town</option>
            {TOWNS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2 mt-6">
        <Label htmlFor="review-type" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Project Type
        </Label>
        <select
          id="review-type"
          name="project_type"
          value={projectType}
          onChange={(event) => setProjectType(event.target.value)}
          className="h-12 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
        >
          <option>Apple Repair & Support</option>
          <option>Wi-Fi & Network Installation</option>
          <option>Smart Home & Sonos</option>
          <option>TV, Audio & Home Tech</option>
          <option>Business IT Support</option>
          <option>3D Printing & Custom Fabrication</option>
          <option>Something else / not sure</option>
        </select>
      </div>

      <div className="space-y-2 mt-6">
        <Label htmlFor="review-message" className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Tell us about your project
        </Label>
        <Textarea
          id="review-message"
          name="message"
          rows={6}
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          className="rounded-md bg-background resize-none text-base md:text-sm"
          placeholder="A few sentences about what you'd like help with..."
        />
      </div>

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
        <label htmlFor="review-company-website">Company website (leave blank)</label>
        <input
          id="review-company-website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {TURNSTILE_SITE_KEY && <div ref={turnstileContainerRef} className="mt-6" />}

      <div className="mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">We respond within one business day.</p>
        <Button type="submit" size="lg" className="rounded-full px-7 w-full sm:w-auto" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Sending...
            </>
          ) : (
            <>
              Send Inquiry <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
