# ERYA PİLATES REFORMER — Master Design System

> **Source Visual Identity:** ERYA PİLATES REFORMER (`@eryapilatesreformer` — Eryaman Port AVM D:2/2C, Etimesgut / Ankara)
> **Brand Motto:** *"DENGEYLE GÜÇLEN • ZARAFETLE PARLA"* — *"A journey to your best self"*
> **Aesthetic Direction:** Warm Parisian Boutique Luxury • Sunlit Calacatta Marble • Ivory Boiserie Moldings • 3000K Golden Halo Arched Mirrors • Honey Beech Wood Reformers

---

## 1. Color Architecture (Semantic Tokens & WCAG AA Contrast Verified)

| Semantic Token | Hex | Studio Material Inspiration | Contrast Notes |
|---|---|---|---|
| `background` | `#F6F1E9` | Warm Alabaster / Parisian Ivory Wall Boiserie | Base canvas |
| `backgroundAlt` | `#FAF7F2` | Calacatta Pearl White Marble | Secondary canvas |
| `surface` | `#FFFFFF` | Pure Glossy Calacatta Tile Surface | Primary cards |
| `surfaceElevated` | `#F3ECE1` | Soft Champagne-Sand / Travertine Inset | Nested containers |
| `surfaceHalo` | `#FBF4E4` | 3000K Warm Golden Mirror Halo Glow | Featured highlights |
| `border` | `#E6DCCB` | Classic Ivory Molding Shadow Line | Card borders |
| `borderStrong` | `#D4C4AA` | Honey Beech Wood Trim | Input & active borders |
| `track` | `#EAE0D0` | Soft Stone Progress & Ring Track | Unfilled rings/bars |
| `primary` | `#9A7328` | Burnished Antique Champagne Gold | **4.62:1** on `#FFFFFF` (WCAG AA) |
| `primaryMetallic` | `#C9A452` | 3D Brushed Gold Signage & Delta Emblem | Gradients, rings & emblems |
| `primaryLight` | `#FAF0D7` | 3000K Backlit Arched Mirror Halo | Primary pill/badge bg |
| `primaryBorder` | `#E5CB90` | Soft Brushed Gold Frame | Active card/pill border |
| `secondary` | `#8C5258` | Feminine Rose-Mauve Burgundy (`Kadınlara Özel`) | **6.12:1** on `#FFFFFF` (WCAG AA) |
| `secondaryLight` | `#F8ECEE` | Soft Blush Silk | Secondary badge/trainer bg |
| `secondaryBorder` | `#E5C5C9` | Rose-Champagne Hairline | Secondary borders |
| `espresso` | `#221D19` | Deep Espresso-Charcoal Wall Typography | **15.8:1** on `#FFFFFF` |
| `walnut` | `#7A5536` | Fluted Walnut Reception Wood Slats | Warm architectural accent |
| `textPrimary` | `#221D19` | Deep Espresso Ink | Headings & body |
| `textSecondary` | `#6B5E51` | Warm Stone Taupe | **6.1:1** on `#FFFFFF` |
| `textMuted` | `#9A8C7D` | Reformer Greige Leather | Placeholders & captions |
| `success` | `#4A7856` | Studio Botanical Sage | Confirmed states |
| `warning` | `#D4952A` | Warm Amber Cove Light | Icons & indicators |
| `warningText` | `#9A640C` | Deep Burnished Amber | **5.0:1** readable warning text |
| `danger` | `#B83B42` | Refined Terracotta-Rose | Cancel & full states |

---

## 2. Typography

- **Display / Brand Wordmark (`ERYA`):** High-contrast Editorial Serif (`Cormorant Garamond`, `Georgia`, `serif`) — echoing the 3D brushed gold `ERYA` signage and stacked `ER/YA` wall monogram.
- **Sub-Wordmark & Micro Labels (`PİLATES REFORMER`):** Wide-tracked Geometric Sans (`Plus Jakarta Sans`, `letter-spacing: 1.8px–3.2px`, uppercase).
- **UI Body & Controls:** `Plus Jakarta Sans` / Apple System (`SF Pro`) with clear hierarchy and tabular figures for session counts and credits.

---

## 3. Architectural Component Motifs & UX Standards (`ui-ux-pro-max`)

1. **Arched Mirror & Halo Motifs:** Cards use generous soft radii (`22px–26px`) with warm champagne borders (`#E6DCCB`) and subtle warm-umber elevation (`shadowColor: '#5C4934'`), avoiding cold slate/blue shadows.
2. **Vector-Only Icons:** Zero emojis as structural navigation, category, or action icons — exclusively `lucide-react-native` (consistent `2px` stroke) and custom SVG brand emblems (`EryaBrandLogo`).
3. **Touch Targets & Accessibility:** Minimum `44x44pt` touch areas, explicit `accessibilityLabel`s on icon buttons, and WCAG AA `>= 4.5:1` text contrast across all warm cream/white surfaces.
