import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowUpRight, FileSearch, Network, QrCode, ShieldCheck, Video, Wrench } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { NodeLogo } from "@/components/NodeLogo";
import { SEO } from "@/components/SEO";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CTASection } from "@/components/site/CTASection";

interface Tool {
  name: string;
  tagline: string;
  description: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  status: "live" | "soon";
}

/** Registry of Tech Tools. New tools drop in here and render automatically. */
const TOOLS: Tool[] = [
  {
    name: "Node Network Navigator",
    tagline: "Network health diagnostics",
    description:
      "A one-tap browser assessment of speed, latency, jitter, packet loss, DNS, and IPv4/IPv6 — with an interpreted diagnosis that points to the layer most likely at fault and the next test to run.",
    to: "/tech-tools/network-diagnostics",
    icon: NodeLogo,
    status: "live",
  },
  {
    name: "Subnet / CIDR Calculator",
    tagline: "IPv4 subnetting",
    description:
      "Enter an IP with a CIDR prefix or mask to get the network, broadcast, usable host range, and count. Runs entirely in your browser.",
    to: "/tech-tools/subnet-calculator",
    icon: Network,
    status: "live",
  },
  {
    name: "Wi-Fi QR Code Generator",
    tagline: "Scan-to-join networks",
    description:
      "Turn a network name and password into a QR code a phone camera can scan to join — perfect for guest and client networks. Generated on-device.",
    to: "/tech-tools/wifi-qr",
    icon: QrCode,
    status: "live",
  },
  {
    name: "Latency Monitor",
    tagline: "Live ping plot",
    description:
      "A live latency and jitter plot over time — leave it running to catch the intermittent spikes and drops a one-shot speed test never sees.",
    to: "/tech-tools/latency-monitor",
    icon: Activity,
    status: "live",
  },
  {
    name: "Video Call Readiness",
    tagline: "Zoom / Teams check",
    description:
      "Checks UDP reachability and NAT type over WebRTC plus live jitter and packet loss, then gives a plain Good/Fair/Poor verdict for video calls.",
    to: "/tech-tools/video-call-readiness",
    icon: Video,
    status: "live",
  },
  {
    name: "TLS & Port Checker",
    tagline: "Cert expiry + reachability",
    description:
      "Check a domain's TLS certificate (issuer, expiry, days remaining) or whether a common service port (SMTP, IMAP, RDP, SSH…) is reachable.",
    to: "/tech-tools/service-checker",
    icon: ShieldCheck,
    status: "live",
  },
  {
    name: "WordPress Site Review",
    tagline: "Public hygiene, SEO, and speed",
    description:
      "A public read of a WordPress site: two scores from 10 to 1 for hygiene and for SEO and speed, plus the findings behind them.",
    to: "/tech-tools/wordpress-site-review",
    icon: FileSearch,
    status: "live",
  },
];

const TechTools = () => (
  <SiteLayout>
    <SEO
      title="Tech Tools | Martha's Vineyard IT"
      description="Free browser-based technology tools from Martha's Vineyard IT, starting with Node Network Navigator — network health diagnostics that explain what your results mean."
      canonical="https://anythingitechmv.com/tech-tools"
    />

    <section className="pt-32 pb-16 md:pt-40 md:pb-20 border-b border-border">
      <div className="container-editorial">
        <p className="eyebrow mb-6 inline-flex items-center gap-2">
          <Wrench className="h-4 w-4" /> Tech Tools
        </p>
        <h1 className="display-xl text-balance max-w-3xl">
          Practical tools that tell you what's actually wrong.
        </h1>
        <p className="mt-7 text-lg text-muted-foreground max-w-2xl leading-relaxed">
          Utilities we built for our own field work on Martha's Vineyard — designed to
          interpret results, not just display numbers. Free to use, right in your browser.
        </p>
      </div>
    </section>

    <section className="py-16 md:py-20">
      <div className="container-editorial">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const card = (
              <Card className="group h-full transition-colors hover:border-foreground/30">
                <CardContent className="pt-6 flex flex-col h-full">
                  <div className="flex items-center justify-between">
                    <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    {tool.status === "soon" ? (
                      <Badge variant="secondary">Coming soon</Badge>
                    ) : (
                      <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    )}
                  </div>
                  <h2 className="mt-5 text-xl font-semibold">{tool.name}</h2>
                  <p className="text-sm text-muted-foreground">{tool.tagline}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {tool.description}
                  </p>
                </CardContent>
              </Card>
            );
            return tool.status === "live" ? (
              <Link key={tool.name} to={tool.to} className="block">
                {card}
              </Link>
            ) : (
              <div key={tool.name}>{card}</div>
            );
          })}
        </div>
      </div>
    </section>

    <CTASection
      title="Need a technician on-site?"
      description="Node Network Navigator tells you where to look. When you want it fixed, call (508) 560-3510 or request a visit."
    />
  </SiteLayout>
);

export default TechTools;
