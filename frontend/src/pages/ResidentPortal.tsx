import { motion } from "framer-motion";

import { useResidentConfig } from "../api/hooks";
import { BrandingProvider } from "../components/BrandingProvider";
import { Hero } from "../components/Hero";
import { RequestForm } from "../components/RequestForm";

export function ResidentPortal() {
  const { data, isLoading } = useResidentConfig();

  if (isLoading || !data) {
    return <div className="animate-pulse rounded-3xl bg-white/60 p-10" />;
  }

  return (
    <BrandingProvider branding={data.branding}>
      <div className="space-y-8">
        <Hero />
        <section className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Popular categories</h2>
            <div className="grid gap-4">
              {data.categories.map((category) => (
                <motion.div
                  key={category.slug}
                  layout
                  className="rounded-2xl border border-slate-200 p-4 shadow-sm"
                >
                  <h3 className="font-semibold">{category.name}</h3>
                  <p className="text-sm text-slate-500">{category.description}</p>
                  <span className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs uppercase text-slate-500">
                    {category.priority}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
          <RequestForm categories={data.categories} />
        </section>
      </div>
    </BrandingProvider>
  );
}
