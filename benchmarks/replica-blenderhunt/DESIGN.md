---
version: alpha
name: BlenderHunt
description: Dark, cyberpunk marketplace design system for BlenderHunt.OS / BlenderHunt.com, centered on mono-space terminal UI, vivid orange accents, and dense commerce/feed layouts.
---
colors:
  primary: "#f9752f"
  secondary: "#edebe7"
  tertiary: "#0f0f0f"
  neutral: "#000000"
  surface: "#000000"
  on-surface: "#edebe7"
  error: "#ff5a5a"
typography:
  headline-display:
    fontFamily: "Orbit"
    fontFallbacks:
      - "Orbit"
      - "Orbit Fallback"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: 1.22
    letterSpacing: "0px"
  headline-lg:
    fontFamily: "Orbit"
    fontFallbacks:
      - "Orbit"
      - "Orbit Fallback"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: "28px"
    letterSpacing: "0.5px"
  headline-md:
    fontFamily: "Orbit"
    fontFallbacks:
      - "Orbit"
      - "Orbit Fallback"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "0px"
  body-lg:
    fontFamily: "Orbit"
    fontFallbacks:
      - "Orbit"
      - "Orbit Fallback"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "26px"
    letterSpacing: "0px"
  body-md:
    fontFamily: "Orbit"
    fontFallbacks:
      - "Orbit"
      - "Orbit Fallback"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "26px"
    letterSpacing: "0px"
  body-sm:
    fontFamily: "Orbit"
    fontFallbacks:
      - "Orbit"
      - "Orbit Fallback"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0px"
  label-lg:
    fontFamily: "JetBrains Mono"
    fontFallbacks:
      - "JetBrains Mono"
      - "JetBrains Mono Fallback"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.08em"
  label-md:
    fontFamily: "JetBrains Mono"
    fontFallbacks:
      - "JetBrains Mono"
      - "JetBrains Mono Fallback"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.08em"
  label-sm:
    fontFamily: "JetBrains Mono"
    fontFallbacks:
      - "JetBrains Mono"
      - "JetBrains Mono Fallback"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  none: "0px"
  sm: "0px"
  md: "8px"
  lg: "8px"
  xl: "8px"
  full: "9999px"
spacing:
  xs: "2px"
  sm: "10px"
  md: "20px"
  lg: "24px"
  xl: "40px"
components:
  button:
    primary:
      backgroundColor: "#f9752f"
      color: "#020202"
      borderColor: "transparent"
      borderRadius: "0px"
      borderWidth: "1px"
      borderStyle: "solid"
      padding: "0px 16px"
      fontSize: "11px"
      fontWeight: 500
      minWidth: "142px"
      minHeight: "83px"
      textDecoration: "none"
      boxShadow: "lab(65.0794 48.7973 60.6257 / 0.5) 0px 0px 12px -3px, lab(65.0794 48.7973 60.6257 / 0.22) 0px 0px 28px -10px"
      fontFamily: "JetBrains Mono"
      fontFallbacks:
        - "JetBrains Mono"
        - "JetBrains Mono Fallback"
      css: "box-sizing: border-box; display: inline-block; min-width: 142px; min-height: 83px; background-color: #f9752f; color: #020202; border: 1px solid transparent; border-radius: 0px; padding: 0px 16px; font-size: 11px; font-weight: 500; font-family: \"JetBrains Mono\", \"JetBrains Mono Fallback\"; text-decoration: none; box-shadow: lab(65.0794 48.7973 60.6257 / 0.5) 0px 0px 12px -3px, lab(65.0794 48.7973 60.6257 / 0.22) 0px 0px 28px -10px;"
    secondary:
      backgroundColor: "transparent"
      color: "#edebe7"
      borderColor: "#0f0f0f"
      borderRadius: "0px"
      borderWidth: "1px"
      borderStyle: "solid"
      padding: "0px 16px"
      fontSize: "11px"
      fontWeight: 500
      minWidth: "142px"
      minHeight: "83px"
      textDecoration: "none"
      boxShadow: "none"
      fontFamily: "Orbit"
      fontFallbacks:
        - "Orbit"
        - "Orbit Fallback"
      css: "box-sizing: border-box; display: inline-block; min-width: 142px; min-height: 83px; background-color: transparent; color: #edebe7; border: 1px solid #0f0f0f; border-radius: 0px; padding: 0px 16px; font-size: 11px; font-weight: 500; font-family: Orbit, \"Orbit Fallback\"; text-decoration: none;"
    link:
      backgroundColor: "transparent"
      color: "#edebe7"
      borderColor: "transparent"
      borderRadius: "0px"
      borderWidth: "0px"
      borderStyle: "none"
      padding: "0px"
      fontSize: "11px"
      fontWeight: 400
      minWidth: "0px"
      minHeight: "0px"
      textDecoration: "underline"
      boxShadow: "none"
      fontFamily: "Orbit"
      fontFallbacks:
        - "Orbit"
        - "Orbit Fallback"
      css: "color: #edebe7; font-size: 11px; font-weight: 400; font-family: Orbit, \"Orbit Fallback\"; text-decoration: underline;"
  card:
    backgroundColor: "#000000"
    borderColor: "#374151"
    borderRadius: "8px"
    borderWidth: "1px"
    borderStyle: "solid"
    padding: "16px"
    boxShadow: "none"
    textColor: "#edebe7"
    css: "background-color: #000000; color: #edebe7; border: 1px solid #374151; border-radius: 8px; padding: 16px;"
