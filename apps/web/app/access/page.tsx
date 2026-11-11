import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Dumbbell, Sofa } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BOOKABLE, FACILITIES, participantRange } from "@/lib/catalog";

export const metadata: Metadata = { title: "Facility info" };

// Gym locations as previously published on this page. The booking prototype
// listed "Block 1 Gym" and "Block 2 Gym" instead; confirm with FR Sports.
const GYMS = ["BH-1 Gym", "BH-2 Gym", "Girls Hostel Gym"];

const GALLERY_TABS = [...BOOKABLE, "gym"] as const;

export default function AccessPage() {
  return (
    <div className="container max-w-5xl py-6 sm:py-10">
      <PageHeader title="Facility info" description="Rules, equipment and photos for every sports facility on campus." />

      <section aria-labelledby="bookable-title">
        <h2 id="bookable-title" className="sr-only">
          Bookable facilities
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {BOOKABLE.map((code) => {
            const f = FACILITIES[code];
            const { min, max } = participantRange(code);
            return (
              <Card key={code} className="flex flex-col">
                <CardHeader>
                  <CardTitle>{f.rule.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {f.rule.resources.join(" · ")} · {min}–{max} players
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4 text-sm">
                  <div>
                    <h3 className="font-semibold">Rules</h3>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5">
                      {f.rules.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold">Equipment</h3>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5">
                      {f.equipment.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                  <Link href={`/book?sport=${code}`} className={buttonVariants({ variant: "outline", className: "mt-auto" })}>
                    Book {f.rule.name.toLowerCase()}
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="other-title" className="mt-10">
        <h2 id="other-title" className="text-xl font-bold tracking-tight">
          Gyms and recreation rooms
        </h2>
        <p className="mt-1 text-muted-foreground">These are not booked through this site.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-primary">
                <Dumbbell className="h-5 w-5" aria-hidden />
              </span>
              <CardTitle>Gyms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{GYMS.join(" · ")}</p>
              <p className="text-muted-foreground">
                Access needs a time-limited entitlement from the sports office. Contact{" "}
                <a className="font-semibold text-primary underline-offset-4 hover:underline" href="mailto:fr.sports@vitbhopal.ac.in">
                  fr.sports@vitbhopal.ac.in
                </a>
                .
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {FACILITIES.gym.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-primary">
                <Sofa className="h-5 w-5" aria-hidden />
              </span>
              <CardTitle>Recreation rooms</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p>Blocks 1 to 8 each have a recreation room. Walk in; no booking needed.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="photos-title" className="mt-10">
        <h2 id="photos-title" className="text-xl font-bold tracking-tight">
          Photos
        </h2>
        <Tabs defaultValue={GALLERY_TABS[0]} className="mt-4">
          <TabsList aria-label="Facility photos" className="sm:w-fit">
            {GALLERY_TABS.map((code) => (
              <TabsTrigger key={code} value={code}>
                {FACILITIES[code].rule.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {GALLERY_TABS.map((code) => (
            <TabsContent key={code} value={code}>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
                {FACILITIES[code].gallery.map((src, i) => (
                  <div
                    key={src}
                    className={i === 0 ? "relative col-span-2 row-span-2 aspect-[4/3] overflow-hidden rounded-lg bg-surface-sunken" : "relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-sunken"}
                  >
                    <Image
                      src={src}
                      alt={`${FACILITIES[code].rule.name} photo ${i + 1}`}
                      fill
                      sizes={i === 0 ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 50vw, 25vw"}
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </div>
  );
}
