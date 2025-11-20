import { motion } from "framer-motion";

import { useBrandingStore } from "../store/branding";

export function Hero() {
  const branding = useBrandingStore((state) => state.branding);
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl bg-gradient-to-r from-primary to-secondary/80 p-10 text-white shadow-2xl"
    >
      <p className="text-sm uppercase tracking-wide text-white/80">
        {branding.town_name ?? "Your Township"}
      </p>
      <h1 className="mt-2 text-4xl font-semibold">{branding.hero_text ?? "We keep your town moving"}</h1>
      <p className="mt-4 max-w-2xl text-lg text-white/80">
        Submit service requests, track progress, and collaborate with municipal staff in real time.
      </p>
    </motion.section>
  );
}
