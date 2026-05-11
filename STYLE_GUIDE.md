# Bugger — Style Guide

Inherited body comes from menu_app. The **Bugger overrides** section at the bottom wins over anything earlier in this file — read it first.

Full reference for all UI patterns, components, and visual standards. Keep this in sync when adding new patterns.

---

## Surface Hierarchy

Material Design 3 elevation model. Inner surfaces must always be **lighter** than their container — never revert to black.

| Variable | RGB | Hex | Used for |
|---|---|---|---|
| `--surface-0` | `rgb(0, 0, 0)` | `#000000` | Main app background |
| `--surface-1` | `rgb(30, 30, 30)` | `#1E1E1E` | List rows, day cards, meal rows |
| `--surface-2` | `rgb(45, 45, 45)` | `#2D2D2D` | Bottom panels, centered popups |
| `--surface-3` | `rgb(60, 60, 60)` | `#3C3C3C` | Inputs, nested cards within popups |

Corner radius rules:
- Bottom slide-out panels: `border-radius: 28px 28px 0 0`
- Centered popups and internal cards: `border-radius: 12px`
- Inputs and small cards: `border-radius: 8px`

---

## Colours

Primary brand is **SeaGreen `#2E8B57`**. All accent colours are tuned to sit harmoniously with this green on the dark Material 3 surfaces — warm accents (coral, amber) act as complements; cool accents (snow-blue) are kept desaturated enough not to clash.

| Purpose | Value | Notes |
|---|---|---|
| Primary brand | `#2E8B57` | SeaGreen — `var(--ion-color-primary)` |
| Primary tint (hover/focus) | `#3FA76A` | `var(--ion-color-primary-tint)` |
| Primary shade (pressed) | `#246E45` | `var(--ion-color-primary-shade)` |
| Primary contrast (text on green) | `#FFFFFF` | `var(--ion-color-primary-contrast)` |
| Muted / secondary text | `var(--ion-color-medium)` | |
| Delete / error border+text | `rgb(255, 170, 160)` | Slightly cooler coral so it reads as red, not orange, next to SeaGreen |
| Warning flame icon | `var(--ion-color-warning, #f5b400)` | Amber, nudged warmer to separate from the green |
| Snowflake / frozen icon | `#8FD4E8` | Soft cyan — desaturated to avoid competing with primary |
| Star / favourite | `#ffca28` | Unchanged — gold complements SeaGreen well |
| Complete tick | `rgb(255, 255, 255)` | |
| Subtle borders | `rgba(255, 255, 255, 0.08)` – `rgba(255, 255, 255, 0.18)` | |
| Primary-tinted border (focus rings) | `rgba(46, 139, 87, 0.45)` | |
| App version text | `rgba(255, 255, 255, 0.3)` | |
| Hint / muted text | `rgba(255, 255, 255, 0.6)` | |

Ionic theme variables (set in `src/theme/variables.scss`):

```scss
:root {
  --ion-color-primary: #2E8B57;
  --ion-color-primary-rgb: 46, 139, 87;
  --ion-color-primary-contrast: #ffffff;
  --ion-color-primary-contrast-rgb: 255, 255, 255;
  --ion-color-primary-shade: #246E45;
  --ion-color-primary-tint: #3FA76A;
}
```

---

## Typography

All body text uses **Inter**. App title only uses **Barrio**.
Google Fonts loaded in `src/index.html`: `Barrio`, `Inter:wght@400;500;600`.

| Element | Font | Size | Weight | Notes |
|---|---|---|---|---|
| App title "MENU" | Barrio | 2rem | — | `.app-title` in global.scss |
| Panel / popup title | Inter | 1.1rem | 600 | `.panel-title`, `.sync-popup-title` |
| Week number | Inter | 1.2rem | 600 | letter-spacing 0.5px |
| Day name | Inter | — | 600 | |
| Meal / item name (rows) | Inter | 0.9–0.95rem | 400–500 | |
| Recipe tooltip name | Inter | 1rem | 600 | |
| Section label (UPPERCASE) | Inter | 0.72–0.75rem | 600 | uppercase, letter-spacing 0.06–0.08em |
| Body / hint text | Inter | 0.875rem | 400 | `var(--ion-color-medium)` |
| Tag / pill label | Inter | 0.78rem | 400 | |
| Date / sub-label | Inter | 0.8–0.85rem | 400 | `var(--ion-color-medium)` |
| Flame / overflow count | Inter | 0.9rem | 500 | warning colour |
| Overflow badge (+N) | Inter | 0.72rem | 600 | `var(--ion-color-medium)` |
| Input fields | Inter | 0.9rem | 400 | |
| App version | Inter | 0.75rem | 400 | `rgba(255,255,255,0.3)`, bottom of settings |
| Year sub-label (week nav) | Inter | 0.8rem | 400 | `var(--ion-color-medium)` |

