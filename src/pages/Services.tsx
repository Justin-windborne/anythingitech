import { SiteLayout } from "@/components/site/SiteLayout";
import { CTASection } from "@/components/site/CTASection";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight, Apple, Wifi, Home, Music, Tv, Building2, Printer, MonitorSmartphone, ShieldCheck, Globe } from "lucide-react";
import appleImg from "@/assets/apple-desk.jpg";

const all = [
  { icon: Apple, title: "Apple Repair & Support", description: "iPhone screen repair, Mac troubleshooting, system cleanup, data migration, Time Machine backup, iCloud setup.", to: "/services/apple-repair" },
  { icon: Wifi, title: "Wi-Fi & Network Installation", description: "Ubiquiti enterprise equipment, full-coverage wireless, structured cabling, server maintenance.", to: "/services/wifi-network" },
  { icon: Home, title: "Smart Home Setup", description: "Lighting, climate, locks, cameras, and smart device integration. Setup and troubleshooting.", to: "/services/smart-home" },
  { icon: Music, title: "Sonos & Whole-Home Audio", description: "Sonos installation, configuration, and troubleshooting. Whole-home audio setup.", to: "/services/smart-home" },
  { icon: Tv, title: "TV Mounting & Setup", description: "TV wall mounting, concealed wiring, soundbar setup, streaming device configuration.", to: "/services/tv-audio" },
  { icon: Building2, title: "Business IT Support", description: "Office networks, workstations, printers, server maintenance, and ongoing IT support.", to: "/services/business-it" },
  { icon: Printer, title: "Printer & Device Setup", description: "Wireless printer setup, scanner configuration, peripheral troubleshooting.", to: "/services" },
  { icon: MonitorSmartphone, title: "Home Office Setup", description: "Home office setup with reliable Wi-Fi, video conferencing, and Apple device configuration.", to: "/services" },
  { icon: ShieldCheck, title: "General IT Support", description: "On-site tech support for homes and businesses. Troubleshooting, repairs, and setup.", to: "/services" },
  { icon: Globe, title: "Website & Software Development", description: "Websites and custom software for island businesses. Site design and rebuilds, customer portals, scheduling, and workflow tools.", to: "/services/mv-app-design" },
];

const Services = () => {
  return (
    <SiteLayout>
      <SEO
        title="Services | Anything IT Tech Martha's Vineyard"
        description="iPhone and Mac repair, Wi-Fi network installation, smart home setup, TV mounting, and business IT support on Martha's Vineyard."
        canonical="https://anythingitechmv.com/services"
      />
      {/* Hero — inline replacement of the shared PageHeader so the supporting
          copy can render as two paragraphs (main body + "By appointment.").
          Layout, spacing, buttons, image, and responsive behavior mirror the
          shared PageHeader component exactly. */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden border-b border-border">
        <div className="absolute inset-0 grid-overlay opacity-60 pointer-events-none" />
        <div className="container-editorial relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end">
            <div className="lg:col-span-7 animate-fade-up">
              <p className="eyebrow mb-6">Services</p>
              <h1 className="display-xl text-balance">Technology services for Martha's Vineyard &amp; beyond.</h1>
              <p className="mt-7 text-lg text-muted-foreground max-w-xl text-pretty leading-relaxed">
                Based on Martha's Vineyard, we help homes and businesses across
                Martha's Vineyard, Cape Cod, Nantucket, and the Elizabeth Islands
                with Managed IT, enterprise networking, enterprise Wi-Fi,
                surveillance systems, Apple support, smart home technology, and
                website and software development.
              </p>
              <p className="mt-3 text-lg text-muted-foreground max-w-xl text-pretty leading-relaxed">
                By appointment.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild size="lg" className="rounded-full px-7">
                  <Link to="/contact">Request a Visit <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild variant="editorial" size="lg" className="rounded-full">
                  <Link to="/services">All Services</Link>
                </Button>
              </div>
            </div>
            <div className="lg:col-span-5 animate-fade-up-delay-2">
              <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-secondary">
                <img src={appleImg} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 md:py-32">
        <div className="container-editorial">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {all.map((s, i) => (
              <Link to={s.to} key={s.title} className="group card-service p-8 flex flex-col min-h-[260px]">
                <div className="flex items-center justify-between mb-10">
                  <div className="h-11 w-11 rounded-md bg-secondary grid place-items-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-500">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="font-display text-2xl mb-2.5">{s.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-[15px]">{s.description}</p>
                <div className="mt-auto pt-6 flex items-center gap-1.5 text-sm font-medium">
                  Learn more <ArrowUpRight className="h-4 w-4 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CTASection title="Not sure which services you need?" description="We're happy to walk through your home or business and recommend the right approach. No obligation." />
    </SiteLayout>
  );
};

export default Services;
