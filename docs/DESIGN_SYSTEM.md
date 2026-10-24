# Design system

Tokens live in `apps/web/app/globals.css` (HSL channels) and are mapped to Tailwind names in `apps/web/tailwind.config.ts`. Components live in `apps/web/components/ui`.

## Colour

| Token | Hex (approx.) | Use |
|---|---|---|
| `background` | #F7F5EE | Page background (warm cream) |
| `surface` / `card` | #FFFFFF | Cards, sheets, inputs |
| `surface-sunken` | #EEEAE0 | Wells, skeletons, unavailable slots |
| `foreground` | #2F3626 | Body text and headings (deep olive) |
| `muted-foreground` | #5E6657 | Secondary text |
| `primary` | #546F2F | Filled buttons, selected states, links |
| `brand` | #8FAA64 | **Decorative only.** Never text, never a fill under white text (2.6:1). |
| `brand-soft` | #DFE6D6 | Tinted chips and active nav pills, with `foreground` text only |
| `success` / `warning` / `destructive` / `info` (+ `-soft`) | | Status. Always paired with a text label and usually an icon. |
| `input` | #868679 | Form control borders (3:1 or better against surfaces) |

Measured contrast: foreground on background 11.5:1; muted text 5.5:1; white on primary 5.7:1; primary on background 5.2:1; every status colour on its soft tint is 4.9:1 or higher. Do not put `primary` text on `brand-soft` (4.4:1).

## Type, spacing, shape

- Font: Plus Jakarta Sans via `next/font`.
- Page title `text-2xl sm:text-3xl font-bold`. Section title `text-xl sm:text-2xl font-bold`. Card title `text-lg font-semibold`. Body `text-base`/`text-sm`.
- Radius `--radius` 0.75rem: `rounded-lg` for controls, `rounded-xl` for cards.
- Shadows: `shadow-card` (resting), `shadow-raised` (sticky bars), `shadow-overlay` (dialogs, toasts).
- Container: `container` (16px gutter, max 1200px). Reading width `max-w-prose`.

## Interaction rules

- Touch targets are at least 44px: `Button` default `h-11`, large `h-12`, icon `h-11 w-11`. `size="sm"` is for dense desktop toolbars only.
- Focus is always visible (`ring-2 ring-ring`).
- Nothing depends on hover. Every hover style has a matching visible state.
- Status is conveyed by text. Colour and icons reinforce it but never carry it alone (slot states, booking badges).
- `prefers-reduced-motion` disables animations globally.
- Destructive actions are confirmed in a `Dialog`, never `window.confirm`.
- Dialogs are bottom sheets on phones and scroll inside the viewport.
- Use a toast for short confirmations. Put errors that need action inline, next to the control, with `role="alert"`.

## Components

| Component | File |
|---|---|
| `Button`, `buttonVariants` | `ui/button.tsx` |
| `Card` family | `ui/card.tsx` |
| `Badge` (tones) | `ui/badge.tsx` |
| `Dialog` family (Radix) | `ui/dialog.tsx` |
| `Tabs` family (Radix) | `ui/tabs.tsx` |
| `Input`, `Textarea`, `Label`, `FieldHint`, `FieldError` | `ui/field.tsx` |
| `Notice`, `EmptyState`, `Skeleton`, `PageHeader` | `ui/feedback.tsx` |
| `Toaster`, `toast()` (Radix) | `ui/toaster.tsx` |
| `SiteHeader`, `BottomNav` | `site-nav.tsx` |
| `CourtPicker`, `DateStrip`, `SlotGrid` | `booking/pickers.tsx` |
| `PlayerStepper`, `RosterInput` | `booking/participants.tsx` |
| `BookingCard`, `StatusBadge` | `booking/booking-card.tsx` |
