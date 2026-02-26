'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3,
  Zap,
  Brain,
  Shield,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Target,
  Clock,
} from 'lucide-react';
import { getAuthToken } from '@/lib/api';

const PLANS = [
  {
    name: 'Starter',
    price: '$149',
    period: '/mo',
    description: '1 ad account, core diagnostics',
    features: [
      'Connect 1 Meta ad account',
      'Creative fatigue detection',
      'ROAS & spend alerts',
      'AI copy variant generation',
      'Manual approve & execute',
    ],
    cta: 'Start Free Trial',
    highlight: false,
  },
  {
    name: 'Growth',
    price: '$299',
    period: '/mo',
    description: '3 ad accounts, full autopilot',
    features: [
      'Connect up to 3 ad accounts',
      'All 8 diagnosis rules',
      'Auto budget optimization',
      'Unlimited AI copy variants',
      'Priority execution queue',
      'Slack notifications',
    ],
    cta: 'Start Free Trial',
    highlight: true,
  },
  {
    name: 'Scale',
    price: '$499',
    period: '/mo',
    description: 'Unlimited accounts, white-glove',
    features: [
      'Unlimited ad accounts',
      'Custom diagnosis rules',
      'Cross-account insights',
      'API access',
      'Dedicated support',
      'Everything in Growth',
    ],
    cta: 'Contact Sales',
    highlight: false,
  },
];

const FEATURES = [
  {
    icon: Brain,
    title: 'AI Diagnosis Engine',
    description:
      '8 rules continuously monitor your ads for creative fatigue, wasted budget, ROAS decline, and scaling opportunities.',
  },
  {
    icon: Zap,
    title: 'One-Click Execution',
    description:
      'Pause underperformers, scale winners, and launch fresh copy variants — all approved by you before anything changes.',
  },
  {
    icon: Target,
    title: 'Copy Variant Generator',
    description:
      'AI generates 3 angle-based variants (benefit, pain point, urgency) from your existing ad creative in seconds.',
  },
  {
    icon: Shield,
    title: 'You Stay in Control',
    description:
      'Every action requires your approval. Review diagnoses, preview changes, then confirm. Never autopilot without consent.',
  },
];

const STEPS = [
  {
    icon: Clock,
    step: '1',
    title: 'Connect Meta Ads',
    description: 'Link your ad account via OAuth. Read-only sync fetches campaign structure and metrics.',
  },
  {
    icon: Brain,
    step: '2',
    title: 'AI Diagnoses Problems',
    description: 'Our engine analyzes each ad: creative fatigue, wasted budget, scaling opportunities, and more.',
  },
  {
    icon: CheckCircle2,
    step: '3',
    title: 'You Approve Actions',
    description: 'Review each diagnosis and recommended action. Approve, dismiss, or generate copy variants.',
  },
  {
    icon: TrendingUp,
    step: '4',
    title: 'Watch ROAS Improve',
    description: 'Approved changes execute via Meta API. Track before/after performance in your action history.',
  },
];

