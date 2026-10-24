import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-surface-sunken", className)} {...props} />;
}

const noticeStyles = {
  info: { icon: Info, className: "border-info/25 bg-info-soft text-info" },
  success: { icon: CheckCircle2, className: "border-success/25 bg-success-soft text-success" },
  warning: { icon: AlertTriangle, className: "border-warning/25 bg-warning-soft text-warning" },
  danger: { icon: XCircle, className: "border-destructive/25 bg-destructive-soft text-destructive" },
} satisfies Record<string, { icon: LucideIcon; className: string }>;

/** Inline callout. Use role="alert" (via `live`) only for messages caused by a user action. */
export function Notice({
  tone = "info",
  title,
  children,
  live = false,
  className,
}: {
  tone?: keyof typeof noticeStyles;
  title?: string;
  children?: React.ReactNode;
  live?: boolean;
  className?: string;
}) {
  const { icon: Icon, className: toneClass } = noticeStyles[tone];
  return (
    <div role={live ? "alert" : undefined} className={cn("flex gap-3 rounded-lg border p-3.5 text-sm", toneClass, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-0.5 text-foreground">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-foreground/85">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-xl border border-dashed bg-surface px-6 py-10 text-center", className)}>
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-primary">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="max-w-prose text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
