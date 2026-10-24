---
name: AIROVA Fleet & Shift Control
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434655'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#747686'
  outline-variant: '#c4c5d7'
  surface-tint: '#2151da'
  primary: '#0037b0'
  on-primary: '#ffffff'
  primary-container: '#1d4ed8'
  on-primary-container: '#cad3ff'
  inverse-primary: '#b7c4ff'
  secondary: '#855300'
  on-secondary: '#ffffff'
  secondary-container: '#fea619'
  on-secondary-container: '#684000'
  tertiary: '#004870'
  on-tertiary: '#ffffff'
  tertiary-container: '#006194'
  on-tertiary-container: '#b2d9ff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b7c4ff'
  on-primary-fixed: '#001551'
  on-primary-fixed-variant: '#0039b5'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#cce5ff'
  tertiary-fixed-dim: '#93ccff'
  on-tertiary-fixed: '#001d31'
  on-tertiary-fixed-variant: '#004b73'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: '0'
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.005em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
  metric-stat:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style

This design system establishes a high-density, mission-critical operations environment for real-time bus fleet tracking and industrial workforce shift logistics. It bridges precision telemetry with the fluid usability of modern top-tier SaaS platforms.

### Personality & Emotional Tenor
- **Operational Precision:** Interfaces prioritize actionable telemetry, legible telemetry data, and immediate spatial awareness over ornamental decoration.
- **Calm Authority:** Designed for high-stress dispatch desks and mobile field supervisors; visual hierarchy reduces cognitive fatigue during peak transit windows.
- **Functional Cleanliness:** Inspired by contemporary engineering dashboards—crisp geometric alignment, subtle containment borders, clear status signaling, and generous breathing room between dense data blocks.

### Design Movement
**Modern Operational Enterprise (Linear-inspired minimalism with tactile utility):** Crisp borders define work zones, soft neutral containers isolate contextual data, and deliberate saturated accents guide the eye strictly toward operational state shifts, anomalies, and active vehicular telemetry.

## Colors

The palette balances administrative utility with standard transit status iconography. High-contrast typography on light neutral backgrounds satisfies strict WCAG AA contrast standards.

### Core Swatches
- **Primary (`#1D4ED8`):** System identity, primary interactive targets, navigation active indicators, and confirmed states. Deep shades (`#1E40AF`, `#172554`) handle high-density tabular headers, navigation rail fills, and pressed states.
- **Accent / Alert (`#F59E0B`, `#D97706`):** Route deviations, maintenance alerts, unassigned shifts, and warning banners.
- **Operational Semantic States:**
  - **Success (`#10B981`):** *En ruta*, *Completado*, telemetría óptima.
  - **Danger (`#EF4444`):** *Retraso crítico*, *Falla mecánica*, *Alerta SOS*, incidentes de turno.
  - **Info / Tracking (`#0284C7`):** *Programado*, *En espera*, sincronización telemática.
- **Neutral Environment:**
  - **Canvas Base:** `#F8FAFC` (Slate-50) for global application background.
  - **Surface:** `#FFFFFF` for raised cards, flyouts, and active table rows.
  - **Subtle Surface Container:** `#F1F5F9` (Slate-100) for control wells, filter bars, and inactive inputs.
  - **Dividers & Borders:** `#E2E8F0` (Slate-200) for structural grid segmentation.
  - **Text Primary:** `#0F172A` (Slate-900) for absolute legibility.
  - **Text Muted:** `#64748B` (Slate-500) for secondary metadata and units of measure.

## Typography

The typography relies entirely on **Inter** to deliver a neutral, highly engineered tone. 

### Implementation Guidelines
- **Tabular Figures (`tnum`):** All dynamic telemetry, passenger counts, license plates, timestamps (`HH:mm:ss`), and GPS coordinates must enable OpenType tabular numbers (`font-variant-numeric: tabular-nums;`). This prevents layout reflows during live vehicle polling.
- **Language Adaptations (Spanish):** Spanish technical terms require slightly higher average line-height ratios and defensive truncation planning due to longer string expansion compared to English (e.g., "Mantenimiento Preventivo" vs. "Preventive Maint.").
- **Metadata Labels:** `label-sm` is reserved for uppercase badges, table header cells, and data category slugs.

## Layout & Spacing

The system implements a fluid, responsive 12-column grid on desktop screens and a flexible 4-column column structure on mobile dispatch views.

### Screen Adaptations
- **Desktop (Admin Hub, ≥1280px):** Fixed navigation rail (64px collapsed, 240px expanded) paired with an open-flow fluid grid workspace. Sections utilize a 24px (`gutter-desktop`) separation to present side-by-side live route maps, filter toolbars, and high-density vehicle lists.
- **Tablet (Field Supervisor, 768px - 1279px):** Responsive 8-column layout with collapsing drawers for live driver sheets and vehicle diagnostics.
- **Mobile (Driver & Field Operations, <768px):** 4-column layout with continuous vertical flow. Pinned top app bar (navigation & status summary) and fixed bottom navigation bar (56px standard touch target zone).

### Spatial Rhythm
All micro-spacings honor a strict 4px/8px modular scale. Spacing tokens (`space-xs` through `space-2xl`) must govern card padding, form field gaps, and metric clusters, never structural border widths or device outlines.