---

## Popup Patterns

### 1. Confirmation / Alert Popup (`sync-backdrop` + `sync-popup`)

Centered modal used for confirmations, alerts, import dialogs, and data views.
Defined in `global.scss`. z-index: 2000.

```html
<div class="sync-backdrop" *ngIf="visible" (click)="onDismiss()">
  <div class="sync-popup" (click)="$event.stopPropagation()">
    <div class="sync-popup-icon">
      <ion-icon name="icon-name"></ion-icon>
    </div>
    <p class="sync-popup-title">Title</p>
    <p class="sync-popup-message">Message text.</p>
    <div class="sync-popup-actions">
      <ion-button expand="block" (click)="onConfirm()">
        <ion-icon slot="start" name="checkmark-outline"></ion-icon>
        Confirm
      </ion-button>
      <ion-button expand="block" fill="clear" (click)="onDismiss()">Cancel</ion-button>
    </div>
  </div>
</div>
```

Key dimensions: `max-width: 360px`, `padding: 24px 20px 20px`, `border-radius: 12px`.
Icon: `font-size: 2.2rem`, `color: var(--ion-color-primary)` (`#2E8B57`).
Actions: `flex-direction: column`, `gap: 10px`.

---

### 2. Bottom Sheet (`backdrop` + `bottom-panel`)

Slides up from the bottom. Used for editors (day editor, meal editor, tag editor).
Defined in `global.scss`. z-index: 1000.

```html
<div class="backdrop" *ngIf="visible" (click)="close()">
  <div class="bottom-panel" (click)="$event.stopPropagation()">
    <p class="panel-title">Panel Title</p>
    <!-- content -->
  </div>
</div>
```

Key dimensions: `border-radius: 28px 28px 0 0`, `padding: 20px 16px 32px`, `max-width: 480px`, `max-height: 80vh`, `overflow-y: auto`.

---

### 3. Content Picker Popup (`picker-backdrop` + `picker-popup`)

Centered popup used for meal selection. Safe area inset ensures Android status bar clearance.
Defined in `plan.page.scss`. z-index: 2000.

```html
<div class="picker-backdrop" *ngIf="visible" (click)="close()">
  <div class="picker-popup" (click)="$event.stopPropagation()">
    <div class="picker-popup-scroll">
      <!-- scrollable content -->
    </div>
  </div>
</div>
```

Backdrop padding: `calc(env(safe-area-inset-top) + 24px) 24px 24px` — push popup below Android status bar.
Popup: `max-width: 360px`, `max-height: 85%`, scroll area hides scrollbar (`scrollbar-width: none`).

---

### 4. Recipe Tooltip (`recipe-backdrop` + `recipe-tooltip`)

Centered popup for meal detail / recipe link. z-index: 2000.

```html
<div class="recipe-backdrop" *ngIf="tooltipVisible" (click)="closeTooltip()">
  <div class="recipe-tooltip" (click)="$event.stopPropagation()">
    <p class="recipe-tooltip-name">Meal Name</p>
    <!-- buttons -->
  </div>
</div>
```

Tooltip: `max-width: 320px`, `padding: 24px 20px 20px`, `border-radius: 12px`, `display: flex; flex-direction: column; gap: 6px`.

---

### 5. Ingredients Popup (`ing-backdrop` + `ing-popup`)

Centered popup for ingredient editing. z-index: 2000.

Popup: `max-width: 360px`, `max-height: 70vh`, `overflow-y: auto`, `padding: 20px`.
Has absolute-positioned close button (`.ing-close`) top-right: `position: absolute; top: 12px; right: 12px`.

