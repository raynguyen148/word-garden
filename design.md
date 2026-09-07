# Word Garden design system

Quiet editorial styling for a personal, offline English dictionary. Keep the existing cream/brown light theme and charcoal/gold dark theme. Consistency across Dictionary, Practice Packs, Review, forms and dialogs takes priority over changing themes between views.

## Structure and type

App family: Workbench, adapted to real working controls rather than a marketing tour. Compact edge-aligned header (N9 adapted for app actions); one-line privacy footer (Ft2). No illustration, marketing sections or external assets.

Keep the local Charter/Iowan/Georgia display stack and the existing system sans-serif body stack. Headings are upright; controls use the body font. Use short, descriptive headings and action labels. Metadata and counts come from saved data.

## Sources and cascade

Load in this order: `css/styles.css`, `css/theme-light.css`, `css/theme-warm.css`, `css/theme-dark.css`, `css/tokens.css`, `css/refinement.css`.

The three theme files own the established palette. `css/tokens.css` adds shared sizing, spacing, motion and semantic aliases; dark secondary text has a higher lightness for readability. `css/refinement.css` overrides the legacy visual layers in place. Its repeated `:root` selector intentionally matches the existing theme selectors' specificity without `!important`.

## Components

- Control height: 44px for primary controls; 10px control corners, 16px panel corners.
- Spacing: 4, 8, 12, 16, 24, 32, 48px, exposed as named tokens.
- Flat filled primary buttons, bordered secondary controls, clear destructive labels.
- Desktop: editable table. Up to 980px: stacked entries; 600–980px uses two columns for fields. The same DOM and event handlers own both layouts.
- Compact header and filter disclosure up to 980px. Every navigation action remains available.
- Native dialogs, associated names/descriptions, cancel-first delete confirmation.
- Tooltips: shared surface; 800ms pointer delay, immediate focus, Escape dismissal, preserved existing accessible descriptions. Titles updated by application code feed the shared tooltip.
- Focus outlines are immediate. Reduced motion disables nonessential transitions and animations. No decorative confetti, hover lifts or glowing containers.
- Add and lesson forms prevent repeated submissions while saving. Invalid lesson drafts remain editable without a partial save.

## Exports

### CSS

Use the source files above together. The canonical refinement values are in `css/tokens.css`; theme aliases deliberately reference the existing theme variables rather than defining a second palette.

### Tailwind v4 mapping (optional, not loaded by this app)

```css
@theme inline {
  --color-paper: var(--background);
  --color-ink: var(--foreground);
  --color-accent: var(--primary);
  --color-accent-ink: var(--primary-foreground);
  --font-body: var(--font-sans);
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --radius-control: .625rem;
  --radius-panel: 1rem;
}
```

### DTCG core mapping (optional)

```json
{
  "light": {
    "paper": { "$type": "color", "$value": "#f6f3ed" },
    "ink": { "$type": "color", "$value": "#1c1713" },
    "accent": { "$type": "color", "$value": "#724e36" }
  },
  "dark": {
    "paper": { "$type": "color", "$value": "#181818" },
    "ink": { "$type": "color", "$value": "#cccccc" },
    "accent": { "$type": "color", "$value": "#c89355" }
  },
  "controlHeight": { "$type": "dimension", "$value": "44px" }
}
```

### shadcn mapping (optional, full CSS color values)

```css
:root {
  --card: var(--surface);
  --card-foreground: var(--foreground);
  --popover: var(--tooltip-background);
  --popover-foreground: var(--foreground);
  --muted-foreground: var(--muted);
  --ring: var(--primary);
  --radius: 1rem;
}
```

These optional mappings do not introduce a framework or dependency into Word Garden. Reuse the original `--background`, `--foreground`, `--primary` and `--primary-foreground` values directly; do not wrap their full color values in `hsl()` or `oklch()`.