## Elevation & Depth

To sustain a crisp, high-density enterprise aesthetic, depth is established through a hybrid model of thin semantic borders (`#E2E8F0`) and soft, ambient diffused drop shadows. Heavy, dark drop shadows are strictly prohibited.

### Tiers of Depth
- **Level 0 (Flat / Canvas):** Applied to the master page canvas (`#F8FAFC`). No shadow, no border.
- **Level 1 (Card & Module Surface):** Standard white (`#FFFFFF`) modules, KPI metric tiles, and data grid containers. Surrounded by a 1px solid border (`#E2E8F0`) and an ambient shadow: `box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.04)`.
- **Level 2 (Dropdowns, Popovers & Context Menus):** Overlays, filter popouts, and autocomplete lists. 1px border (`#E2E8F0`), elevated with: `box-shadow: 0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.05)`.
- **Level 3 (Modals & Command Center Drawers):** Dispatch management drawers, emergency dialogs, and shift reassignments. Surrounded by a subtle highlight edge and a wide-spread ambient shadow: `box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.06)`. Accompanied by a 30% slate backdrop dim (`rgba(15, 23, 42, 0.4)` with 4px backdrop blur).

## Shapes

The design uses a clean, rounded profile (`roundedness: 2`, matching `12px` / `0.75rem` for standard cards and containers), balancing enterprise rigour with approachable modern SaaS software.

### Curvature Taxonomy
- **Default Elements (12px / `rounded-xl`):** Primary metric cards, modals, table container boundaries, live tracking feed modules.
- **Controls & Form Elements (8px / `rounded-lg`):** Text inputs, dropdown select triggers, segment controllers, and primary utility buttons.
- **Status Pills & Micro Indicators (`rounded-full`):** Telemetry status chips (*En ruta*, *Activo*, etc.), circular avatar status badges, and tab pills.

## Components

### 1. KPI Metric Cards
- **Structure:** Level 1 elevation, `#FFFFFF` background, 1px `#E2E8F0` border.
- **Content Flow:** 
  - Top row: Semantic label (`label-md`, text-slate-500) paired with a contextual Lucide icon wrapped in an ultra-subtle tinted square (`rounded-lg`, 32x32px).
  - Center: Metric stat (`metric-stat`, text-slate-900, `tnum`), displaying figures like "94.2% Puntualidad" or "142/150 Buses".
  - Bottom row: Inline delta tag (Emerald for positive progress, Rose for delay increase) + secondary micro-copy (`body-sm`, e.g., "vs. turno anterior").

### 2. Operational Data Tables & Status Badges
- **Header:** `#F8FAFC` background, 1px bottom border (`#E2E8F0`), `label-sm` uppercase text in Slate-500.
- **Rows:** Minimum height 48px, horizontal borders only. Hover state transitions row background to `#F1F5F9`.
- **Status Badges:** Compact pill layout (`rounded-full`), padding `2px 8px`, `label-sm` weight:
  - *Activo / En ruta:* Text `#065F46`, background `#D1FAE5`, active pulsing dot (6px) in `#10B981`.
  - *Mantenimiento:* Text `#92400E`, background `#FEF3C7`.
  - *Pendiente:* Text `#075985`, background `#E0F2FE`.
  - *Completado:* Text `#1E293B`, background `#E2E8F0`.
  - *Alerta / Retraso:* Text `#991B1B`, background `#FEE2E2`.

### 3. Form Inputs & Inline Validation
- **Height & Spacing:** Standard input height 40px, padding `8px 12px`, font `body-md`.
- **States:** Default border `#E2E8F0`, background `#FFFFFF`. Active focus displays a 1px border `#1D4ED8` and a 3px ambient focus ring (`rgba(29, 78, 216, 0.15)`).
- **Inline Validation:** Error messages appear directly below input in `body-sm` (`#EF4444`) paired with a Lucide `AlertCircle` (14px). Error borders shift to `#EF4444`.

### 4. Interactive Buttons & Segmented Controls
- **Primary Action:** Solid Deep Blue `#1D4ED8` fill, white text, 8px border radius, font `label-lg`. Hover: `#1E40AF`. Active: `#172554`.
- **Secondary Action:** White surface, 1px border `#E2E8F0`, text `#0F172A`. Hover: `#F8FAFC`.
- **Segmented Control:** Enclosed container (`#F1F5F9`, 4px padding). Active selection translates on a white pill card with Level 1 micro-shadow.

### 5. Route Progress Indicators
- Visual multi-step line representing shift stops: Completed nodes marked with solid Deep Blue discs and check marks; current target bus position represented by a pulsing Emerald indicator; upcoming worker pick-up waypoints shown as hollow Slate-300 circles.

### 6. Mobile Bottom Navigation
- Fixed 56px height, pure `#FFFFFF` background with top 1px border `#E2E8F0`.
- 4-5 key destinations (*Flota*, *Turnos*, *Rutas*, *Alertas*, *Perfil*).
- Active item uses `#1D4ED8` with a 20px Lucide icon and `label-sm` text. Inactive items use `#64748B`.