---

### 6. Dropbox Connect Prompt (`dropbox-backdrop` + `dropbox-panel`)

Bottom-sheet variant used only for the first-run "Back up to Dropbox?" prompt in `app.component`. Defined in `app.component.scss`. z-index: 1000.

Same shape as the standard bottom panel (`border-radius: 28px 28px 0 0`, `max-width: 480px`) but slightly larger padding (`28px 16px 40px`) and includes a centered logo wrap. Animations are inherited from the global `.dropbox-panel` / `.dropbox-backdrop` keyframes (slide-up + fade-in).

---

### 7. Bottom-Anchored Delete Dialog (`delete-dialog`)

Used on the Shared page when long-pressing a row. Unlike centered popups, this anchors to the bottom of the viewport with safe-area inset. z-index: 1001 (sits above the global `.backdrop` at z-index 1000).

```html
<div class="backdrop" *ngIf="visible" (click)="cancel()"></div>
<div class="delete-dialog" *ngIf="visible">
  <p class="delete-message">Remove this plan from your history?</p>
  <div class="delete-actions">
    <ion-button fill="clear" (click)="cancel()">Cancel</ion-button>
    <ion-button fill="outline" class="btn-delete" (click)="confirm()">
      <ion-icon slot="start" name="trash-outline"></ion-icon>
      Delete
    </ion-button>
  </div>
</div>
```

Key dimensions: `left/right: 16px`, `bottom: calc(24px + env(safe-area-inset-bottom, 0px))`, `background: var(--surface-2)`, `border-radius: 16px`, `padding: 20px 16px 16px`.
Action buttons here use a horizontal row (`display: flex; justify-content: flex-end`) — destructive on the right, Cancel on the left. This is the only place the standard column action-group rule does not apply.

---

## Buttons

### Save / Primary Action
```html
<ion-button expand="block" (click)="save()">
  <ion-icon slot="start" name="checkmark-outline"></ion-icon>
  Save
</ion-button>
```
Filled, primary brand colour. Always first in an action group.

### Delete / Destructive Action
```html
<ion-button expand="block" class="btn-delete" fill="outline" (click)="delete()">
  <ion-icon slot="start" name="trash-outline"></ion-icon>
  Delete
</ion-button>
```
`btn-delete` defined in `global.scss`: `rgb(255, 170, 160)` border + text, transparent background. Always include the `trash-outline` icon.

### Cancel
```html
<ion-button expand="block" fill="clear" (click)="cancel()">Cancel</ion-button>
```
No icon. Always `expand="block" fill="clear"`. Always last in an action group.

### Secondary / Outline Action
```html
<ion-button expand="block" fill="outline" (click)="action()">
  <ion-icon slot="start" name="icon-name"></ion-icon>
  Label
</ion-button>
```

### Action Group Order
In a `sync-popup-actions` column: **Primary → Secondary → Cancel** (top to bottom).
In a `panel-actions` column: **Save → Delete** (Cancel is implicit via backdrop tap).

---

## Icons

Standard usage for common icons. Always `flex-shrink: 0` on inline row icons.

| Icon name | Size | Colour | Used for |
|---|---|---|---|
| `checkmark-outline` | button slot | — | Save/confirm button |
| `trash-outline` | button slot | `rgb(255,170,160)` | Delete button |
| `warning-outline` | 1rem (inline), 2.2rem (popup) | primary (`#2E8B57`) / medium | Alert popup, plan-incomplete warning |
| `checkmark-circle` | 1.2rem | `#fff` | Day complete tick (plan page day header) |
| `flame-outline` | 1.05rem | `var(--ion-color-warning, #f5b400)` | Usage count indicator |
| `snow-outline` | 1.05rem | `#8FD4E8` | Frozen/unused meal indicator |
| `link-outline` | 1.1rem | `var(--ion-color-primary)` | Recipe URL indicator |
| `list-outline` | 1.1rem | `var(--ion-color-medium)` | Has ingredients indicator |
| `share-social-outline` | button slot | — | Share meal button |
| `filter-outline` | 1.3rem | primary (active) / `rgba(255,255,255,0.7)` (inactive) | Picker filter toggle |
| `star` / `star-outline` | 1.5rem | `#ffca28` (active) / medium (inactive) | Favourite/star toggle |
| `create-outline` | button slot | — | Edit button |
| `close` / `close-outline` | 1.4rem | `rgba(255,255,255,0.45)` | Close button (absolute top-right) |
| `chevron-back-outline` | icon-only slot | — | Previous week |
| `chevron-forward-outline` | icon-only slot | — | Next week |