export default function LandingPage() {
  const router = useRouter();

  // Redirect authenticated users to the dashboard
  useEffect(() => {
    if (getAuthToken()) {
      router.replace('/dashboard');
    }
  }, [router]);

  return (
    <div className="text-[var(--foreground)]">
      {/* ── Navigation ─────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-thick glass-specular border-b border-[var(--glass-border)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-apple-blue" />
            <span className="text-lg font-bold">Growth OS</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/setup"
              className="text-sm px-4 py-2 bg-apple-blue hover:bg-apple-blue/90 text-white rounded-[var(--radius-md)] font-medium transition-all ease-spring"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────── */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--tint-blue)] text-apple-blue text-sm font-medium mb-8">
            <Zap className="h-4 w-4" />
            AI-Powered Meta Ads Management
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Your automated CMO
            <br />
            <span className="text-apple-blue">for Meta Ads</span>
          </h1>
          <p className="text-lg sm:text-xl text-[var(--foreground-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed">
            Growth OS diagnoses underperforming ads, generates fresh copy variants,
            and executes approved changes — so you can focus on strategy, not spreadsheets.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/setup"
              className="flex items-center gap-2 px-8 py-3.5 bg-apple-blue hover:bg-apple-blue/90 text-white rounded-[var(--radius-lg)] text-base font-semibold transition-all ease-spring shadow-lg shadow-apple-blue/25"
            >
              Start 14-Day Free Trial
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="#how-it-works"
              className="px-8 py-3.5 border border-[var(--glass-border)] hover:border-[var(--glass-border-hover)] rounded-[var(--radius-lg)] text-base font-medium text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-all ease-spring"
            >
              See How It Works
            </Link>
          </div>
          <p className="mt-4 text-xs text-[var(--foreground-secondary)]/60">
            No credit card required. Cancel anytime.
          </p>
        </div>
      </section>

      {/* ── Pain Section ───────────────────────────── */}
      <section className="py-20 px-6 border-t border-[var(--glass-border)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            Managing Meta Ads is a full-time job
          </h2>
          <p className="text-[var(--foreground-secondary)] text-center max-w-2xl mx-auto mb-16 text-lg">
            DTC brands waste hours each week manually checking ad performance,
            diagnosing creative fatigue, and tweaking budgets. Growth OS automates the
            time-consuming parts while keeping you in control.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { stat: '68%', label: 'of ad spend is wasted on fatigued creatives that should have been paused days ago' },
              { stat: '12h/wk', label: 'average time growth teams spend manually reviewing ad performance and making changes' },
              { stat: '3.2x', label: 'average ROAS improvement when underperformers are caught within 24 hours' },
            ].map((item, i) => (
              <div key={i} className="card glass-interactive p-8 text-center">
                <div className="text-4xl font-bold text-apple-blue mb-3">{item.stat}</div>
                <p className="text-sm text-[var(--foreground-secondary)] leading-relaxed">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────── */}
      <section className="py-20 px-6 border-t border-[var(--glass-border)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            Everything you need to optimize Meta Ads
          </h2>
          <p className="text-[var(--foreground-secondary)] text-center max-w-2xl mx-auto mb-16 text-lg">
            From diagnosis to execution, Growth OS handles the entire optimization loop.
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="card glass-interactive p-8">
                  <div className="w-12 h-12 rounded-[var(--radius-md)] bg-[var(--tint-blue)] flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-apple-blue" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-[var(--foreground-secondary)] leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── How It Works ───────────────────────────── */}
      <section id="how-it-works" className="py-20 px-6 border-t border-[var(--glass-border)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            How it works
          </h2>
          <p className="text-[var(--foreground-secondary)] text-center max-w-2xl mx-auto mb-16 text-lg">
            Go from connected to optimized in under 5 minutes.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.step} className="relative">
                  <div className="card p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-apple-blue/20 text-apple-blue flex items-center justify-center text-sm font-bold">
                        {step.step}
                      </div>
                      <Icon className="h-5 w-5 text-[var(--foreground-secondary)]" />
                    </div>
                    <h3 className="text-base font-semibold mb-2">{step.title}</h3>
                    <p className="text-sm text-[var(--foreground-secondary)] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Pricing ────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-[var(--glass-border)]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            Simple, transparent pricing
          </h2>
          <p className="text-[var(--foreground-secondary)] text-center max-w-2xl mx-auto mb-16 text-lg">
            Start with a 14-day free trial. No credit card required.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`card p-8 flex flex-col ${
                  plan.highlight
                    ? 'border-apple-blue/50 ring-1 ring-apple-blue/30'
                    : ''
                }`}
              >
                {plan.highlight && (
                  <div className="text-xs font-medium text-apple-blue bg-[var(--tint-blue)] px-3 py-1 rounded-full w-fit mb-4">
                    Most Popular
                  </div>
                )}
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <p className="text-sm text-[var(--foreground-secondary)] mb-4">{plan.description}</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-[var(--foreground-secondary)] text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-apple-green mt-0.5 shrink-0" />
                      <span className="text-[var(--foreground-secondary)]">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/setup"
                  className={`block text-center py-3 rounded-[var(--radius-md)] text-sm font-semibold transition-all ease-spring ${
                    plan.highlight
                      ? 'bg-apple-blue hover:bg-apple-blue/90 text-white'
                      : 'border border-[var(--glass-border)] hover:border-[var(--glass-border-hover)] text-[var(--foreground)]'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-[var(--glass-border)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16">
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: 'Will Growth OS make changes to my ads without my approval?',
                a: 'Never. Every action — pausing an ad, changing a budget, or launching a copy variant — requires your explicit approval before execution.',
              },
              {
                q: 'What Meta Ads data do you access?',
                a: 'We read campaign structure, ad creative text/images, and performance metrics (spend, impressions, clicks, conversions). We never access your personal Facebook data.',
              },
              {
                q: 'How does the AI copy generation work?',
                a: 'When creative fatigue is detected, our AI generates 3 copy variants from different angles (benefit, pain point, urgency) based on your existing ad creative. You review and approve which variants to publish.',
              },
              {
                q: 'Can I use Growth OS with other ad platforms?',
                a: 'Growth OS also connects to Google Ads, TikTok Ads, GA4, Klaviyo, Shopify, and Stripe for a unified analytics dashboard. The autopilot diagnosis and execution currently supports Meta Ads, with Google Ads coming soon.',
              },
              {
                q: 'What happens after the 14-day trial?',
                a: 'You choose a plan that fits your needs, or continue on the Free tier with read-only analytics. No surprise charges.',
              },
            ].map((faq, i) => (
              <div key={i} className="card p-6">
                <h3 className="text-base font-semibold mb-2">{faq.q}</h3>
                <p className="text-sm text-[var(--foreground-secondary)] leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-[var(--glass-border)]">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Stop wasting ad spend on fatigued creatives
          </h2>
          <p className="text-lg text-[var(--foreground-secondary)] mb-8">
            Join ecommerce brands using Growth OS to automatically diagnose and fix Meta Ads performance issues.
          </p>
          <Link
            href="/setup"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-apple-blue hover:bg-apple-blue/90 text-white rounded-[var(--radius-lg)] text-base font-semibold transition-all ease-spring shadow-lg shadow-apple-blue/25"
          >
            Start Your Free Trial
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────── */}
      <footer className="py-8 px-6 border-t border-[var(--glass-border)]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-apple-blue" />
            <span className="text-sm font-medium">Growth OS</span>
          </div>
          <p className="text-xs text-[var(--foreground-secondary)]/50">
            Built for DTC ecommerce teams. Your data stays yours.
          </p>
        </div>
      </footer>
    </div>
  );
}