---

# Overview

BlenderHunt is a dark, terminal-inspired marketplace UI for Blender creators. The visual language is high-contrast, compressed, and futuristic: black surfaces, orange signal accents, fine borders, and mono labels layered over a cinematic hero image. Use the system to communicate urgency, curation, and live commerce activity.

## Design principles
- Prioritize dense information with clear hierarchy.
- Use orange sparingly as a status, CTA, and signal color.
- Keep surfaces flat and mostly black; avoid soft UI chrome.
- Mix Orbit for editorial content and JetBrains Mono for system labels, stats, and action blocks.

# Colors

## Core palette
- **Primary / signal:** `#f9752f`
- **Secondary / text:** `#edebe7`
- **Tertiary / divider:** `#0f0f0f`
- **Neutral / background:** `#000000`
- **Surface:** `#000000`
- **On-surface:** `#edebe7`

## Usage guidance
- Use `primary` for active states, CTA fills, prices, live indicators, and highlighted numerals.
- Use `secondary` for body text and readable labels on dark surfaces.
- Use `tertiary` for hairline borders, separators, and subdued UI framing.
- Keep most panels and cards on black; do not introduce gray surfaces unless needed for accessibility.
- Reserve `error` for true failure states only.

# Typography

## Type system
- **Orbit** drives the brand voice: headlines, descriptive copy, and general interface text.
- **JetBrains Mono** drives terminal cues: labels, stats, button text, timestamps, and feed metadata.

## Recommended tokens
- `headline-display`: 24px Orbit, 400, tight cadence for hero statements.
- `headline-lg`: 22px Orbit, 400, slightly expanded tracking.
- `headline-md`: 20px Orbit, 400, section titles and featured content.
- `body-lg` / `body-md`: 16px Orbit, 400, primary paragraph copy.
- `body-sm`: 11px Orbit, 400, compact supporting text.
- `label-lg` / `label-md`: 11px JetBrains Mono, 500, uppercase or system labels.
- `label-sm`: 11px JetBrains Mono, 400, metadata and secondary system text.

## Rules
- Keep headline casing consistent with the screenshot: uppercase or near-uppercase hero treatment is appropriate.
- Use monospace for anything that implies system state, indexing, channels, or feed numbering.
- Avoid modern sans-serif UI defaults; the brand depends on Orbit’s geometric, sci-fi feel.

# Layout

