import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-12 border-t bg-surface-sunken/60 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0">
      <div className="container flex flex-col gap-2 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Questions or problems with a booking?{" "}
          <a href="mailto:fr.sports@vitbhopal.ac.in" className="font-semibold text-primary underline-offset-4 hover:underline">
            fr.sports@vitbhopal.ac.in
          </a>
        </p>
        <Link href="/access" className="font-semibold text-foreground underline-offset-4 hover:underline md:hidden">
          Facility info and rules
        </Link>
      </div>
    </footer>
  );
}
