import { Notice } from "@/components/ui/feedback";

/**
 * Shown wherever the Phase 1 browser-storage prototype is still in use, so no
 * one mistakes a local booking for a real reservation. Removed in Phase 4.
 */
export function PrototypeNotice() {
  return (
    <Notice tone="warning" title="Preview only">
      Bookings are saved on this device and do not reserve a slot yet. Online booking opens when the booking
      service goes live.
    </Notice>
  );
}