## Structure
- Favor a full-bleed hero with layered content over imagery.
- Use a centered or left-biased hero copy block and a floating feed panel or catalog module on the right.
- Below the hero, use a tabbed category bar followed by compact stat tiles and feed sections.
- Maintain a strong vertical rhythm with frequent horizontal rules, thin dividers, and compact gutters.

## Spacing
- Use the provided spacing scale exactly for internal gaps:
  - `xs`: 2px
  - `sm`: 10px
  - `md`: 20px
  - `lg`: 24px
  - `xl`: 40px
- Prefer `md` and `lg` for card internals; use `xl` to separate major page bands.

## Composition
- Keep content blocks rectangular and tightly aligned to a grid.
- Use narrow columns for labels and broader columns for hero copy or product lists.
- Allow imagery to dominate the hero, but ensure text remains readable through overlays and contrast management.

# Elevation & Depth

- Depth is subtle and signal-based rather than soft and blurred.
- Primary button shadow creates a neon-like glow and should be used only for the main CTA.
- Cards generally remain flat with no shadow, relying on borders and contrast.
- Use `sm` and `md` shadows only for status emphasis or live-feed panels; do not layer multiple glow effects on the same element.
- Avoid rounded, floating, glassmorphism-style elevation.

# Shapes

- Shapes are mostly rectangular with zero-radius or very slight rounding.
- Use `rounded.none` and `rounded.sm` for most buttons, tags, and chips.
- Use `rounded.md` / `rounded.lg` only when a card requires a softer container edge.
- Do not use pill shapes for primary UI unless the interaction is clearly a capsule tag or badge.
- Borders should feel technical and precise, not decorative.

# Components

## Buttons
- **Primary button:** solid orange fill, black text, sharp corners, mono label, and glow shadow. Use for the main action only, such as “Get Started” or “Search”.
- **Secondary button:** transparent fill, subtle dark border, light text, mono or Orbit label depending on context.
- **Link button:** no border, underlined text, minimal spacing. Use for tertiary actions and inline navigation.

## Cards
- Black card background, thin dark border, 8px radius, 16px padding, no shadow.
- Best for feed entries, catalog items, stat modules, and support blocks.
- Keep card content compact and high-density.

## Marketplace feed rows
- Include rank, thumbnail, title, category, and price.
- Align prices to the right and color them with `primary`.
- Use small caps or uppercase system labels for category metadata.
- Make rows feel live and sortable, not like generic product list items.

## Search blocks
- Use a mono prefix label such as `QUERY//` paired with a dark input field and orange CTA button.
- Inputs should be wide, low-profile, and framed by thin borders.
- Placeholder text should be subdued but legible against black.

## Tabs and filters
- Use text-only category tabs with a single orange underline or active marker.
- Keep inactive tabs muted; active tabs should be readable without heavy fill.
- Tabs should not become chunky pills.

## Stat tiles
- Use compact bordered tiles with small labels and large numeric values.
- Highlight key counts in orange when they represent live or important metrics.
- Keep numbers visually dominant over captions.

## Tickers and banners
- Use repeating microcopy sparingly to simulate activity.
- Ticker text should be low-contrast and compact, with occasional highlighted segments.

# Do's and Don'ts

## Do
- Do use black backgrounds, orange accents, and thin borders for the entire interface.
- Do keep typography compact and intentionally technical.
- Do use Orbit for narrative copy and JetBrains Mono for system labels.
- Do emphasize live commerce signals: “live,” “streaming,” “network load,” “uplink,” and counts.
- Do align prices, indices, and metadata with strict grid discipline.
- Do treat CTAs as rare, high-importance objects.

## Don't
- Don't introduce soft gradients, pastel surfaces, or glossy skeuomorphic effects.
- Don't use rounded pills, floating cards, or large shadows as a default pattern.
- Don't rely on centered marketing layouts with lots of whitespace; this product is dense and operational.
- Don't use a generic app font stack or heavily varied type scales.
- Don't make orange the dominant page background or use it for body text blocks.
- Don't blur the distinction between editorial headlines and system labels.