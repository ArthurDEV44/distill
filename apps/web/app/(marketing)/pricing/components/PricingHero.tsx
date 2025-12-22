"use client";

interface PricingHeroProps {
  isAnnual: boolean;
  onToggle: (annual: boolean) => void;
}

export function PricingHero({ isAnnual, onToggle }: PricingHeroProps) {
  return (
    <section className="container flex flex-col items-center gap-6 py-16 text-center">
      <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
        Simple, Transparent Pricing
      </h1>
      <p className="max-w-2xl text-xl text-muted-foreground">
        Save on LLM costs with intelligent context optimization.
        Start free, upgrade when you need more.
      </p>

      {/* Billing Toggle */}
      <div className="flex items-center gap-3 rounded-full border p-1">
        <button
          onClick={() => onToggle(false)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            !isAnnual
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => onToggle(true)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
            isAnnual
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Annual
          <span className="ml-1.5 text-xs text-green-500">Save 20%</span>
        </button>
      </div>
    </section>
  );
}
