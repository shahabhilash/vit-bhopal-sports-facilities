import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import type { BookableCode } from "@/lib/catalog";
import { FACILITIES, participantRange } from "@/lib/catalog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { TurfReleaseInfo } from "@/components/turf-release-info";
import { cn } from "@/lib/utils";

export function FacilityCard({ code, priority = false }: { code: BookableCode; priority?: boolean }) {
  const f = FACILITIES[code];
  const { min, max } = participantRange(code);
  const resources = f.rule.resources;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="relative aspect-[2/1] bg-surface-sunken sm:aspect-[16/9]">
        <Image
          src={f.image}
          alt={f.imageAlt}
          fill
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold">{f.rule.name}</h3>
          <Badge tone="brand">{resources.length === 1 ? resources[0] : `${resources.length} courts`}</Badge>
        </div>
        <p className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-primary" aria-hidden />
          {min}–{max} players per booking
        </p>
        {code === "turf" ? (
          <TurfReleaseInfo />
        ) : (
          <p className="text-sm text-muted-foreground">Book up to 7 days ahead, 8:30 AM – 8:30 PM.</p>
        )}
        <Link
          href={`/book?sport=${code}`}
          className={cn(buttonVariants({ size: "lg" }), "mt-auto w-full")}
        >
          Book {f.rule.name.toLowerCase()}
          <ArrowRight aria-hidden />
        </Link>
      </div>
    </article>
  );
}
