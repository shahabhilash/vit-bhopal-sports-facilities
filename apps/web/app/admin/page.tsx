"use client";
import { BarChart3, CalendarDays, CalendarOff, MessageSquareText, Users } from "lucide-react";
import { AdminBlocks } from "@/components/admin/blocks";
import { AdminBookings } from "@/components/admin/bookings";
import { AdminFeedback } from "@/components/admin/feedback";
import { AdminOverview } from "@/components/admin/overview";
import { AdminStaff } from "@/components/admin/staff";
import { Notice, PageHeader, Skeleton } from "@/components/ui/feedback";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api";
import { useProfile } from "@/lib/bookings";
import { useSessionStatus } from "@/lib/supabase/session";

const TABS = [
  { value: "overview", label: "Overview", icon: BarChart3 },
  { value: "bookings", label: "Bookings", icon: CalendarDays },
  { value: "blocks", label: "Blocks", icon: CalendarOff },
  { value: "feedback", label: "Feedback", icon: MessageSquareText },
  { value: "staff", label: "Staff", icon: Users },
] as const;

export default function AdminPage() {
  const session = useSessionStatus();
  const profile = useProfile(session);

  if (session === "loading" || (session === "signed-in" && profile.loading)) {
    return (
      <div className="container py-6 sm:py-10">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  }

  if (session !== "signed-in" || !profile.data?.roles.includes("sports_admin")) {
    return (
      <div className="container max-w-xl py-6 sm:py-10">
        <PageHeader title="Sports office" />
        <Notice tone="warning" title="For the sports administrator only">
          {session === "unconfigured"
            ? "This environment is not connected to the booking service."
            : profile.error
              ? errorMessage(profile.error)
              : "Sign in with the sports administrator account to use this dashboard."}
        </Notice>
      </div>
    );
  }

  return (
    <div className="container py-6 sm:py-10">
      <PageHeader title="Sports office" description="Usage, facility blocks, bookings, feedback and staff access." />
      <Tabs defaultValue="overview">
        <TabsList aria-label="Dashboard sections" className="lg:w-fit">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="lg:flex-none">
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <AdminOverview />
        </TabsContent>
        <TabsContent value="bookings">
          <AdminBookings />
        </TabsContent>
        <TabsContent value="blocks">
          <AdminBlocks />
        </TabsContent>
        <TabsContent value="feedback">
          <AdminFeedback />
        </TabsContent>
        <TabsContent value="staff">
          <AdminStaff selfEmail={profile.data.email} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
