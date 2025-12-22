"use client";

import { useState } from "react";
import { PlanCard } from "./PlanCard";

interface PricingCardsProps {
  isAnnual: boolean;
}

const PLANS = [
  {
    name: "Free",
    price: 0,
    features: [
      "100,000 tokens/month",
      "3 projects",
      "2 API keys per project",
      "7-day data retention",
      "Optimization suggestions",
    ],
    ctaText: "Get Started Free",
    ctaHref: "/sign-up",
  },
  {
    name: "Pro",
    price: 19,
    yearlyPrice: 15,
    highlighted: true,
    features: [
      "10,000,000 tokens/month",
      "20 projects",
      "10 API keys per project",
      "90-day data retention",
      "Data export (CSV)",
      "Priority support",
    ],
    ctaText: "Upgrade to Pro",
    polar: true,
  },
  {
    name: "Enterprise",
    price: "Contact us" as const,
    features: [
      "100,000,000+ tokens/month",
      "Unlimited projects",
      "Unlimited API keys",
      "365-day data retention",
      "Guaranteed SLA",
      "Dedicated support",
      "SSO (coming soon)",
    ],
    ctaText: "Contact Sales",
    ctaHref: "mailto:enterprise@ctxopt.dev",
  },
];

export function PricingCards({ isAnnual }: PricingCardsProps) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleProCheckout = async () => {
    setLoadingPlan("Pro");
    try {
      const response = await fetch("/api/polar/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "pro",
          interval: isAnnual ? "year" : "month",
        }),
      });

      const data = await response.json();

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        console.error("No checkout URL returned");
      }
    } catch (error) {
      console.error("Checkout error:", error);
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section className="container py-8">
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-3">
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.name}
            name={plan.name}
            price={plan.price}
            yearlyPrice={"yearlyPrice" in plan ? plan.yearlyPrice : undefined}
            isAnnual={isAnnual}
            features={plan.features}
            highlighted={"highlighted" in plan ? plan.highlighted : false}
            ctaText={plan.ctaText}
            ctaHref={"ctaHref" in plan ? plan.ctaHref : undefined}
            onCtaClick={"polar" in plan && plan.polar ? handleProCheckout : undefined}
            isLoading={loadingPlan === plan.name}
          />
        ))}
      </div>
    </section>
  );
}
