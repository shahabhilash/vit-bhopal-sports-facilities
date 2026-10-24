import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarPlus, Clock, Dumbbell, LogIn, MessageSquareText, QrCode, Sofa, TimerOff } from "lucide-react";
import { FacilityCard } from "@/components/facility-card";
import { buttonVariants } from "@/components/ui/button";
import { BOOKABLE, FACILITIES } from "@/lib/catalog";
import { cn } from "@/lib/utils";

const STEPS = [
  { icon: LogIn, title: "Sign in", body: "Use your @vitbhopal.ac.in email. We send you a 6-digit code; there is no password." },
  { icon: CalendarPlus, title: "Pick a slot", body: "Choose the sport, court, day and one-hour slot, and how many people are playing." },
  { icon: QrCode, title: "Show your pass", body: "At the facility, the guard scans your booking pass to check you in." },
  { icon: MessageSquareText, title: "Check out", body: "Tap check out when you finish, and report anything broken." },
];

const RULES = [
  { icon: Clock, text: "Twelve one-hour slots a day, 8:30 AM to 8:30 PM (IST)." },
  { icon: CalendarPlus, text: "Pickleball and tennis: book up to 7 days ahead. One booking per sport per day." },
  { icon: CalendarPlus, text: "Turf: each Saturday-to-Friday week opens at 12:00 PM on the Friday before." },
  { icon: TimerOff, text: "Not checked in 15 minutes after the start? The slot is released to others." },
];

export default function Home() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-foreground">
        <Image
          src="/images/hero.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover opacity-55"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-foreground/80 via-foreground/40 to-transparent" />
        <div className="container py-8 sm:py-16 md:py-20">
          <h1 className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
            VIT Bhopal <span className="text-brand-soft">Sports Facilities</span>
          </h1>
          <p className="mt-3 max-w-xl text-base text-white/85 sm:text-lg">
            Book pickleball courts, tennis courts and the turf with your college email.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="#facilities" className={cn(buttonVariants({ size: "lg" }), "bg-white text-foreground hover:bg-white/90")}>
              Choose a facility
              <ArrowRight aria-hidden />
            </Link>
            <Link
              href="#how-it-works"
              className="inline-flex h-11 items-center text-sm font-semibold text-white underline underline-offset-4 hover:text-white/85"
            >
              How booking works
            </Link>
          </div>
        </div>
      </section>

      <section id="facilities" aria-labelledby="facilities-title" className="container scroll-mt-20 py-8 sm:py-12">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 id="facilities-title" className="text-xl font-bold tracking-tight sm:text-2xl">
              Book a facility
            </h2>
            <p className="mt-1 text-muted-foreground">Slots are one hour. You can see open times after choosing.</p>
          </div>
          <Link href="/access" className="hidden shrink-0 text-sm font-semibold text-primary underline-offset-4 hover:underline sm:inline">
            Rules and photos
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BOOKABLE.map((code, i) => (
            <FacilityCard key={code} code={code} priority={i === 0} />
          ))}
        </div>

        <h3 className="mb-3 mt-8 text-base font-semibold">Also on campus</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["gym", Dumbbell],
            ["recreation", Sofa],
          ] as const).map(([code, Icon]) => (
            <Link
              key={code}
              href="/access"
              className="flex items-center gap-4 rounded-xl border bg-surface p-4 shadow-card transition-colors hover:bg-accent"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">{FACILITIES[code].rule.name}</span>
                <span className="block text-sm text-muted-foreground">{FACILITIES[code].summary}</span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20 border-y bg-surface">
        <div className="container grid gap-10 py-10 sm:py-14 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 id="how-title" className="text-xl font-bold tracking-tight sm:text-2xl">
              How booking works
            </h2>
            <ol className="mt-6 grid gap-5 sm:grid-cols-2">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold">{step.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-xl bg-background p-5">
            <h3 className="font-semibold">Booking rules</h3>
            <ul className="mt-4 space-y-3">
              {RULES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex gap-3 text-sm">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
