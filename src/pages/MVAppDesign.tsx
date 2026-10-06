import { SiteLayout } from "@/components/site/SiteLayout";
import { CTASection } from "@/components/site/CTASection";
import { SEO } from "@/components/SEO";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Globe, Search, FileText, Wrench, Link2, CalendarCheck, CircleHelp, RefreshCw, Building2 } from "lucide-react";

const commonProblems = [
  { icon: RefreshCw, text: "A website that's out of date or hard to update" },
  { icon: Search, text: "A site no one has looked under the hood of in years" },
  { icon: FileText, text: "Scheduling and job tracking spread across spreadsheets, texts, and paper" },
  { icon: Wrench, text: "Tools that worked when the business was smaller and no longer fit" },
  { icon: Link2, text: "Systems that don't talk to each other, so information gets entered twice" },
  { icon: CalendarCheck, text: "No easy way for customers to book, request, or check status online" },
  { icon: Globe, text: "A website that's hard for customers to find" },
  { icon: CircleHelp, text: "Not sure what's worth building, or whether to build anything at all" },
];

const included = [
  "Website design and development",
  "Rebuilds of older or outdated websites",
  "Custom software and web applications",
  "Apps for your team or your customers",
  "Customer portals, booking, and request forms",
  "Scheduling, job management, and internal workflow tools",
  "Integration with the tools you already use",
  "Setup, deployment, and staff training",
  "Plain-English documentation for your team",
  "Ongoing updates, support, and maintenance",
];

const idealFor = [
  "Contractors, trades, and service companies",
  "Inns, restaurants, and hospitality businesses",
  "Property managers and professional offices",
  "Any island business with an aging website or a workflow that's outgrown spreadsheets",
];

const whyUs = [
  {
    title: "One call for your site and your tech",
    body: "Your website, software, and IT support come from one place, so there's one number to call.",
  },
  {
    title: "Plain English, no pressure",
    body: "Most projects begin with a conversation. We help you figure out what's worth building, with no technical jargon, just a practical plan.",
  },
  {
    title: "We stay involved after launch",
    body: "Websites and software need care over time. We handle updates and improvements so you're never left managing it on your own.",
  },
];

const integrations = [
  "Scheduling tools",
  "Email and calendars",
  "Text notifications",
  "Internal records",
  "Cloud storage",
  "Phones and tablets",
];

