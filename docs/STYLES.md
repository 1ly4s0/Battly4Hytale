# Styles Guide

This guide defines how CSS is organized in Battly Launcher and how to change visuals without regressions.

---

## 1. Style Entry Points

Main CSS entry files:

- `src/style.css`
  - legacy compatibility layer
  - imports `src/styles/legacy/*`
- `src/style-match.css`
  - active visual system used by current launcher design
  - imports `src/styles/match/shell.css` and `src/styles/match/panels.css`
- `src/styles/splash.css`
  - splash window only

Rule: new UI work should target `match/*` unless the component only exists in legacy.

---

## 2. Responsibility by File

- `src/styles/match/shell.css`
  - root layout
  - title bar
  - hero/home screen
  - footer action area
  - background overlays

- `src/styles/match/panels.css`
  - settings modal
  - mods panels
  - onboarding
  - dialog overlays
  - game logs modal

- `src/styles/splash.css`
  - splash animation
  - splash progress area

Keep component ownership clear. Avoid duplicated selectors across files.

---

## 3. Visual Direction

Current design language:

- dark blue/steel palette
- frosted/translucent containers
- soft borders and glow accents
- high-contrast CTA (`Play` button)
- large hero typography

Do not reintroduce purple/pink gradients unless explicitly requested.

---

## 4. Tokens and Reuse

Use shared tokens from `style-match.css` instead of hardcoded colors:

- primary/secondary/accent variables
- border alpha variants
- text alpha variants

When adding a new repeated visual value:

1. add a CSS variable in root tokens
2. consume it from component selectors

---

## 5. Naming and Selector Rules

Conventions:

- feature prefixes: `news-*`, `mods-*`, `account-*`, `version-*`, `onboarding-*`
- avoid over-specific chains that are hard to override
- avoid `!important` except explicit legacy conflict resolution
- keep one component, one selector group pattern

Do not add inline styles for new behavior.

---

## 6. States and Interaction

Every interactive component must define at least:

- default
- hover
- focus-visible
- active
- disabled (when applicable)

Required checks:

- keyboard focus visibility
- readable disabled contrast
- no layout jump on hover/focus

---

## 7. Layering and Overlays

Use consistent z-index tiers:

- background layers
- base content
- top bar/actions
- modal overlays
- modal content

Common issues to avoid:

- modal behind title bar
- click-through on overlays
- duplicated backdrop blur stacking

---

## 8. Responsive and Window Constraints

Target launcher window profile first (desktop app ratio), then validate narrower widths.

Minimum validation pass:

- hero text wrapping
- news cards clipping
- version selector and play button alignment
- mods grid overflow behavior
- modal max-height and scroll

---

## 9. Performance Rules

Prefer:

- transform/opacity transitions
- limited blur layers
- static gradients over heavy animated filters

Avoid:

- large box-shadow animations on many elements
- frequent layout-triggering transitions
- unnecessary `will-change`

---

## 10. Change Workflow

Before editing:

1. identify target component and owning CSS file
2. confirm if legacy selector overlaps

After editing:

1. validate Home, Mods, Settings, Onboarding, Splash
2. validate language switch does not break spacing
3. validate game logs modal readability

Update docs when introducing a new reusable pattern or token.
