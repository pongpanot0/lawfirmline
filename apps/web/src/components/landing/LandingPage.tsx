'use client';

import Link from 'next/link';
import {
  PhoneOff,
  FolderOpen,
  CalendarX,
  UserX,
  MessageCircle,
  Briefcase,
  Calendar,
  Users,
  Bell,
  Check,
  ArrowRight,
  Scale,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useLocale } from './LocaleProvider';
import { LandingNavbar } from './LandingNavbar';
import { PricingSection } from './PricingSection';

const problemIcons = [PhoneOff, FolderOpen, CalendarX, UserX, MessageCircle];
const featureIcons = [Briefcase, Calendar, Users, Bell];

export function LandingPage() {
  const { t } = useLocale();

  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl sm:-right-32 sm:-top-32 sm:h-96 sm:w-96" />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl sm:-bottom-32 sm:-left-32 sm:h-96 sm:w-96" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary sm:mb-6 sm:px-4 sm:text-sm">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-40" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="truncate">{t.hero.badge}</span>
            </div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
              {t.hero.title}
              <span className="mt-2 block text-primary">{t.hero.titleHighlight}</span>
            </h1>
            <p className="mt-4 text-base text-muted-foreground sm:mt-6 sm:text-lg md:text-xl">
              {t.hero.subtitle}
            </p>
            <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:mt-10 sm:flex-row sm:items-center sm:gap-4">
              <Link
                href="/login"
                className={cn(buttonVariants({ size: 'lg' }), 'h-11 w-full sm:h-12 sm:w-auto sm:px-8')}
              >
                {t.hero.ctaPrimary}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#trial"
                className={cn(
                  buttonVariants({ variant: 'outline', size: 'lg' }),
                  'h-11 w-full sm:h-12 sm:w-auto sm:px-8',
                )}
              >
                {t.hero.ctaSecondary}
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground sm:text-sm">{t.hero.note}</p>
          </div>
        </div>
      </section>

      {/* Problems */}
      <section className="border-y border-border bg-muted/40 py-12 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-xl font-bold sm:text-2xl md:text-3xl">{t.problems.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:mt-3 sm:text-base">{t.problems.subtitle}</p>
          </div>
          <div className="mt-8 grid gap-3 sm:mt-12 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {t.problems.items.map((text, i) => {
              const Icon = problemIcons[i];
              return (
                <div
                  key={text}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-soft sm:gap-4 sm:p-5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive sm:h-10 sm:w-10">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <p className="pt-1 text-sm font-medium leading-relaxed sm:pt-2">{text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-12 sm:py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-xl font-bold sm:text-2xl md:text-3xl">{t.features.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground sm:mt-3 sm:text-base">{t.features.subtitle}</p>
          </div>
          <div className="mt-8 grid gap-5 sm:mt-14 sm:gap-8 md:grid-cols-2">
            {t.features.items.map((feature, i) => {
              const Icon = featureIcons[i];
              return (
                <Card key={feature.title} className="border-border/80 shadow-card transition-shadow hover:shadow-lg">
                  <CardContent className="p-5 sm:p-8">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary sm:mb-5 sm:h-12 sm:w-12">
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <h3 className="text-lg font-semibold sm:text-xl">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:mt-3">{feature.description}</p>
                    <ul className="mt-4 space-y-2 sm:mt-5">
                      {feature.highlights.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Audience */}
      <section className="bg-muted/40 py-12 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-xl font-bold sm:text-2xl md:text-3xl">{t.audience.title}</h2>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:mt-10 sm:gap-3">
            {t.audience.items.map((item) => (
              <span
                key={item}
                className="rounded-full border border-border bg-card px-4 py-2 text-xs font-medium shadow-soft sm:px-5 sm:py-2.5 sm:text-sm"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <PricingSection />

      {/* CTA */}
      <section id="trial" className="border-t border-border bg-primary py-12 text-primary-foreground sm:py-20">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <h2 className="text-xl font-bold sm:text-2xl md:text-3xl">{t.cta.title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-primary-foreground/80 sm:mt-4 sm:text-base">
            {t.cta.subtitle}
          </p>
          <div className="mt-8 flex w-full flex-col items-stretch justify-center gap-3 sm:mt-10 sm:flex-row sm:items-center sm:gap-4">
            <a
              href={`mailto:hello@lexflow.co?subject=${encodeURIComponent(t.cta.demoSubject)}`}
              className={cn(
                buttonVariants({ variant: 'secondary', size: 'lg' }),
                'h-11 w-full sm:h-12 sm:w-auto sm:px-8',
              )}
            >
              {t.cta.demo}
            </a>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'h-11 w-full border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:h-12 sm:w-auto sm:px-8',
              )}
            >
              {t.cta.tryFree}
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 sm:py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Scale className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold">LexFlow</span>
          </div>
          <p className="text-xs text-muted-foreground sm:text-sm">{t.footer}</p>
        </div>
      </footer>
    </div>
  );
}
