import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Footer from "@/components/footer";
import { GuardOnlyRedirect } from "@/components/guard-only";
import { BottomNav, SiteHeader } from "@/components/site-nav";
import { Toaster } from "@/components/ui/toaster";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "VIT Bhopal Sports Facilities", template: "%s · VIT Bhopal Sports" },
  description: "Book pickleball, tennis and turf slots at VIT Bhopal.",
};

export const viewport: Viewport = {
  themeColor: "#F7F5EE",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className={`${jakarta.className} antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:font-semibold focus:shadow-overlay"
        >
          Skip to content
        </a>
        <div className="flex min-h-dvh flex-col">
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
        </div>
        <BottomNav />
        <GuardOnlyRedirect />
        <Toaster />
      </body>
    </html>
  );
}
