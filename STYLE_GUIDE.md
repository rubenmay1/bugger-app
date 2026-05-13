# Bugger - Style Guide

UI conventions for the app. Source of truth lives in `src/theme/variables.scss` and `src/global.scss` - if you change a token, update this file too.

## Surface hierarchy

Material Design 3 dark elevation model. Inner surfaces must always be **lighter** than their container - never revert to black.

| Variable | Hex | Used for |
| --- | --- | --- |
| `--surface-0` | `#000000` | Main app background |
| `--surface-1` | `#1E1E1E` | List rows, day cards |
| `--surface-2` | `#2D2D2D` | Bottom panels, centered popups |
| `--surface-3` | `#3C3C3C` | Inputs, nested cards within popups |

Corner radius:
- Bottom slide-out panels: `border-radius: 28px 28px 0 0`
- Centered popups and internal cards: `border-radius: 12px`
- Inputs and small cards: `border-radius: 8px`

## Colours

Primary brand is Tailwind green-500 `#22C55E`. Accent colours sit harmoniously with this green on dark surfaces.

| Purpose | Value |
| --- | --- |
| Primary | `#22C55E` |
| Primary tint (hover/focus) | `#4ADE80` |
| Primary shade (pressed) | `#16A34A` |
| Primary contrast (text on green) | `#191919` |
| Muted / secondary text | `var(--ion-color-medium)` |
| Destructive (outline / text) | `#F2B8B5` |
| Destructive (filled fill) | `#8C1D18` |
| Destructive (text on filled) | `#F9DEDC` |
| Warning amber | `#f5b400` |
| Health green | `#22C55E` |
| Health amber | `#f5b400` |
| Health red | `#DC2626` |
| Subtle borders | `rgba(255,255,255,0.08)` - `rgba(255,255,255,0.18)` |

## Typography

Body uses **Inter**. App title uses **Barrio**. Both loaded from Google Fonts in `src/index.html`.

| Element | Font | Size | Weight |
| --- | --- | --- | --- |
| App title (header) | Barrio | 2rem | - |
| Panel / popup title | Inter | 1.1rem | 600 |
| Section label (UPPERCASE) | Inter | 0.72-0.75rem | 600 |
| Body / hint | Inter | 0.875rem | 400 |
| Row title | Inter | 1rem | 500 |
| Row meta | Inter | 0.8rem | 400 |
| Input | Inter | 0.9rem | 400 |

`--ion-font-family` is set on `:root` so every Ionic component inherits Inter; the app-header title overrides locally to Barrio.

## Popup patterns

### Bottom sheet (`.backdrop` + `.bottom-panel`)

Slides up from the bottom. Used for the task create/edit panels.

```html
<div class="backdrop" *ngIf="open" (click)="close()">
  <div class="bottom-panel" (click)="$event.stopPropagation()">
    <p class="panel-title">Title</p>
    <!-- content -->
  </div>
</div>
```

Key dimensions: `border-radius: 28px 28px 0 0`, `padding: 20px 16px 32px`, `max-width: 480px`, `max-height: 85vh`. z-index: 1000. Animation: `slide-up` (auto-applied via the global keyframe).

### Centered action popup (`.action-backdrop` + `.action-popup`)

Used for: task action menu (Complete / Edit / Delete), Next Alarms list, Health Check, Device Compatibility.

```html
<div class="action-backdrop" *ngIf="open" (click)="close()">
  <div class="action-popup" (click)="$event.stopPropagation()">
    <p class="action-popup-title">Title</p>
    <!-- buttons / list -->
  </div>
</div>
```

Key dimensions: `max-width: 320-360px`, `padding: 24px 20px 20px`, `border-radius: 12px`, `gap: 8px`. **No Cancel button** - tap backdrop to dismiss. z-index: 2000. Animation: `pop-in` + `fade-in`.

## Buttons

### Save / Primary
```html
<ion-button expand="block" (click)="save()">
  <ion-icon slot="start" name="checkmark-outline"></ion-icon>
  Save
</ion-button>
```
Filled, primary brand colour. Always first in an action group.

