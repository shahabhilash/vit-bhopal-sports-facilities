"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, CheckCircle2, Clock, Keyboard, ShieldAlert, XCircle, type LucideIcon } from "lucide-react";
import type { GuardScanDto, ScanResult } from "@vitb/shared";
import { Button } from "@/components/ui/button";
import { Notice, PageHeader, Skeleton } from "@/components/ui/feedback";
import { FieldHint, Input, Label } from "@/components/ui/field";
import { errorMessage } from "@/lib/api";
import { guardScan, useProfile } from "@/lib/bookings";
import { FACILITIES } from "@/lib/catalog";
import { formatLongDate, formatTime, slotLabel } from "@/lib/format";
import { useSessionStatus } from "@/lib/supabase/session";
import { cn } from "@/lib/utils";

const OUTCOME: Record<ScanResult, { tone: "ok" | "warn" | "bad"; icon: LucideIcon; title: (r: GuardScanDto) => string }> = {
  checked_in: { tone: "ok", icon: CheckCircle2, title: () => "Checked in. Let them in." },
  already_checked_in: {
    tone: "warn",
    icon: Clock,
    title: (r) => `Already checked in${r.checkedInAt ? ` at ${formatTime(new Date(r.checkedInAt))}` : ""}.`,
  },
  already_completed: { tone: "bad", icon: XCircle, title: () => "This session is already over." },
  too_early: {
    tone: "warn",
    icon: Clock,
    title: (r) => `Too early. Check-in opens at ${r.opensAt ? formatTime(new Date(r.opensAt)) : "10 minutes before the start"}.`,
  },
  expired: { tone: "bad", icon: XCircle, title: () => "Too late. The check-in window has closed and the slot was released." },
  wrong_day: { tone: "bad", icon: XCircle, title: (r) => `Wrong day. This booking is for ${r.booking ? formatLongDate(r.booking.date) : "another day"}.` },
  cancelled: { tone: "bad", icon: XCircle, title: () => "This booking was cancelled." },
  invalid: { tone: "bad", icon: XCircle, title: () => "Not a valid booking pass." },
};

const TONE = {
  ok: "border-success bg-success-soft text-success",
  warn: "border-warning bg-warning-soft text-warning",
  bad: "border-destructive bg-destructive-soft text-destructive",
};

function ScanOutcome({ result }: { result: GuardScanDto }) {
  const o = OUTCOME[result.result];
  const b = result.booking;
  return (
    <div className={cn("rounded-xl border-2 p-5", TONE[o.tone])}>
      <p className="flex items-start gap-3 text-xl font-bold">
        <o.icon className="mt-0.5 h-7 w-7 shrink-0" aria-hidden />
        <span>{o.title(result)}</span>
      </p>
      {b && (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-base text-foreground">
          <dt className="text-muted-foreground">Facility</dt>
          <dd className="font-semibold">
            {FACILITIES[b.facility].rule.name} · {b.resource}
          </dd>
          <dt className="text-muted-foreground">Time</dt>
          <dd className="font-semibold">{slotLabel(b.slotIndex)}</dd>
          <dt className="text-muted-foreground">Booked by</dt>
          <dd>
            {b.ownerName ?? "Name not set"}
            {b.ownerRegNo && <span className="font-mono"> · {b.ownerRegNo}</span>}
          </dd>
          <dt className="text-muted-foreground">Players</dt>
          <dd>{b.participants}</dd>
        </dl>
      )}
    </div>
  );
}

function cameraError(err: unknown): string {
  const name = (err as { name?: string }).name;
  if (name === "NotAllowedError") return "Camera access was refused. Allow the camera for this site in your browser settings, or type the code below.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device. Type the code below instead.";
  if (!window.isSecureContext) return "The camera only works over HTTPS.";
  return "The camera could not be started. Type the code below instead.";
}