Close buttons (absolute positioned): `position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 1.4rem; color: rgba(255,255,255,0.45)`.

---

## List Rows

Standard interactive row (meal row, ingredient row, day card item):

```scss
.row {
  display: flex;
  align-items: center;
  gap: 6–8px;
  padding: 12–14px 16px;
  background: var(--surface-1);
  border-radius: 12px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
}
```

Row content order (left → right): **main label** (flex: 1) → **tag pills** → **status icons** → **count**.

---

## Inputs

### Text Input (`.text-input`)
Defined in `global.scss`. Used for name/URL fields in panels.

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

Focus state: `border-color: var(--ion-color-primary)` (`#2E8B57`), optional glow `box-shadow: 0 0 0 3px rgba(46, 139, 87, 0.25)`.
Placeholder: `color: var(--ion-color-medium, #999)`.
Override `margin-bottom` per context if needed (item-editor uses 20px).

### Search Bar (`ion-searchbar`)
Defined in `global.scss`. Consistent across all pages with search.
```scss
ion-searchbar {
  --background: var(--surface-1);
  --border-radius: 10px;
  padding: 16px 16px 10px;
}
```

---

## Tag Pills (`.tag-sel-pill`)

Used in editor panels and filter rows for selectable tag chips.
Defined in `global.scss`.

```html
<button class="tag-sel-pill" [class.tag-sel-pill--selected]="isSelected"
        [style.background-color]="isSelected ? tag.color : ''"
        [style.border-color]="tag.color"
        [style.color]="isSelected ? '#fff' : tag.color"
        (click)="toggle(tag.id)">
  <ion-icon *ngIf="isSelected" name="checkmark" class="pill-check"></ion-icon>
  {{ tag.name }}
</button>
```

Selected state always shows a leading checkmark (`pill-check`: `font-size: 0.85rem`).
Use `app-tag-pill` component for display-only pills (not selectable).

---

## Shared Global Classes

These are defined in `global.scss` and available everywhere — do **not** redefine in component SCSS files.

| Class | Purpose |
|---|---|
| `.empty-state` | Centred placeholder text when a list is empty |
| `.tag-overflow-badge` | "+N" overflow count next to tag pills in rows |
| `.backdrop` | Full-screen dimmed overlay for bottom panels (z-index 1000) |
| `.bottom-panel` | Slide-up editor panel |
| `.panel-title` | Title at top of a bottom panel or popup |
| `.text-input` | Standard dark text input field |
| `.tag-selector` | Flex-wrap container for selectable tag chips |
| `.no-tags-hint` | Small muted text when no tags exist |
| `.tag-sel-pill` | Selectable tag chip button |
| `ion-searchbar` | Consistent search bar theming |
| `ion-button.btn-delete` | Destructive outlined button |
| `.sync-backdrop` / `.sync-popup` | Confirmation popup overlay |
| `.sync-popup-icon/title/message/actions` | Confirmation popup internals |

---

## Inline Status Indicators

### Plan-Incomplete Warning
```html
<div class="plan-incomplete-warning" *ngIf="!isWeekComplete">
  <ion-icon name="warning-outline"></ion-icon>
  Plan is not complete yet
</div>
```
Style: `display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.8rem; color: var(--ion-color-medium)`. Icon: `font-size: 1rem`.

### Overflow Badge
```html
<span class="tag-overflow-badge" *ngIf="overflowCount > 0">+{{ overflowCount }}</span>
```

---

## Animation

Global keyframes defined in `global.scss`. Applied automatically to matching class names.

| Class | Animation | Duration |
|---|---|---|
| `.backdrop`, `.sync-backdrop`, `.picker-backdrop`, `.ing-backdrop`, `.dropbox-backdrop` | `fade-in` (opacity 0→1) | 0.2s ease |
| `.bottom-panel`, `.dropbox-panel` | `slide-up` (translateY 100%→0) | 0.3s cubic-bezier(0.32, 0.72, 0, 1) |
| `.picker-popup`, `.ing-popup`, `.sync-popup` | `pop-in` (scale 0.92→1 + fade) | 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) |