const MVAppDesign = () => (
  <SiteLayout>
    <SEO
      title="Website & Software Design and Development | Martha's Vineyard"
      description="Websites and custom software for Martha's Vineyard businesses. Site design and rebuilds, customer portals, scheduling, and workflow tools."
      canonical="https://anythingitechmv.com/services/mv-app-design"
    />

    {/* Hero */}
    <section className="relative pt-32 pb-16 md:pt-40 md:pb-20 overflow-hidden">
      <div className="absolute inset-0 grid-overlay opacity-60 pointer-events-none" />
      <div className="container-editorial relative">
        <p className="eyebrow mb-6">Website & Software Design and Development</p>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
          <h1 className="lg:col-span-8 display-xl text-balance animate-fade-up">
            Websites and software built around how your business actually runs.
          </h1>
          <p className="lg:col-span-4 text-base text-muted-foreground leading-relaxed animate-fade-up-delay-1">
            Site design, rebuilds, custom software, and apps for Martha's Vineyard businesses.
          </p>
        </div>
      </div>
    </section>

    {/* Intro */}
    <section className="py-24 md:py-32">
      <div className="container-editorial">
        <div className="max-w-3xl mx-auto space-y-6 text-[17px] leading-relaxed text-pretty">
          <p className="text-muted-foreground">
            We design and build websites and practical software for Martha's Vineyard businesses, from a
            site your customers can find and trust to the tools your team uses every day.
          </p>
          <p className="text-muted-foreground">
            Websites and custom software are the core of the work. An app for your team or your customers
            is part of that, when it fits how you operate.
          </p>
          <p className="font-medium">
            Plain-English planning, and we stay involved after launch.
          </p>
        </div>
      </div>
    </section>

    {/* Common problems */}
    <section className="py-24 md:py-32 bg-surface border-y border-border">
      <div className="container-editorial">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <p className="eyebrow mb-5">Common problems</p>
            <h2 className="display-md text-balance">The situations that usually start the conversation.</h2>
            <p className="mt-5 text-muted-foreground leading-relaxed">
              A website, a workflow, or both. These are the problems we talk through first.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border rounded-xl overflow-hidden">
              {commonProblems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.text} className="bg-card p-6 flex items-start gap-4">
                    <div className="mt-0.5 h-8 w-8 rounded-lg bg-accent/10 grid place-items-center shrink-0">
                      <Icon className="h-4 w-4 text-accent" strokeWidth={2} />
                    </div>
                    <p className="text-[15px] leading-relaxed">{item.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* What's included */}
    <section className="py-24 md:py-32">
      <div className="container-editorial grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5 lg:sticky lg:top-28 self-start">
          <p className="eyebrow mb-5">What's included</p>
          <h2 className="display-md text-balance">From the website to the tools your team uses.</h2>
          <p className="mt-5 text-muted-foreground leading-relaxed">
            The work can be a new site, a rebuild, a custom tool, or some combination. We figure that
            out with you before anything gets built.
          </p>
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          <p className="font-medium mb-6">Included:</p>
          <ul className="space-y-4">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-4 text-[15px] leading-relaxed">
                <div className="mt-1 h-5 w-5 rounded-full bg-accent/10 grid place-items-center shrink-0">
                  <Check className="h-3 w-3 text-accent" strokeWidth={3} />
                </div>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-muted-foreground text-[15px] leading-relaxed border-l-2 border-accent pl-5">
            You're never left managing it on your own.
          </p>
        </div>
      </div>
    </section>

    {/* Ideal for + why us */}
    <section className="py-24 md:py-32 bg-surface border-y border-border">
      <div className="container-editorial">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <p className="eyebrow mb-5">Ideal for</p>
            <h2 className="display-md text-balance mb-8">Island businesses that have outgrown the old setup.</h2>
            <p className="text-muted-foreground leading-relaxed mb-8">
              If the website is aging, or the day-to-day work lives in spreadsheets and texts, this is
              the kind of help we offer.
            </p>
            <ul className="space-y-4">
              {idealFor.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] leading-relaxed">
                  <Building2 className="h-4 w-4 text-accent mt-1 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="eyebrow mb-5">Why us</p>
            <h2 className="display-md text-balance mb-8">One place to call about the work.</h2>
            <div className="space-y-8">
              {whyUs.map((item) => (
                <div key={item.title}>
                  <p className="font-medium mb-2">{item.title}</p>
                  <p className="text-muted-foreground leading-relaxed text-[15px]">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* Integrations */}
    <section className="py-24 md:py-32">
      <div className="container-editorial">
        <div className="max-w-2xl mb-14">
          <p className="eyebrow mb-5">Connected to your existing technology</p>
          <h2 className="display-md text-balance">Works with what you already use.</h2>
          <p className="mt-5 text-muted-foreground leading-relaxed">
            A website or a piece of software can connect to the tools you already use.
            We focus on reliability and simplicity.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {integrations.map((item) => (
            <span key={item} className="px-4 py-2 bg-secondary rounded-full text-sm">
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>

    {/* One place to call */}
    <section className="py-24 md:py-32 bg-surface border-y border-border">
      <div className="container-editorial">
        <div className="max-w-3xl mx-auto">
          <p className="eyebrow mb-5 text-center">One call for your site and your tech</p>
          <h2 className="display-md text-balance text-center mb-8">
            One place. One number to call.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-center mb-8">
            Your website, software, and IT support come from one place, so there's one number to call.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            {[
              "Your website",
              "Your software",
              "IT support",
              "Staff training",
              "Updates after launch",
            ].map((item) => (
              <div key={item} className="p-4 bg-card rounded-xl">
                <p className="text-sm">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/services/business-it">Business IT Support <ArrowRight className="h-4 w-4" /></Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/services/wifi-network">Wi-Fi Network Services <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </div>
    </section>

    {/* Getting Started */}
    <section className="py-24 md:py-32">
      <div className="container-editorial">
        <div className="max-w-2xl mx-auto text-center">
          <p className="eyebrow mb-5">Plain English, no pressure</p>
          <h2 className="display-md text-balance mb-6">Most projects begin with a conversation.</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            We help you figure out what's worth building:
          </p>
          <ul className="space-y-2 text-muted-foreground mb-8">
            <li>Whether a new website makes sense</li>
            <li>Whether a custom tool is worth building, or not</li>
            <li>What the site or software should do</li>
            <li>What ongoing support will look like</li>
          </ul>
          <p className="font-medium">
            No technical jargon, just a practical plan.
          </p>
        </div>
      </div>
    </section>

    {/* CTA */}
    <CTASection
      title="Thinking about a new website or custom tool?"
      description="Call (508) 560-3510 or request a visit online. Service by appointment."
      buttonText="Request a Visit"
      buttonLink="/contact"
    />
  </SiteLayout>
);

export default MVAppDesign;