export default function GuardPage() {
  const session = useSessionStatus();
  const profile = useProfile(session);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const busyRef = useRef(false);

  const [cameraOn, setCameraOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [result, setResult] = useState<GuardScanDto | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [manual, setManual] = useState("");

  const stopCamera = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const submit = useCallback(async (code: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setChecking(true);
    setRequestError(null);
    try {
      setResult(await guardScan(code));
      navigator.vibrate?.(120);
    } catch (err) {
      setResult(null);
      setRequestError(errorMessage(err));
    } finally {
      setChecking(false);
      busyRef.current = false;
    }
  }, []);

  async function startCamera() {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setCameraOn(true);
      canvasRef.current ??= document.createElement("canvas");
      let lastCode = "";
      let lastAt = 0;
      timerRef.current = setInterval(() => {
        if (busyRef.current || video.readyState < 2) return;
        const scale = Math.min(1, 640 / video.videoWidth);
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        const canvas = canvasRef.current!;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, w, h);
        const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        if (!found?.data) return;
        // Ignore the same code held in front of the camera after it was handled.
        if (found.data === lastCode && Date.now() - lastAt < 4000) return;
        lastCode = found.data;
        lastAt = Date.now();
        void submit(found.data);
      }, 250);
    } catch (err) {
      stopCamera();
      setCamError(cameraError(err));
    }
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    if (manual.trim()) void submit(manual.trim());
  }

  const roles = profile.data?.roles ?? [];
  const allowed = roles.includes("guard") || roles.includes("sports_admin");

  if (session === "loading" || (session === "signed-in" && profile.loading)) {
    return (
      <div className="container max-w-xl py-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-6 aspect-square w-full" />
      </div>
    );
  }

  if (session !== "signed-in" || !allowed) {
    return (
      <div className="container max-w-xl py-6 sm:py-10">
        <PageHeader title="Check-in scanner" />
        <Notice tone="warning" title="For facility guards only">
          {session === "unconfigured"
            ? "This environment is not connected to the booking service."
            : profile.error
              ? errorMessage(profile.error)
              : "Sign in with a guard account to use the scanner. Ask the sports office if you need access."}
        </Notice>
      </div>
    );
  }

  return (
    <div className="container max-w-xl py-4 sm:py-8">
      <PageHeader title="Check-in scanner" description="Scan the student's booking pass. One scan checks in the whole group." />

      <div aria-live="assertive" className="mb-4 space-y-3">
        {checking && <p className="text-base font-semibold">Checking…</p>}
        {result && !checking && <ScanOutcome result={result} />}
        {requestError && !checking && (
          <Notice tone="danger" title="Could not check this pass">
            {requestError}
          </Notice>
        )}
      </div>

      <div className="relative overflow-hidden rounded-xl border bg-foreground">
        <video ref={videoRef} playsInline muted className={cn("aspect-square w-full object-cover", !cameraOn && "hidden")} aria-label="Camera view" />
        {!cameraOn && (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <Camera className="h-10 w-10" aria-hidden />
            <p className="max-w-xs text-sm text-white/85">Start the camera, then hold the student&apos;s QR code inside the frame.</p>
            <Button size="lg" className="bg-white text-foreground hover:bg-white/90" onClick={startCamera}>
              Start camera
            </Button>
          </div>
        )}
        {cameraOn && <div aria-hidden className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80" />}
      </div>
      {cameraOn && (
        <Button variant="outline" size="lg" className="mt-3 w-full" onClick={stopCamera}>
          <CameraOff aria-hidden />
          Stop camera
        </Button>
      )}
      {camError && (
        <Notice tone="warning" live className="mt-3">
          {camError}
        </Notice>
      )}

      <form onSubmit={submitManual} className="mt-6 space-y-2 rounded-xl border bg-surface p-4">
        <Label htmlFor="manual-code" className="flex items-center gap-2">
          <Keyboard className="h-4 w-4" aria-hidden />
          Type or paste a pass code
        </Label>
        <Input
          id="manual-code"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="VITB1.…"
          className="font-mono text-sm"
        />
        <FieldHint>Use this if the camera cannot read the code.</FieldHint>
        <Button type="submit" size="lg" className="w-full" disabled={checking || !manual.trim()}>
          <ShieldAlert aria-hidden />
          Check pass
        </Button>
      </form>
    </div>
  );
}
