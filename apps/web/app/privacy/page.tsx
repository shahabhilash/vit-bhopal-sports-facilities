import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Privacy policy" };

// Keep this in step with the code: what is stored (supabase/migrations), who
// can read it (docs/ROLES.md) and how long it is kept (decision Q14).
const LAST_UPDATED = "13 November 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="container max-w-2xl py-6 sm:py-10">
      <PageHeader title="Privacy policy" description={`How the VIT Bhopal Sports Facilities portal uses your information. Last updated ${LAST_UPDATED}.`} />

      <div className="space-y-7 text-base leading-relaxed [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
        <Section title="Who runs this portal">
          <p>
            The portal is used by the VIT Bhopal sports office (FR Sports) to manage bookings for campus sports
            facilities. Questions about your information go to{" "}
            <a href="mailto:fr.sports@vitbhopal.ac.in" className="font-semibold text-primary underline underline-offset-4">
              fr.sports@vitbhopal.ac.in
            </a>
            .
          </p>
        </Section>

        <Section title="What we collect">
          <ul>
            <li>
              <strong>Your account:</strong> your @vitbhopal.ac.in email address, your name, and the registration number you
              add on the Account page. If you use Continue with Google, we receive only your name and email address from
              Google, not your Google password or other Google data.
            </li>
            <li>
              <strong>Bookings:</strong> the facility, court, date and time slot, and the registration numbers of the players
              you list.
            </li>
            <li>
              <strong>Check-in:</strong> when a guard scanned your booking pass and which guard account did it.
            </li>
            <li>
              <strong>Waiting list:</strong> the slots you are waiting for and any offers you receive.
            </li>
            <li>
              <strong>Feedback:</strong> what you write when you check out and, if you report an issue, the photo you choose
              to attach.
            </li>
          </ul>
          <p>
            We do not use advertising, tracking or analytics tools. The only cookies and browser storage the portal uses
            keep you signed in.
          </p>
        </Section>

        <Section title="Why we use it">
          <ul>
            <li>To let you book facilities, and to stop double bookings and misuse of booking limits.</li>
            <li>To let guards confirm a booking at the facility.</li>
            <li>To release slots after a no-show and offer them to the waiting list.</li>
            <li>To help the sports office fix facility problems you report.</li>
            <li>To produce usage counts (per day, facility and time slot, with no names) for planning.</li>
          </ul>
        </Section>

        <Section title="Who can see it">
          <ul>
            <li>
              <strong>You</strong> can see your own account, bookings, waiting-list places and passes.
            </li>
            <li>
              <strong>Guards</strong> see each booking&apos;s facility, time, check-in state, the booker&apos;s name, and the
              registration numbers of every listed player, when they scan a pass and in the list of bookings for the
              coming week.
            </li>
            <li>
              <strong>The sports office</strong> can see all bookings, feedback and issue photos to run the facilities.
            </li>
            <li>Other students, including the players you list, cannot see your information.</li>
          </ul>
          <p>
            The portal is hosted by service providers that store or process data on our behalf: Supabase (accounts,
            database and photo storage), Vercel (the website) and Leapcell (the booking service). We do not sell or share
            your information with anyone else.
          </p>
        </Section>

        <Section title="How long we keep it">
          <ul>
            <li>Completed bookings are deleted 10 days after checkout.</li>
            <li>Cancelled and no-show bookings are deleted 10 days after the slot ends.</li>
            <li>Closed waiting-list entries are deleted 10 days after they close.</li>
            <li>Check-in scan records are kept for 90 days for audits.</li>
            <li>Feedback and issue photos are kept so the sports office can track facility problems.</li>
            <li>Your account is kept until you ask us to delete it.</li>
          </ul>
        </Section>

        <Section title="Your choices">
          <p>
            You can update your name on the Account page. To correct your registration number, or to ask for a copy or the
            deletion of your information, email{" "}
            <a href="mailto:fr.sports@vitbhopal.ac.in" className="font-semibold text-primary underline underline-offset-4">
              fr.sports@vitbhopal.ac.in
            </a>{" "}
            from your college address.
          </p>
        </Section>

        <Section title="Security">
          <p>
            Only @vitbhopal.ac.in accounts can sign in. Booking passes contain a random code, not your personal details.
            Issue photos are stored privately and are never publicly reachable.
          </p>
        </Section>

        <Section title="Changes">
          <p>If we change how your information is used, we will update this page and its date.</p>
        </Section>
      </div>
    </div>
  );
}
