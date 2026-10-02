export default function Footer() {
  return (
    <footer className="border-t py-6 md:py-0 bg-muted/40">
      <div className="container flex flex-col items-center justify-center gap-4 md:h-16 md:flex-row px-4 max-w-7xl mx-auto">
        <p className="text-center text-sm text-muted-foreground">
          Contact: <a href="mailto:fr.sports@vitbhopal.ac.in" className="hover:text-primary transition-colors hover:underline">fr.sports@vitbhopal.ac.in</a>
        </p>
      </div>
    </footer>
  );
}