### Delete / Destructive
```html
<ion-button expand="block" class="btn-delete" (click)="delete()">
  <ion-icon slot="start" name="trash-outline"></ion-icon>
  Delete
</ion-button>
```
`btn-delete` is filled with the M3 error-container colour (`--color-danger-container`) and the corresponding text colour (`--color-on-danger-container`). Always include the `trash-outline` icon.

### Cancel
```html
<ion-button expand="block" fill="clear" (click)="cancel()">Cancel</ion-button>
```
No icon. Always `expand="block" fill="clear"`. Always last in an action group.

### Action group order

In `.panel-actions`: **Save -> Delete** (Cancel is implicit via backdrop tap).
In `.action-popup`: **Primary -> Secondary -> Destructive** (top to bottom), no Cancel.

### Material elevation pinning

Solid primary buttons inside `.bottom-panel` (surface-2) or `.action-popup` get muted by Material 3's elevation tint. `global.scss` pins them to `--ion-color-primary`. The `:not(.btn-delete)` exclusion lets the destructive token win on delete buttons.

## Inputs

### Text input (`.text-input`)

```scss
.text-input {
  width: 100%;
  box-sizing: border-box;
  font-family: 'Inter', sans-serif;
  font-size: 0.9rem;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  background: var(--surface-3);
  color: var(--ion-text-color, #fff);
  margin-bottom: 12px;
}
```
Focus: `border-color: var(--ion-color-primary)`.

### Search bar (`ion-searchbar`)

```scss
ion-searchbar {
  --background: var(--surface-1);
  --border-radius: 10px;
  padding: 16px 16px 10px;
}
```

## Icons

| Icon | Used for |
| --- | --- |
| `checkmark-outline` | Save / confirm button |
| `trash-outline` | Delete button |
| `add-outline` / `add` | Create button / FAB |
| `create-outline` | Edit button |
| `chevron-forward-outline` | Settings row chevron |
| `shield-checkmark` | OK / synced state |
| `alert-circle` | Warning or bad state |

### Health status icons

Use `.health-icon` with `[attr.data-state]="green|amber|red"` so the colour comes from CSS:

```scss
.health-icon[data-state='green'] { color: var(--health-green); }
.health-icon[data-state='amber'] { color: var(--health-amber); }
.health-icon[data-state='red']   { color: var(--health-red); }
```

## Animation

Global keyframes in `global.scss`, applied automatically to matching class names.

| Class | Animation | Duration |
| --- | --- | --- |
| `.backdrop`, `.action-backdrop` | `fade-in` | 0.2s |
| `.bottom-panel` | `slide-up` | 0.3s cubic-bezier(0.32, 0.72, 0, 1) |
| `.action-popup` | `pop-in` | 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) |

Don't add separate animation declarations in component SCSS for these - the global keyframes fire automatically.

## Task list swipe-to-complete

Each task is an `<ion-item-sliding>` (`tasks.page.html`). Custom snap-back: a global `pointerup`/`touchend` listener in `tasks.page.ts` closes the slider unless the drag ratio reached `>= 1.0` (full swipe). Background lerps gray -> primary green driven inline from `(ionDrag)`; the checkmark icon pops in (`tick-pop` keyframe) only at the lock-in threshold. No resting "open" state.

## Shared global classes

Defined in `global.scss` and available everywhere - do **not** redefine in component SCSS:

| Class | Purpose |
| --- | --- |
| `.backdrop` | Full-screen dimmed overlay for bottom panels |
| `.bottom-panel` | Slide-up editor panel |
| `.panel-title` | Title at top of a bottom panel or popup |
| `.panel-section-label` | UPPERCASE section label in a panel |
| `.panel-actions` | Column-stack of action buttons in a panel |
| `.action-backdrop` | Full-screen overlay for centered popups |
| `.action-popup` | Centered popup body |
| `.action-popup-title` | Title in a centered popup |
| `.text-input` | Standard dark text input |
| `.btn-delete` | Filled destructive button (on `<ion-button>`) |
| `.deadline-grid` | 2-column grid for deadline-preset buttons |
| `.deadline-btn` | Deadline-preset button |
| `.remind-row` | Toggle + label row in the task panels |
| `.empty-state` | Centred placeholder text when a list is empty |
