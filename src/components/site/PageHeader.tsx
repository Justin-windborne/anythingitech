import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface PageHeaderProps {
  eyebrow: ReactNode;
  title: string;
  description: string;
  image?: string;
  /** Replaces the default visit and services links. Omit to keep them. */
  actions?: ReactNode;
  id?: string;
}

export const PageHeader = ({ eyebrow, title, description, image, actions, id }: PageHeaderProps) => {
  return (
    <section id={id} className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden border-b border-border">
      <div className="absolute inset-0 grid-overlay opacity-60 pointer-events-none" />
      <div className="container-editorial relative">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-end">
          <div className="lg:col-span-7 animate-fade-up">
            <p className="eyebrow mb-6">{eyebrow}</p>
            <h1 className="display-xl text-balance">{title}</h1>
            <p className="mt-7 text-lg text-muted-foreground max-w-xl text-pretty leading-relaxed">
              {description}
            </p>
            {actions === undefined ? (
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild size="lg" className="rounded-full px-7">
                  <Link to="/contact">Request a Visit <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild variant="editorial" size="lg" className="rounded-full">
                  <Link to="/services">All Services</Link>
                </Button>
              </div>
            ) : (
              <div className="mt-9">{actions}</div>
            )}
          </div>
          {image && (
            <div className="lg:col-span-5 animate-fade-up-delay-2">
              <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-secondary">
                <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
