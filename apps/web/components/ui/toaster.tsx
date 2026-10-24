"use client";
import { useSyncExternalStore } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Show a short, non-blocking confirmation. Errors that need action belong inline instead. */
export function toast(tone: ToastTone, title: string, description?: string) {
  items = [...items, { id: nextId++, tone, title, description }].slice(-3);
  emit();
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const EMPTY: ToastItem[] = [];

const icons = { success: CheckCircle2, error: XCircle, info: Info };
const iconColor = { success: "text-success", error: "text-destructive", info: "text-info" };

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return (
    <ToastPrimitive.Provider swipeDirection="down" duration={5000}>
      {list.map((t) => {
        const Icon = icons[t.tone];
        return (
          <ToastPrimitive.Root
            key={t.id}
            type={t.tone === "error" ? "foreground" : "background"}
            onOpenChange={(open) => !open && dismiss(t.id)}
            className="flex items-start gap-3 rounded-xl border bg-surface p-4 shadow-overlay data-[state=open]:animate-slide-up"
          >
            <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconColor[t.tone])} aria-hidden />
            <div className="flex-1">
              <ToastPrimitive.Title className="text-sm font-semibold">{t.title}</ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="mt-0.5 text-sm text-muted-foreground">
                  {t.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label="Dismiss"
              className="-m-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" aria-hidden />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.5rem)] z-[60] mx-auto flex w-full max-w-md flex-col gap-2 px-4 md:bottom-4 md:right-4 md:left-auto md:mx-0" />
    </ToastPrimitive.Provider>
  );
}
