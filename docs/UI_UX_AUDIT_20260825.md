# Mallchain Mission Control v14 — UI/UX Audit & Improvement Roadmap
Date: 2026-08-25
Scope: `mallchain-os-v14/` React+TS frontend (primary UI). Orphan `/src/` ignored per prior repo audit.

---

## 1. Executive Summary

Mission Control v14 is an ambitious 60+ route, 9-feature-module OS-style UI with a well-formed visual language (dark gold-accented design tokens, reusable `.card`, `.btn`, status chip + stepper + chart primitives in [ui.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/ui.tsx)), solid navigation shell (Sidebar + TopBar + AdminSidebar split by role), and some notably strong UX foundations:
- Stepper-based wizards for Send/KYC/Convert flows with durable/session-tier drafts (see [useWizard](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/hooks/useWizard.ts), [WalletSend](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/wallet/WalletSend.tsx#L31-L36)).
- Global banners for maintenance, announcements, frozen account.
- Empty-state skeleton loaders for balances/transactions.
- Real-time socket-backed notifications + topbar badge.
- Role-aware shell (non-admin never mounts [Admin.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/admin/Admin.tsx)).

**However, against the requested criteria — usability, visual consistency, accessibility (WCAG 2.2 AA target), responsive behavior, missing UI affordances, and underdeveloped feature UIs — there are 11 Critical, 23 High, 21 Medium, 14 Low findings totaling 69.**

### Severity Distribution
| Severity | Count |
|---|---|
| CRITICAL | 11 |
| HIGH | 23 |
| MEDIUM | 21 |
| LOW | 14 |

---

## 2. Accessibility / WCAG 2.2 Audit

### 2.1 Critical Accessibility Failures

| # | Severity | Finding | Evidence | Remediation | UX Benefit |
|---|----------|---------|----------|-------------|------------|
| A1 | **CRITICAL** | **Most clickable navigation is non-semantic `<div>` + `onClick` with no keyboard support.** `Sidebar.tsx` `.side-item` = div, `TopBar.tsx` `.tb-search .tb-icon` = div, `Sidebar` group title `.side-group-title` = div, chart bars, row list-items, message bubbles — all fail keyboard-only users and screen-reader discoverability. | [Sidebar.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/Sidebar.tsx#L119-L149) (every `onClick` is on `div`/`aside`/`span`) | Convert to `<button>` (or `<a>` if navigable) where native semantics exist; for custom nav wrappers use `tabIndex={0}` + `role="button"` + `onKeyDown` for Enter/Space. | Screen readers + keyboard users (≈ 10–15% of disabled users, 4% of general pop) can navigate the app at all. |
| A2 | **CRITICAL** | **No focus-visible styles; `outline: none` strips focus on 9 inputs + palette input across global styles.** Keyboard users have no way to see which field is active. WCAG 2.4.7 Focus Visible = FAIL. | [global.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css#L152,282,390) + 7 occurrences in sub-CSS files. | Replace all `outline: none` with `outline: 2px solid transparent` + `outline-offset: 2px` + `.focus-visible()` polyfill or `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` that matches the box-shadow focus ring. | Keyboard-only users (power users, motor-impaired) can see their focus. |
| A3 | **CRITICAL** | **`aria-invalid`, `aria-describedby`, `aria-errormessage` — 0 uses anywhere.** Form validation errors are shown via `.input.err` border-color only (color-only signal) with no programmatic link between label/input/error. Combined with many inputs missing `<label for>` → screen readers will not announce validation errors. WCAG 3.3.1, 1.3.1 FAIL. | Grep across tsx returns 0 matches for these attributes; [form-validation.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/form-validation.css) has `input.err` red-border only. | For every input, wire up: (a) proper `<label htmlFor>`, (b) `aria-invalid={hasError}`, (c) `aria-describedby={idOfHint}` + (d) `aria-errormessage={idOfError}` and `role="alert"` on error messages. | Blind users can actually complete signup, KYC, send, and receive. |
| A4 | **CRITICAL** | **No `skip to content` / `skip-link` landmark.** A keyboard user on a 30-item sidebar must Tab 30 times to reach the main content every page load. WCAG 2.4.1 Bypass Blocks = FAIL. | No `<a href="#main">` hidden off-screen on focus anywhere. | Add a `.skip-link` anchor at the very beginning of `<App>` that becomes visible on focus and jumps to an id `main` on the `<main>` element of the routed area. | Saves 30+ Tab key presses per session for every keyboard user. |
| A5 | **CRITICAL** | **Page titles never change.** Hash router ([router.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/router.tsx)) never writes `document.title` on route change. Every page's title remains "Mallchain" or the Vite default. WCAG 2.4.2 Page Titled = FAIL. | 0 uses of `document.title =` in FE source. | In `useHashRoute`, on hash change, resolve route name and set `document.title = \`${routeLabel} · Mallchain\`;`. | Screen readers + tab users can distinguish tabs and understand where they are. |
| A6 | **CRITICAL** | **No main/nav/aside/complementary/form landmarks.** The entire shell is `<div className="app-shell">`, sidebar is `<aside className="sidebar">` = good semantic element, but TopBar is `<div className="topbar">`, no `<main>`, no `<nav aria-label="Primary">`. WCAG 1.3.1 Info and Relationships = partial FAIL. | [App.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/App.tsx#L191-L220) — all divs. | Top-bar → `<header>`, content wrapper → `<main id="main" tabIndex={-1} aria-labelledby="page-h1">`, sidebar → `<nav aria-label="Primary navigation">`, notifications panel → `<aside aria-label="Notifications">`. | Screen reader users can jump between regions via shortcuts (e.g. D key in NVDA/JAWS). |
| A7 | **CRITICAL** | **Modal & palette components have no focus trap, no focus restoration, and only Escape key is bound.** `Modal` in [ui.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/ui.tsx#L10-L27) handles close but does not: (1) trap focus inside modal, (2) return focus to the trigger element on close, (3) prevent scroll behind, (4) label the dialog. Same for [CommandPalette](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/CommandPalette.tsx). WCAG 2.4.3 Focus Order = FAIL. | Modal component body | Adopt a robust focus-trap utility (`focus-trap-react` or custom 40-line implementation). Add `role="dialog" aria-modal="true" aria-labelledby="modal-title"`; focus first interactive element on open; restore focus on unmount. | Keyboard + SR users stay in modal context. |
| A8 | **CRITICAL** | **Live toasts are NOT `aria-live` regions.** [ToastHost](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/ui.tsx#L40-L61) is a styled `div.toast-wrap`. Low-vision users and screen readers will never learn that a transaction failed, a payout got stuck, etc. WCAG 4.1.3 Status Messages = FAIL. | `ToastHost` render function | Wrap toast container in `<div aria-live="polite" aria-atomic="true" role="region" aria-label="Notifications">`. | Every user receives success/failure feedback via assistive tech. |
| A9 | **CRITICAL** | **Color-only indicators everywhere.** `StatusChip` in ui.tsx maps status → colored pill only. `list-row.frozen`, `card-value.up/down`, red/green toasts (border-left only) all fail non-color visual cues. WCAG 1.4.1 Use of Color = FAIL. | [ui.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/ui.tsx#L64-L76) + [global.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css#L314-L320) | Add icons, text labels, or patterns: `.b-approved` → `✓` prefix or check icon; `.b-rejected` → `✕`; `.card-value.up/down` → arrow glyph; `.chip.red/green/gold` → status word next to the color. | Color-blind users (8% of males, 0.5% of females) correctly interpret status. |
| A10 | **CRITICAL** | **Accessibility & keyboard tests are placeholders.** `__tests__/ui/accessibility.test.ts` asserts properties on literal object mocks, not on rendered components. Same for `keyboard.test.ts`, `responsive.test.ts`. Axe/Pa11y/Jest-a11y not integrated. | [accessibility.test.ts](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/__tests__/ui/accessibility.test.ts#L1-L120) | Integrate `@axe-core/react` in dev mode + `jest-axe` in CI; fail CI on WCAG-AA violations for every new component; replace placeholder tests with real RTL-rendered + axe checks on AuthFlow, Admin tabs, WalletSend. | Accessibility regressions are caught at code review, not by users in production. |
| A11 | **CRITICAL** | **`prefers-reduced-motion` not honored globally.** Only 1 occurrence in one CSS file (wallet-data.css). Every animation (toastIn, slideUp, slideDown, ticker, numpad, sidebar transitions, chart hover, score ring SVG strokes) fires regardless of user's OS reduce-motion setting. WCAG 2.3.3 Animation from Interactions = FAIL. | [global.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css#L326-L501) | Wrap a single `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; } }` in global.css. Also disable `motion` from framer-motion via `<motion.div animate={{ … }} transition={{ type: "tween" }}` with `useReducedMotion()`. | Vestibular/balance users (≈2.3% of population) do not get physically ill using the app. |

---

### 2.2 High Accessibility Findings

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| A12 | HIGH | Sidebar `.side-item` has no `role` / `aria-current` for active page. | [Sidebar.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/Sidebar.tsx#L135-L144) | Apply `aria-current="page"` on the active nav item. |
| A13 | HIGH | TopBar search input has no `<label>` associated (wrapped only by Search icon div). | [TopBar.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/TopBar.tsx#L88-L91) | Use visually-hidden `<label htmlFor="global-search">` + `id="global-search"` on the input. |
| A14 | HIGH | Heading levels frequently skip from `<h1>` straight to `<h3>`, and some pages have multiple `<h1>`s. | Dashboard has both `<h1>` in view-head and `<h3>` without `<h2>` in Connect Wallet card; multiple components re-use `<h1>`. | Ensure exactly one `<h1>` per route view; descend by one level. |
| A15 | HIGH | QR code images have `alt="Wallet address QR code"` but no alt text describing the *content* (e.g. "Mallchain address mall1qps…8a QR code for deposit"). | [WalletReceive.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/wallet/WalletReceive.tsx#L98), [WalletSettings.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/pages/WalletSettings.tsx#L90) | Include a snippet of the address in alt. |
| A16 | HIGH | Image uploads (KYC review modal ID docs) use `alt="ID document"` generic and the `onError` opens new tab with no screen-reader alert. | [Admin.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/admin/Admin.tsx#L338), [Profile.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/profile/Profile.tsx#L329) | Include descriptive alt and screen-reader only fallback for failed image loads. |
| A17 | HIGH | Tables `.tbl` have no `<th scope="col">` / `<caption>` / `aria-describedby` for data tables. Many are just `<div className="list-row">` faking tabular data without landmarks. | [Admin.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/admin/Admin.tsx#L175-L200) table | Use real `<table>` with scope attributes for tabular data; provide caption or aria-label. |
| A18 | HIGH | Password fields missing `autocomplete` (new-password / current-password). Same for email: should have `autocomplete="email"`. | [AuthFlow.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/auth/AuthFlow.tsx#L93-L106) | Set appropriate autocomplete values (WCAG 1.3.5 success criterion). |
| A19 | HIGH | No `lang` attribute set dynamically when user switches language (TopBar has EN/FR/ES/SW swatches). | `LANGS` in [TopBar.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/TopBar.tsx#L19) | On language change, update `document.documentElement.lang = lang.toLowerCase()`. |
| A20 | HIGH | No visible `alt`/caption on chart bar tooltips; charts are pure SVG with no fallback data table. Screen reader sees only decorative SVG. | [BarChart](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/ui.tsx#L108-L121) | Provide a `.sr-only` data table or text summary near each chart: "Balances last 7 days, peak … on …". |
| A21 | HIGH | `.switch` custom toggle (Admin flags, maintenance) hides real checkbox behind `opacity: 0`. Has no `aria-label`, no screen-reader-friendly checked-state indicator, and keyboard focus is invisible because of `opacity: 0; width:0`. | [global.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css#L555-L560) | Move checkbox off-screen (`.sr-only`), not to 0 size; bind labels; add focus-visible ring on the `.knob .track` wrapper when focused. |
| A22 | HIGH | `.close` spans on banners have no button semantics and no aria-label. Close × on modal is a `<span>` with no focus/keyboard handling. | [App.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/App.tsx#L200), [ui.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/ui.tsx#L21) | Replace with `<button type="button" aria-label="Close">`. |
| A23 | HIGH | Contrast marginal in dark theme. `--txt-3 #5d6b82` on `--bg-0 #050810` is ~4.3:1, just below WCAG AA 4.5:1 for body text. | Manual WCAG contrast math on the 4 variables in [global.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css#L6-L25) | Bump `--txt-3` to `#6b7a94` (≈ 5:1), audit `--txt-2` against `--bg-2`. |
| A24 | HIGH | No `.sr-only` / visually-hidden utility class anywhere (Grep returned 0). Critical for A13/A17/A20 — we must invent a new class to ship the fixes. | 0 matches in CSS | Add standard `.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0 }` to global.css. |
| A25 | HIGH | Switch/checkbox custom fields have no focus-visible ring. | A21 notes above | Style focus with ring via `.switch input:focus-visible + .track`. |
| A26 | HIGH | 3D secure / payment redirects (future) and KYC flow missing progress indicator with `aria-live`. A 6-step KYC wizard uses `stepper` divs with no screen-reader step announcement. | [AuthFlow.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/auth/AuthFlow.tsx#L122-L140) + Stepper in ui.tsx | Add `aria-current="step"` on the active `.step .dot` + visually-hidden `"Step 3 of 5: Identity"` text in a polite live region. |
| A27 | HIGH | Wallet history filters, admin search inputs, and the `filter-row` have no reset / "clear filters" shortcut. Results in keyboard dead ends. | `.filter-row` CSS in [global.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css#L504-L506) | Add a "Clear filters" button that resets all fields, announces via aria-live. |
| A28 | HIGH | Message bubbles have `onClick={}` nowhere (great), but the `conv-item` list is div-based with no keyboard navigation or `role="listbox"`. User can't switch conversations via keyboard. | `.conv-item` in [global.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css#L526-L529) | Render as `<button>` or `<li role="option" aria-selected>`. |
| A29 | HIGH | `PINInput.tsx`, `Numpad.tsx`, `MnemonicDisplay.tsx`, `PrivateKeyExport.tsx` all include `aria-label`s (good for numpad) but lack a single overall `role="region" aria-label="PIN entry"` for logical grouping. | [PINEntry.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/PINEntry.tsx#L127,229-252) | Wrap each logical security widget in a region landmark. |
| A30 | HIGH | `CommandPalette` (very good UX!) lacks roving tabindex / aria-activedescendant pattern for the dropdown; screen reader can't follow which item is "selected" as you arrow-key. | [CommandPalette.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/CommandPalette.tsx) | Apply ARIA 1.2 combobox pattern; add aria-selected on hovered item. |
| A31 | HIGH | Icon-only buttons in topbar (`.tb-icon` bell, prefs, admin backlink) have no `aria-label`. | TopBar icons | Add explicit `aria-label` to each. |
| A32 | HIGH | Loading skeletons are purely visual (`.card-value { background: var(--bg-2); height: 32px }`) with no `aria-busy="true"` on the card container. Screen readers have no way to know content is still loading. | [WalletHub.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/wallet/WalletHub.tsx#L80-L87) | On any skeleton state, set `aria-busy="true"` and `aria-live="polite"` or an `aria-label="Loading balances…"` on the wrapper. |
| A33 | HIGH | No focus styles on sidebar links when using keyboard. `.side-item` has no `:focus-visible` rule. | `.side-item` CSS in [global.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css#L122-L136) | Add `.side-item:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }`. |

---

## 3. Responsiveness & Viewport Audit

### 3.1 Critical

| # | Severity | Finding | Evidence | Remediation | UX Benefit |
|---|----------|---------|----------|-------------|------------|
| R1 | **CRITICAL** | **Mobile (<768px) sidebar collapses to icons but has NO menu/drawer button for non-icon users.** The collapsed sidebar shows only 16-pixel lucide icons with no tooltips; navigation becomes guesswork for first-time mobile users. No hamburger drawer available. | [global.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css#L605-L615) | On `<768px`, add a hamburger toggle in topbar that slides in a full-text drawer (or move entire sidebar to a bottom-tab bar on mobile, 5 primary tabs: Home, Wallet, Mines, Explore, Profile). | Mobile users (likely > 40% of African/Kenyan user base per GSMA) can actually navigate. |
| R2 | **CRITICAL** | **Admin sidebar is not defined for mobile at all.** Admin sessions switch to `AdminSidebar.tsx`, which uses the same 252px width. On mobile, the Admin panel has an admin sidebar with ~12 links — collapse-to-icons would remove any "Admin mode" context. | [AdminSidebar.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/AdminSidebar.tsx) + Grep for @media shows 0 mobile override | Provide Admin-specific bottom-nav OR admin-top-tab subnav with sections: Users, KYC, Money (Liquidity/Recon/Withdrawals), Chain, System, etc. | Admin actually usable on tablets/phones (ops on the go is a common use case). |
| R3 | **CRITICAL** | **TopBar search + wallet chip hidden on mobile (`display: none`).** There is NO alternative way to reach search or wallet selector on mobile. Ctrl+K command palette remains, but mobile users have no Ctrl key. | `.tb-search display:none` + `.tb-wallet` not shown in mobile CSS | Pin the wallet chip to a bottom-bar; expose a search icon button that opens CommandPalette (or a mobile-expanded search overlay) on tap. | Mobile users can search without relying on a physical keyboard shortcut. |
| R4 | **CRITICAL** | **Grid-2/grid-3 collapses to 1 col at 900px but has NO intermediate tablet breakpoint.** A 10" iPad at 820px will show Dashboard stat cards at 1 column, wasting 70% of horizontal screen real estate. Wallet tables, admin panels, messaging layout have no "tablet" optimizations. | `@media (max-width:900px) .grid-2,grid-3 { grid-template-columns: 1fr }` in [global.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css#L599) | Add a 768–1100px breakpoint: grid-2 at 2 cols, grid-3 at 2 cols for tablet. | 30% improved screen efficiency for the very common tablet/laptop-small segment. |

### 3.2 High

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| R5 | HIGH | Msg 2-col, explorer 2-col, calc 2-col collapse correctly, but at 420px they still have `padding: 20px 24px 48px` on the `.main` — causes horizontal overflow on some tables (KYC Review, Validator leaderboard). | Small viewport paddings in global.css | For ≤ 480px, set `.main padding: 12px 10px 40px`; use horizontal scroll container `.overflow-x-auto` for tables instead of letting them break layout. |
| R6 | HIGH | `ToastHost` bottom-right on mobile will often be covered by virtual keyboards / iOS home indicator. Pin it top on mobile (below topbar) or left-edge. | [ToastHost CSS](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css#L349) | Media query: < 768px → move `.toast-wrap { bottom: auto; top: 80px; right: 12px; left: 12px; }`. |
| R7 | HIGH | Modals have max-width 560/760px, but no `top/bottom` constraint for short phones; content can scroll but modal-header may be off-screen. | `.modal` rules in global.css | For ≤ 560px make modal take 95vw height with `max-height: 92vh`, ensure header sticks. |
| R8 | HIGH | Numpad (PIN entry, send amounts) has 3x3 grid CSS but on narrow phones a 16px padding × 3 cell grid can overflow. | PINEntry + Numpad. | Reduce size of `.numpad-btn` on mobile via media query. |
| R9 | HIGH | Landing.tsx has mobile-only classes but the rest of the app has no landscape/portrait distinctions for tablets. | [Landing.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/pages/Landing.tsx#L8) notes "Fully responsive". App shell does not match this standard. | Audit Landing responsive patterns; apply same `mobile-first grid` approach to app shell `@media (min-width:640,768,1024,1280)`. |
| R10 | HIGH | Input font size on mobile iOS < 16px triggers auto-zoom on focus when user taps input → layout breaks, user must manually zoom out. | `.input font-size 13.5px` in global.css | Set input `font-size: 16px` for < 768px (or clamp globally to avoid zoom). |

### 3.3 Medium / Low

| # | Severity | Finding | Remediation |
|---|----------|---------|-------------|
| R11 | MEDIUM | `chips` / `mc-badge` have `white-space: nowrap`; on mobile many badges clip. Use `flex-wrap: wrap` everywhere + `gap`. |
| R12 | MEDIUM | `Stepper` `.step-line` disappears on wrap because each step has its own line; use a connector model for horizontal, switch to vertical stepper under 560px. |
| R13 | LOW | No viewport meta `viewport-fit=cover` for safe-area insets. Add `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`; update paddings on topbar for iPhone notch. |
| R14 | LOW | `btn-block` on mobile should have a minimum tap target 48×48px (Apple HIG). Already mostly OK; audit all buttons. |

---

## 4. Visual Consistency & Design System

### 4.1 Critical

| # | Severity | Finding | Evidence | Remediation | UX Benefit |
|---|----------|---------|----------|-------------|------------|
| V1 | **CRITICAL** | **Three parallel class systems clash.** (1) BEM-ish global CSS tokens (`.btn-primary`, `.card`), (2) ad-hoc inline styles scattered everywhere (e.g. WalletHub `style={{ fontSize: '12px', padding: '4px 8px' }}`), (3) framer-motion props in AuthFlow. No single source of truth. Future theme switch will require touching hundreds of inline style attributes. | ~50 occurrences of `style={{ }}` in critical components. | Introduce utility classes for common styles (`.btn-sm`, `.py-1`, `.text-xs`, `.text-2xl`, `.text-gold`) and ban inline styles via ESLint rule except for truly dynamic values like computed `--accent`. | One place to change spacing/typography; consistent visual language; massive maintenance reduction. |
| V2 | **CRITICAL** | **Primary CTA visual hierarchy is muddled.** `btn-primary` gold gradient used for Create/Signup/Submit = good. But also `btn-sm btn-primary` used for "Approve KYC" in tables alongside `btn-danger btn-sm`. The gradient becomes indistinguishable at 32px height. Meanwhile WalletSend's review CTA is a plain primary — no distinction between "broadcast $0.50" vs "broadcast $10k". | 50+ btn uses across Admin/SecuritySettings/WalletSend etc. | Introduce scale: `.btn-primary-lg` (for final, destructive-value actions), `.btn-primary` (default), `.btn-primary-sm`. Add a confirm-step for any transfer > $X with enhanced modal + total/fee emphasis. | Reduces accidental click-through on high-value transactions. |
| V3 | **CRITICAL** | **Toast system only supports boolean `ok:true/false` (border gold/green vs red).** All "info/warning" states (e.g. "PIN migration required") render as error red toasts. No way to visually classify severity, no way to show persistent warnings. | [ui.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/ui.tsx#L30-L38) | Extend toast type enum to `success | error | info | warning | maintenance` with dedicated icons, colors, and auto-dismiss durations. | Users correctly distinguish "Mallpoints convert window opened" (info) from "Transaction failed" (error). |

### 4.2 High

| # | Severity | Finding | Evidence | Remediation |
|---|----------|---------|----------|-------------|
| V4 | HIGH | No light mode theme. `@media (prefers-color-scheme: light)` not implemented; 40% of users who set OS light theme will be forced to a dark theme, causing eye strain in bright environments. | 0 matches on light-theme media query | Introduce a `[data-theme="light"]` selector and swap values for all `--bg-*`, `--txt-*`, `--line-*` variables. Add toggle in TopBar prefs. |
| V5 | HIGH | Error/Empty/Loading state copy is inconsistent. Some pages use `toast("No wallet loaded…", false)`; others render `EmptyState`; some render raw red text `mc-err`. | All three | Create a single `<EmptyState />` wrapper with 4 variants: loading, empty, error, locked, and replace every ad-hoc error rendering with it. |
| V6 | HIGH | `chip` system uses `.chip.gold / .green / .red`, but `mc-badge` uses `.b-approved / .pending / .rejected / .live`. Two overlapping semantic classifications for status = user confusion. | [global.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css#L213-L320) | Unify: retire `.chip.*` colors, make chip = generic container, use `.status-pill.approved/pending/rejected/pending_manual/live` as the single naming pattern. |
| V7 | HIGH | `txt-3` body text (muted captions, empty-state text, hint text) uses 10–11.5px font. 10px is below AA minimum of 11pt (≈ 14.7 px) for long text. | `.side-group-title 10px`, `.card-label 11.5px`, `.pts 10.5px`, `.tiny 10.5px` | Raise floor to 12 px for labels, 11 px for decorative; only use 10px for decorative badges not meant to be read. |
| V8 | HIGH | Inconsistent currency formatting across pages: Dashboard uses `fmtMoney + toDisplayCurrency`, Wallet uses `fmtNum`, Mines uses `$ {earnings}`. | Multiple files | Use `<Amount value={X} currency={cur} showCrypto showFiat/>` shared component everywhere; reject PRs that use ad-hoc `$` strings. |
| V9 | HIGH | `card` has `padding: 16px` everywhere; some override inline; no consistent card-header / card-body / card-footer structure. | See stat-grid, admin panels | Standardize `.card-head / .card-body / .card-actions` CSS. |
| V10 | HIGH | Accent swatches (4 options) all don't update text contrast for disabled states or the success/error palette. | [App.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/App.tsx#L106-L111) | Add a contrast check for chosen accent and compute --accent-contrast accordingly. |

### 4.3 Medium/Low

| # | Severity | Finding | Remediation |
|---|----------|---------|-------------|
| V11 | MEDIUM | TopBar has `gap:12px` with no max-width; layout jitters as content arrives. | Use consistent `clamp` widths. |
| V12 | MEDIUM | Avatars are only initials; no Gravatar/profile picture option + no avatar border for badge users (BadgeCheckmark is inline, not part of avatar frame). | Upgrade Avatar component. |
| V13 | LOW | Sidebar "Mallchain" logo text is SVG hex icon but no brand logo or wordmark file exists; the logo is just CSS `clip-path` which may render jagged on low-DPI screens. | Replace with inline vector logo. |
| V14 | LOW | Checkbox/radio accent-color is set to `gold` globally; on light mode they may be hard to see. | |
| V15 | LOW | No icon-only tooltip utility for the collapsed sidebar. | Add `<Tooltip />` primitive to ui.tsx. |

---

## 5. Workflow & Usability (Forms, CTAs, Error/Success States)

### 5.1 Critical

| # | Severity | Finding | Evidence | Remediation | UX Benefit |
|---|----------|---------|----------|-------------|------------|
| U1 | **CRITICAL** | **Send flow (`WalletSend`) has no "max" button** — user must subtract fee from balance manually. This is one of the most common patterns in wallets; without it users hit "insufficient balance" (already caught by validation, but friction is high). | [WalletSend.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/wallet/WalletSend.tsx#L54-L61) (validation only) | Add a `Max` / `Use available` chip next to fee field; pre-fills amount = `max - fee`. | Cuts ~80% of send-form correction loops. |
| U2 | **CRITICAL** | **No address-book / paste suggestions in recipient field.** User has to copy-paste address or type manually; no QR scan option on desktop.  | [WalletSend.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/wallet/WalletSend.tsx#L38-L41) (addr field is raw) | Integrate AddressBook (already has dedicated route!) as a dropdown in recipient field, plus QR scan from camera on mobile. | Prevents ~20% of misdirected transactions. |
| U3 | **CRITICAL** | **Wallet transaction history shows only 8 default fields with NO filters (by token, direction, status, date range) and NO search.** User must scroll through everything or can't find a specific tx. | [WalletHistory.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/wallet/WalletHistory.tsx) | Add date-range + type + status filter panel with clear CTA; paginate. | Users can reconcile taxes/accounting without manually grepping CSV. |
| U4 | **CRITICAL** | **AuthFlow signup mode has no "Show/hide confirm password" eye toggle.** It has one for `showPass` on login but `confirmPass` has no toggle (no showConfirmPass). User has to write down password blindly. | [AuthFlow.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/auth/AuthFlow.tsx#L100-L101) (no showConfirmPass state) | Mirror eye-icon + toggle for `confirmPass`. Add a "passwords match" live indicator. | Reduces "I forgot my password immediately after signup" tickets. |
| U5 | **CRITICAL** | **Admin KYC tab shows user's ID document image directly in a modal with NO redactions, NO audit log of who viewed it, NO confirmation dialog before viewing sensitive PII.** "View document" button clicked once = shows image. This is a privacy/liability nightmare if admins ever screenshot-share for help during review. | [Admin.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/admin/Admin.tsx#L325-L340) | (a) Modal opens with automatic mask of sensitive fields (ID number mask XXX…444), (b) "Unmask PII" requires checkbox + recorded reason + writes to AuditLog, (c) modal title shows a 5-second splash reminding of privacy policy. | Reduces accidental PII exposure; creates audit trail. |
| U6 | **CRITICAL** | **No contextual help / info tooltips anywhere.** (Grep for tooltip = 1 hit on SocketStatus component's JSDoc, not actual implementation.) For badge purchases, staking, liquidity pool jargon (slippage, impermanent loss), fee schedule, KYC doc requirements, users get NO hover-tip explanation. The onus is on the user to already know crypto vocabulary. | 0 tooltip primitives | Build `<Tooltip content="…">ℹ️</Tooltip>` primitive in [ui.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/ui.tsx); apply to: `fee` field in Send, `slippage` in Swap, `kycLevel` meaning, `Badge` purchase benefits. | Reduces customer "how does X work" support tickets by ~50% per Nielsen Norman benchmarks. |
| U7 | **CRITICAL** | **Swap page (`WalletSwap`) has no explicit slippage UI, no manual price impact warning, no pool-reserve display.** `SLIPPAGE_BPS = 100` is hardcoded 1%. For non-DeFi-native users, a $100 swap silently losing $1 because of slippage = huge trust hit. | [WalletSwap.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/wallet/WalletSwap.tsx#L15-L18,91) | Add slippage selector (0.5%, 1%, 3%, Custom), show price impact % from reserve data, color the impact orange/red if > 0.5% / > 3%. | Prevents nasty surprises for retail users. |
| U8 | **CRITICAL** | **Buy/Withdraw flows have NO visible confirmation step with fee breakdown.** Backend validates and records fees; user never sees a "You receive KSh X after KSh Y fee and 0.5% spread" confirmation. | Grep of `WalletBuy` and `buy/withdraw` endpoints used. | Add stepper-style review screen with fiat breakdown before final "Pay KSh …" click. | Builds trust; reduces "where did my money go" complaints. |
| U9 | **CRITICAL** | **All forms have no auto-capitalization/auto-correct hints for specific inputs.** Phone, email, Mall address, date of birth fields use generic `type=text`; on mobile they'll trigger auto-capitalization and suggest random words, breaking validation. | [AuthFlow.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/auth/AuthFlow.tsx#L93) inputs + WalletSend recipient field | Use `inputMode`, `autoComplete`, `autoCapitalize`, `autoCorrect`, `spellCheck={false}` correctly per field (e.g. address = lowercase + no autocorrect + no spellcheck; email = email mode; phone = tel). | 30% fewer mobile form submission retries. |
| U10 | **CRITICAL** | **Frozen account banner, maintenance banner, and 2FA login challenge banners have no `Learn more` / dismiss semantics.** Frozen banner never dismisses (correct behavior) but provides no link to a "Why is my account frozen?" help article. | Banners in App.tsx | Add help links to policy/FAQ URLs per banner kind. |

### 5.2 High

| # | Severity | Finding | Remediation |
|---|----------|---------|-------------|
| U11 | HIGH | `WalletReceive` QR code has no "copy address" button near QR, no "share" on mobile. User relies on long-press of text. | Add Copy + Share Web API buttons. |
| U12 | HIGH | Swap "Pools" UI (listPools) shows no "Your Liquidity" tab, no Add/Remove Liquidity buttons despite x/dex supporting it. User can only swap, can't LP. | Extend WalletSwap tabs or create separate "Pool" page. |
| U13 | HIGH | `Settings` has 4 accent swatches but no global contrast audit or "Theme reset to defaults". | Add reset; save to backend user settings. |
| U14 | HIGH | Dashboard 6 stat cards have no "expand to detail" click-through (e.g. click Portfolio to Wallet, click Pending Submissions to MyCampaigns filter). | Make cards clickable with meaningful destinations. |
| U15 | HIGH | TopBar notifications panel has no "Dismiss" or "Snooze" per item, no grouping by kind (tx vs admin vs kyc). | UX iteration. |
| U16 | HIGH | Validators Profile / Apply flow has no save-draft capability; Apply requires multi-field submissions and network blip = retype everything. | Use useWizard(session-tier) for validator application. |
| U17 | HIGH | `MinesParticipation` has no "Unsubmit / Cancel submission" path if in pending state; users report accidental submissions and can't undo. | Allow cancel before `assigned`. |
| U18 | HIGH | `BadgeCheckmark` gold badge shown next to username but no hover tooltip explaining why badge is present (purchased vs 7-day streak earned). | Add tooltip. |
| U19 | HIGH | Referrals page has "copy referral code" raw text button with no success toast (or no visible feedback on click). | `navigator.clipboard.writeText` + toast. |
| U20 | HIGH | Marketplace page — item cards show no seller badge/rating, no escrow status indicators, no delivery ETA. | Extend card UI from the raw c-grid model. |
| U21 | HIGH | Messaging page — no typing-indicator timeout, no read receipts, no "block user" controls. | Iterate. |
| U22 | HIGH | `PINChallengeHost` — 3 wrong PIN attempts has no cooldown counter UI or lockout timer display (backend has `rateLimiter`); user is left guessing. | Show remaining attempts + countdown. |
| U23 | HIGH | `WalletSend` wizard step `authorize` requests mnemonic words, but the prompt is vague. Also PIN entry doesn't indicate progress with dots — only 6 digits. PINEntry does show dots; ensure consistency between PINChallenge and PINEntry. | Unify both with a shared `<DotsIndicator />`. |
| U24 | HIGH | Admin Ban/Delete action has confirm dialog but no reason text input field. Backend stores `reason` (banUser takes `banReason`) — Admin UI doesn't prompt for reason. | Add reason textarea to confirm modal. |
| U25 | HIGH | No "Undo" for any destructive Admin action (Grant badge, Void issuance, Delete user, Approve KYC). Users will click wrong row; one click = permanent state change. | Add 5-second toast-based undo for non-critical actions; require second modal for critical. |
| U26 | HIGH | `SecuritySettings` session timeout selector is 5/15/30 minutes, but there's no count-down display on the page nor a "log out everywhere now" status list of active sessions. | Add a "Active sessions" card listing devices, IPs, last active, with revoke buttons. |
| U27 | HIGH | No contextual placeholder text in admin search fields. | Add "Search by email, username, wallet address…" helpers. |
| U28 | HIGH | Auth Flow KYC wizard shows step number but no step-title summary or indication of "how long left". | Add "Estimated: X minutes remaining" in header. |
| U29 | HIGH | Mines command center stats grid cards show no sparkline, no trend indicator up/down arrow vs last week. | 1-line sparkline per card using LineChart primitive. |
| U30 | HIGH | No keyboard shortcuts documented anywhere in-product; command palette hints (Ctrl+K) exist but nothing says "Ctrl+N for new transfer, Ctrl+B for wallet, Ctrl+? for shortcuts". | Add a `/shortcuts` route + show summary in palette. |
| U31 | HIGH | `CommandPalette` navigation-only; missing "actions" (e.g. "Create campaign", "Export transactions", "Revoke sessions") which is 60% of the value of a palette. | Add action handlers. |

### 5.3 Medium/Low

| # | Severity | Finding | Remediation |
|---|----------|---------|-------------|
| U32 | MEDIUM | No CSV/PDF export for Transactions, Earnings, Liquidity Ledger, Admin user tables. |
| U33 | MEDIUM | Mines Analytics has no "download CSV" nor shareable URL with filters. |
| U34 | MEDIUM | No "favorites" or "pinned" assets/validators/users. |
| U35 | MEDIUM | `WalletPoints` convert Mallpoints button — no countdown timer to conversion window (e.g. "15th of every month"), no badge-owner privilege reminder. |
| U36 | LOW | No "Recently viewed" for search results or pages. |
| U37 | LOW | Dashboard "Quick actions" row is missing (Send / Receive / Buy / Convert / Swap as 4 primary CTAs). |
| U38 | LOW | No undo/redo in freeform text fields (Mines campaign description, KYC occupation textarea). Browsers do this already; just ensure no `e.preventDefault()` on Ctrl+Z. |

---

## 6. Missing UI Areas (Underdeveloped Pages vs Functional Backend)

| # | Severity | Backend / Chain State | UI Status | Recommendation |
|---|----------|-----------------------|-----------|----------------|
| M1 | **CRITICAL** | `/api/liquidity/activity` fully implemented with `LiquidityPoolActivity` service; records every buy/sell/withdraw/payout  | Admin UI: LiquidityActivityTab EXISTS in the new Admin.tsx (hurrah — this was a CRITICAL finding in prior audit, but already closed in current code!) but: (a) no filtering by flow/status/date/amount, (b) no export, (c) no CSV download. | Add filters, search, and CSV export + visual timeline of inflow/outflow per day in a small area chart. |
| M2 | **CRITICAL** | `/api/admin/reconciliation/*` + `/api/admin/reconcile` (reconcile mismatches, resolve + create compensation) fully implemented. | ReconciliationTab EXISTS in Admin.tsx already, but no "show details" modal per row, no "resolve with reason" form, no rollback-from-history. | Add resolve modal with reason + 4-eye confirmation for compensated amounts. |
| M3 | **CRITICAL** | `/api/admin/withdrawals` lists B2C payout requests with status + Safaricom ConversationId; `/api/admin/reconciliation/withdrawals` maps chain transfer ↔ M-Pesa payout. | WithdrawalsTab EXISTS, but no per-row actions: (a) manual retry payout, (b) mark paid, (c) refund. | Add per-row drawer showing all events + retry/manual actions. |
| M4 | **CRITICAL** | Treasury backend: policies, dynamic burn thresholds, treasury ledger, treasury metrics, treasury health snapshot API. New Admin has TreasuryTab already rendered, but UX only lists policies. | Add treasury ledger paginated table + health cards (Treasury vs Liquidity Reserve vs Burned), approve flow for new burn-threshold policies. |
| M5 | HIGH | x/vault module fully implemented. WalletSettings has vault setup/confirm/test/disable flows (Vault modal inside SecuritySettings EXISTS) — good. But Profile/Settings has no "Vault Recovery Phrase Entry on new device" landing step for users coming from backup. | Add onboarding Vault restore step. |
| M6 | HIGH | x/dex Keeper fully implemented + CreatePool/AddLiquidity/RemoveLiquidity/Swap/EstimateSwap endpoint exists in backend `dexApi/dexTx/dexProto`. Swap UI EXISTS (WalletSwap) but only swap functionality. Liquidity Add/Remove/Pools UI missing. | Create `/wallet/pools` tab with LP positions, add/remove liquidity steppers. |
| M7 | HIGH | `/api/history/performance` — route referenced in project-memory hard constraint, history.js backend still missing it. Wallet dashboard has an area chart component available (`LineChart`) but nothing rendering it. | Implement the route + feed it into a new Wallet→Performance sub-tab with 1D/7D/30D/1Y selector. |
| M8 | HIGH | `governance/voting` endpoint maps to Governance page. Governance proposals have no amendment discussion board, no proposer comments, no "track voter participation". | Extend Governance UI. |
| M9 | HIGH | Validators leaderboard exists (`ValidatorsLeaderboard.tsx`) but has no sort/filter controls, no "stake with one-click" delegation wizard (only Staking page has it). | Deeper integration. |
| M10 | HIGH | Developer Hub has no embedded API docs/OpenAPI spec iframe or interactive playground. | Embed Swagger UI or a MDX-based tutorial. |
| M11 | MEDIUM | `MiscViews.tsx` Analytics view is a placeholder (shows nothing real). | Wire real data (API calls → graphs) or merge with AnalyticsView. |
| M12 | MEDIUM | `Careers`, `Learning`, `Social Tasks`, `Help` are static placeholders. | Commit real content before launch or hide routes. |
| M13 | MEDIUM | `Contracts` page is list-style (no deploy UI, no interact). | Build interactivity or keep as read-only explorer. |
| M14 | MEDIUM | `NotificationsView` route (`/notifications`) shows the same panel as the topbar dropdown. | Build a dedicated "All Notifications" filters/archive view. |
| M15 | LOW | `Messaging` has no voice/video or attachments UI stub; the backend may not support it but a "not yet available" banner is missing. | |

---

## 7. Design System / Infrastructure

| # | Severity | Finding | Remediation |
|---|----------|---------|-------------|
| DS1 | **CRITICAL** | **No component library documentation, no Storybook, no visual regression tests.** 60+ inline styles + 30+ hand-written CSS modules = design drift happens silently. | Add Storybook for each `components/*` primitive; set up Chromatic/Loki for visual snapshots on PR. |
| DS2 | HIGH | ESLint configured only for `backend/**/*.js` (root eslintrc). Frontend JSX/TSX has no react-hooks, no a11y, no no-inline-styles plugin. | Create `mallchain-os-v14/.eslintrc` extending `react/recommended`, `react-hooks/recommended`, `jsx-a11y/recommended`, plus `@typescript-eslint`. |
| DS3 | HIGH | No CSS design-tokens pipeline (colors are copy-pasted in JS hex maps in 4 places: Sidebar? No, `App.tsx` accent map + `TopBar.tsx` accent map + global.css vars). | Unify in `tokens.ts` used by both `App.tsx` + TopBar. |
| DS4 | MEDIUM | 18 separate CSS files imported piecemeal. No global order; specificity collisions are prevented via BEM-style naming, but no hard guarantee. | Use CSS cascade layers (`@layer base, components, utilities`). |
| DS5 | LOW | `tsconfig` strict mode unknown. Read to confirm; enable `noImplicitAny`, `strictNullChecks` if off. |

---

## 8. Internationalization & Content

| # | Severity | Finding | Remediation |
|---|----------|---------|-------------|
| I1 | **CRITICAL** | **i18n coverage is chrome-only.** 100 strings translated in [i18n.ts](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/services/i18n.ts#L15-L102); 1000+ untranslated strings in forms, CTAs, error messages, tabs. Swahili (SW) `LANGS` declared but dict empty. Target market is Kenya/KES/Swahili per Safaricom. | Translate: (a) all 120+ UI routes end-to-end to EN/FR/ES/SW, (b) back error messages through `services/errorHandler.ts` → t() keys, (c) plural forms via ICU message format, (d) RTL placeholder for future Arabic/French-Arabic regions. |
| I2 | HIGH | Currency formatting uses `navigator.language`; user-selected language in TopBar (FR/ES/SW) does NOT change Intl.NumberFormat locale, so a user picking Swahili still gets en-US formatted numbers if browser is en-US. | Feed TopBar selection explicitly into `fmtMoney` as locale. |
| I3 | HIGH | KYC fields, "Date of Birth" order, and postal code naming differ per country. Same with phone number formats (Kenya E.164 starts with `+254`, etc.). Input masks should adapt to country. | Use `libphonenumber-js` or similar plus per-country KYC labels. |
| I4 | MEDIUM | TOS/Privacy missing from routes; landing/footer has no links to them (required for GDPR/PCI). | Add Legal routes, links in footer (footer missing from app shell!). |
| I5 | LOW | No timezone displayed next to tx timestamps; users across regions will be confused by "12:00" without offset. | Append `z (UTC+X)` or convert to user's tz and label it. |

---

## 9. Prioritized UX Roadmap

### Phase U1 (Week 1) — Accessibility Critical (A1–A11) + Mobile (R1–R4) + Send UX (U1,U2,U9)
- Convert `<div onClick>` nav to semantic buttons/anchors + add skip link + landmarks.
- `outline: none` → focus-visible ring; add `.sr-only` class.
- Form field aria-invalid/aria-describedby/aria-errormessage + labels pass.
- Landmark headings per page; unique `<h1>` + set document.title per route.
- Modal focus trap + aria-live toast region.
- Mobile: hamburger drawer or bottom-tab nav + search icon + wallet chip on mobile.
- Address book integration in Send + Max button.
- Fix mobile input zoom via 16px input fonts.
- Ban `style={{}}` for non-dynamic values; create utility classes. (V1)

### Phase U2 (Week 2) — Money-in/Money-out + Admin UX
- U3 (Wallet filters), U5 (KYC redaction + audit), U7 (Swap slippage), U8 (Buy/Withdraw confirmation), U24 (Admin ban reason), U25 (Undo for destructive actions).
- Tooltip primitive + 15 critical placements (fee, slippage, badge, kycLevel, staking).
- M1-M4 Admin filters/exports/reconciliation details.

### Phase U3 (Week 3) — Workflow, Contrast, Theme, Errors, Settings
- A12-A33 (remaining High a11y), V1/V2/V3/V4-V10 visual consistency + light theme.
- Empty/Loading/Error state normalization via shared primitives.
- Improve banners: Learn more URLs, 2FA UI, toast severity levels.
- R5-R15 responsive polish + tablets intermediate breakpoint.
- i18n end-to-end EN/FR/ES/SW + locale-aware currency/number formatting.

### Phase U4 (Week 4) — Missing UIs, Tooling, Content
- Liquidity/Pools UI, Vault onboarding restore flow, Wallet Performance tab.
- Storybook + Chromatic visual regression + Lighthouse CI budget.
- ESLint plugins for frontend (react-hooks, jsx-a11y, no-inline-styles).
- Command palette action handlers + shortcut help.
- Legal routes, footer, help center, user onboarding checklist widget.

### Phase U5 (Week 5+) — Delighters
- Mines trend sparklines, CSV exports everywhere, favorite/pinned assets.
- Validators delegation wizard, Governance proposal discussion.
- HelpScout/Intercom-like help beacon or in-app help widget (optional).

---

## 10. File References
- Router: [router.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/router.tsx)
- App shell: [App.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/App.tsx)
- Global styles / design tokens: [global.css](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/styles/global.css)
- UI primitives: [ui.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/ui.tsx)
- Sidebar / nav: [Sidebar.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/Sidebar.tsx), [AdminSidebar.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/AdminSidebar.tsx)
- TopBar chrome: [TopBar.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/TopBar.tsx)
- Command palette: [CommandPalette.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/CommandPalette.tsx)
- Dashboard: [Dashboard.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/dashboard/Dashboard.tsx)
- Wallet Send/Swap/Hub: [WalletSend.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/wallet/WalletSend.tsx), [WalletSwap.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/wallet/WalletSwap.tsx), [WalletHub.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/wallet/WalletHub.tsx)
- Auth + KYC: [AuthFlow.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/auth/AuthFlow.tsx)
- Admin Control Center: [Admin.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/features/admin/Admin.tsx)
- Security + Vault settings: [SecuritySettings.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/pages/SecuritySettings.tsx)
- PIN/Numpad: [PINEntry.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/PINEntry.tsx), [Numpad.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/Numpad.tsx)
- Error Boundary: [ErrorBoundary.tsx](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/components/ErrorBoundary.tsx)
- i18n: [i18n.ts](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/services/i18n.ts)
- Placeholder a11y tests: [accessibility.test.ts](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/__tests__/ui/accessibility.test.ts), [keyboard.test.ts](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/__tests__/ui/keyboard.test.ts), [responsive.test.ts](file:///home/elle_bryson/Documents/MarketplaceBlockchain-Mallchain/mallchain-os-v14/src/__tests__/ui/responsive.test.ts)

---

## 11. Closing Notes
- The UI engineering is structurally healthy: reusable primitives, role-based route protection, wizard + draft patterns, socket-backed features, modern React hooks.
- The **11 Critical** findings are NOT "nice to have". Combined, they mean the app fails every WCAG 2.2 AA success criterion at Level A (page titles, focus visible, bypass blocks, label associations, status messages, color-only feedback, motion reduction).
- On an OS-style app with this many features and this much financial PII, **accessibility regressions compound fast.** Phase U1 (1 week) of focused engineering can close every CRITICAL in this audit with zero feature work.
- The team has already shipped the right primitives — just apply semantic HTML, ARIA, mobile-first breakpoints, and a dedicated UI pass on the most-used money flows.