Do not add separate animation declarations in component SCSS for these elements — the global keyframes fire automatically.

---

## Bugger overrides

These override the inherited body above. Source of truth lives in `src/theme/variables.scss` and `src/global.scss`.

### Colour tokens (changed)

| Token | Value | Notes |
|---|---|---|
| `--ion-color-primary` | `#22C55E` | Tailwind green-500 |
| `--ion-color-primary-contrast` | `#191919` / `#272727` | dark text on the green |
| `--ion-color-primary-shade` | `#16A34A` | |
| `--ion-color-primary-tint` | `#4ADE80` | |
| `--ion-color-danger` | `#F2B8B5` | M3 dark-scheme error, outline use |
| `--color-danger-container` | `#8C1D18` | M3 error container, filled `.btn-delete` background |
| `--color-on-danger-container` | `#F9DEDC` | text on filled destructive |
| `--health-green` | `#22C55E` | traffic light + sync OK |
| `--health-amber` | `#f5b400` | warning |
| `--health-red` | `#DC2626` | vivid; used for stale banner, sync-warning, alert icon |
| `--ion-font-family` | `'Inter', sans-serif` | set on `:root` so every Ionic component inherits |

### `.btn-delete` is filled, not outlined

`btn-delete` now uses the M3 filled-error treatment (`--color-danger-container` background + `--color-on-danger-container` text). Drop `fill="outline"` on delete buttons.

### Action popup pattern (`.action-backdrop` + `.action-popup`)

Centered popup used for: task action menu (Complete / Edit / Delete), Next Alarms list, Health Check, Device Compatibility. Defined in `global.scss` with `fade-in` + `pop-in` animations.

```html
<div class="action-backdrop" *ngIf="open" (click)="close()">
  <div class="action-popup" (click)="$event.stopPropagation()">
    <p class="action-popup-title">Title</p>
    <!-- buttons / list -->
  </div>
</div>
```

`max-width: 320–360px`, `padding: 24px 20px 20px`, `border-radius: 12px`, `gap: 8px`. **No Cancel button** — tap backdrop to dismiss.

### Settings row pattern

A clickable `<section class="settings-section settings-row">` that opens a diagnostic popup. Layout: title + help paragraph in `.row-main`, optional status icon, and a `.row-chevron` on the right. Used by Next Alarms, Health Check, Device Compatibility.

### Status icons (replace coloured dots)

| State | Icon |
|---|---|
| OK / synced | `shield-checkmark` in `--health-green` |
| Warning | `alert-circle` in `--health-amber` |
| Bad / not synced | `alert-circle` in `--health-red` |

Use `.health-icon` class with `[attr.data-state]="green|amber|red"` so the colour comes from CSS.

### Task list swipe-to-complete

Each task is an `<ion-item-sliding>` (see `tasks.page.html`). Custom snap-back: a global `pointerup`/`touchend` listener in `tasks.page.ts` closes the slider unless the drag ratio reached `>= 1.0` (full swipe). Background lerps gray → primary green driven inline from `(ionDrag)`; checkmark icon pops in (`tick-pop` keyframe) only at the lock-in threshold. No resting "open" state.

### Primary-pinning override (Material elevation tint)

Solid primary buttons inside `.bottom-panel` (surface-2) or `.action-popup` get muted by Material 3's elevation tint. `global.scss` pins them:

```scss
.panel-actions ion-button:not([fill='outline']):not([fill='clear']):not(.btn-delete),
.action-popup  ion-button:not([fill='outline']):not([fill='clear']):not(.btn-delete) {
  --background: var(--ion-color-primary);
  --color: var(--ion-color-primary-contrast);
}
```

The `:not(.btn-delete)` exclusion lets the destructive token win on those buttons.

### `app-header`

Live shared component (`src/app/shared/app-header.component.*`), not aspirational. Toolbar uses `--background: #22C55E` and `--color: #272727` directly (it sits on surface-0, no elevation tint to fight). Header title is Barrio; everything else is Inter.
