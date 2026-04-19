# AI Morning Brief — UI Implementation Spec

> Complete handoff for Claude Code CLI. This document + the JSX files in this folder reproduce the designed UI exactly.
> Current config: **dark theme**, **navy accent (#1E3D8A)**, quiz disabled.

---

## 1. Project goal (context for the AI)

Port the V1 ntfy-pushed "AI Morning Brief" into a mobile-first **PWA** with a newspaper-editorial aesthetic. The UI is a swipeable card feed (like Tinder-meets-FT-app) where each card is one classified article. Bottom-sheet Claude chat, bookmark-to-Notion, recall quiz, weekly review.

Primary device: **iPhone, PWA added to home screen**. Use a single-column, full-viewport card layout; everything must work well on ~400px wide.

---

## 2. Visual direction

**Feel**: The Economist / FT mobile app. Newspaper masthead, high contrast, serif headlines, monospace metadata tags, restrained accent color.

**DO NOT**:
- Use gradients (except a very subtle swipe-tint overlay)
- Use emoji icons (a single 🔥 for streak is the only exception)
- Use rounded-corner containers with left-border accent (the "AI slop" look)
- Use drop shadows except under floating sheets
- Use saturated colors besides the single accent

**DO**:
- Use hairline rules (1px) to separate content sections like a newspaper
- Use "pull quote" treatment for the engineering-impact highlight (bordered box with a small overline label)
- Italic serif for summaries / "standfirst" subheads
- Uppercase monospace for metadata, section labels, buttons
- Square corners (`border-radius: 2px` max) — no pill buttons

---

## 3. Design tokens

See `design-tokens.json`. Summary:

### Fonts (load from Google Fonts)
- **Serif display & summaries**: `Source Serif 4` (weights 400, 600, 700, 900 + italics) + `Noto Serif TC` fallback for Chinese
- **Sans body**: `Inter` (weights 400, 500, 600, 700)
- **Mono metadata**: `JetBrains Mono` (weights 400, 500, 600, 700)

Font stack literals:
```
serif: '"Source Serif 4", "Noto Serif TC", "PT Serif", Georgia, serif'
sans:  '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
mono:  '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace'
```

### Color themes

**Light (warm paper)**
```
bg        #F2EDE4   cream paper
bgDeep    #E8E2D5   layered surfaces
card      #FBF7EE   card (lighter newsprint highlight)
ink       #1A1612   deep warm black
inkMuted  #5A4F42   warm grey
inkFaint  #8B7F6F   pale warm grey
rule      #1A1612   hairline rule
ruleSoft  rgba(26,22,18,0.18)
accent    (user-set; default #C8321E FT red)
positive  #2D5A3D   forest green
negative  #8B1A1A   dark red
```

**Dark (current active)**
```
bg        #14110D
bgDeep    #0D0B08
card      #1F1B15
ink       #F2EDE4
inkMuted  #9E9587
inkFaint  #6B6358
rule      #F2EDE4
ruleSoft  rgba(242,237,228,0.18)
accent    #1E3D8A  (navy — user's current pick)
positive  #7FB57F
negative  #C54444
```

### Category-tag palette (inline chips, always same regardless of theme)
```
#model-release  fg #6B2E8A on bg #EBDCF0   plum
#api-platform   fg #1E5A8A on bg #D4E2EE   blue
#infra          fg #2D5A3D on bg #D4E2D4   forest
#tooling        fg #8A5A1E on bg #EEE0D4   ochre
#eval           fg #6B1E3D on bg #EED4DC   burgundy
#agent          fg #1E3D8A on bg #D4D8EE   navy
#policy         fg #5A2D1E on bg #EED8D4   brick
#market         fg #2D2D2D on bg #E0DCD4   charcoal
#opinion        fg #5A5A2D on bg #EAE8D4   olive
#research       fg #3D5A6B on bg #D4E0E6   slate
```

### Spacing & radius
- Horizontal card padding: **24px**
- Section vertical rhythm: **14px / 18px / 20px**
- Border radius: **2px** everywhere (or 0). **Never** use `border-radius: 8px+`.
- Hairline rules: **1px**, `ruleSoft` color
- Heavy rules (separator under Masthead, top of feedback bar): **1.5–2px solid `ink`**

---

## 4. Screen structure (top → bottom)

```
┌─────────────────────────────────────┐
│ TOP CHROME                          │  ~70px
│ ┌─────────────────────────────────┐ │
│ │ The Morning Brief   SUN·APR 19  │ │  masthead row
│ │ ─── ─── ─── 1/3 │ 🔥14 │ 17h ago│ │  progress + streak + last-read
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│                                     │
│ CARD (scrollable, swipeable)        │  flex: 1
│                                     │
│  #MODEL-RELEASE  TECHCRUNCH · 3H    │  meta bar (tag + source)
│  ─────────────────────────────────  │  hairline
│                                     │
│  Anthropic 發布 Claude 4 Opus：     │  serif title 30px/1.12 weight 700
│  推理能力大幅提升                    │
│                                     │
│  Claude 4 Opus 在 AIME 2024 達到    │  italic serif summary 17px/1.42
│  90%, coding benchmark 超越 GPT-4o. │
│  ═════════════════════════════════  │  1px solid ink rule
│                                     │
│  CONTEXT                            │  mono 9px overline
│  Anthropic 本次升級聚焦在 extended  │  sans 14px/1.55
│  thinking 深度，支援長達 100k...    │
│                                     │
│  ▌直接影響你的 LLM pipeline 成本結構 │  accent 3px bar + italic reason
│                                     │
│  ╔═ ▸ ENGINEERING IMPACT ═════════╗ │  bordered callout — "pull quote"
│  ║ tool-use 的成功率提升 ~30%，    ║ │  2px border, overline label
│  ║ agent loop 需要更新 retry      ║ │  notched into top-left corner
│  ║ budget；長推理鏈代表 context... ║ │
│  ╚════════════════════════════════╝ │
│  #anthropic  #reasoning  #agent     │  small mono skill tags
├─────────────────────────────────────┤
│ FEEDBACK BAR                        │  ~56px
│ [▽LESS] [💬ASK] [🔖SAVE] [↗READ] [△MORE] │  5 equal buttons, 1.5px ink border
└─────────────────────────────────────┘
```

### Overlays
- **Ask sheet**: slides up from bottom to 78% of viewport height, 2px ink top border, dim backdrop behind
- **Quiz**: full-screen replacement of card area (before first card if enabled)
- **Celebration**: full-screen replacement after last card

---

## 5. Card component detail

### Meta bar
- Padding `14px 24px 10px`
- Flex row, gap 8px
- Children: `CategoryTag` chip, mono text `"{source} · {publishedAgo}"`, spacer, optional right-side `"SIGNAL"` label (for LIGHT render level articles) in accent color, mono 9px, letter-spacing 1
- Bottom border: `1px solid ruleSoft`

### Category tag chip
- Mono 10px, weight 500, letter-spacing 0.5, uppercase
- Color pair from category palette (see tokens)
- Padding `3px 7px`, border-radius **2px**, no border
- `white-space: nowrap`

### Title
- Padding `18px 24px 8px`
- Serif 30px / line-height 1.12 / weight 700 / letter-spacing -0.3
- `text-wrap: pretty`

### Summary (standfirst)
- Padding `0 24px 14px`
- Serif 17px / line-height 1.42 / weight 400 / **italic**
- Color `inkMuted`

### Horizontal rule under summary
- `height: 1px; background: ink; margin: 0 24px; opacity: 0.8` — heavy, like newspaper column rule

### Context block
- Padding `14px 24px 10px`
- Mono 9px weight 600 overline `"CONTEXT"`, letter-spacing 1.5, color `inkFaint`, margin-bottom 6
- Sans 14px / 1.55 body

### Reason bar
- Padding `4px 24px 14px`
- Flex row, gap 6
- 3px × 12px accent-colored bar, then italic sans 12px weight 500 in accent color

### Engineering Impact callout (the money shot)
- `margin: 0 16px 16px`
- `background: bg` (darker than card)
- `border: 1.5px solid ink`
- `border-radius: 2px`
- Padding `14px 16px`
- Position relative so the label can notch into the top border:

```jsx
<div style={{
  position: 'absolute', top: -8, left: 12,
  background: card,                       // punches through the border
  padding: '0 6px',
  fontFamily: mono, fontSize: 9, fontWeight: 700,
  color: ink, letterSpacing: 2,
  textTransform: 'uppercase',
}}>▸ Engineering Impact</div>
```
- Body: sans 14px / 1.5 / weight 500 / `text-wrap: pretty`

### Skill tags
- Padding `0 24px 12px`
- Flex wrap, gap 6
- Each: mono 10px color `inkMuted`, letter-spacing 0.3 — no chip background

### Swipe feedback overlay (inside the card)
- When `|swipeX| > 10`: semi-transparent color overlay `opacity = min(|dx|/200, 0.35)`, positive color for right / negative for left
- When `|swipeX| > 40`: "stamp" appears absolute-positioned at top=120, inset 24 from the swipe-direction side:
  - Serif 28px / weight 900 / letter-spacing 1 / uppercase
  - 3px solid border in positive/negative color
  - Padding `6px 14px`
  - `transform: rotate(±8deg)` (like a newspaper rubber stamp)
  - Text: "MORE" (swipe right / want more like this) or "LESS" (swipe left)

---

## 6. Top chrome detail

### Masthead row (flex, baseline-aligned, justified)
- Left: `"The Morning Brief"` — serif 18px / weight 900 / **italic** / letter-spacing -0.3 / color `ink`
- Right: `"SUN · APR 19 · 2026"` — mono 9px / color `inkMuted` / letter-spacing 1 / uppercase

### Progress + streak + last-read row (flex, gap 10)
1. **Progress dashes**: flex: 1, inner flex of N dashes, each `flex: 1; height: 3px`, filled=`ink` / unfilled=`ruleSoft`, transition `background 0.3s`
2. Mono 10px `"{i+1}/{n}"`
3. 1×10px vertical rule in `ruleSoft`
4. Mono 10px weight 600 `"🔥 {streak}"` in `accent` color
5. Another 1×10px rule
6. Mono 10px `"{lastReadAgo} ago"` in `inkFaint`

---

## 7. Feedback bar detail

Flex row of 5 equal buttons, gap 6, padding `10px 16px 14px`, border-top `1.5px solid ink`, background `bg`.

Each button:
- `flex: 1`, padding `10px 0`
- Mono 11px weight 600, letter-spacing 0.5
- Default: transparent bg, `ink` text, `1.5px solid ink` border, `border-radius: 2px`
- **Active states**:
  - LESS active (`feedback === 'down'`): bg `negative`, text `card`
  - MORE active (`feedback === 'up'`): bg `positive`, text `card`
  - SAVED active: bg `ink`, text `card`
- Icon (13×13 stroke-only SVG, `currentColor`) + uppercase label, gap 4

Button order and icons: `[▽ LESS] [💬 ASK] [🔖 SAVE | SAVED] [↗ READ] [△ MORE]`.

Icons are all stroke-based, 24×24 viewBox, `stroke-width: 2`, `fill: none` (except bookmark when saved → `fill: currentColor`):
- Thumb-up / thumb-down: classic thumb path
- Bookmark: `M5 3h14v18l-7-5-7 5V3z`
- Chat: `M4 4h16v12H8l-4 4V4z`
- External link: `M14 4h6v6 M10 14L20 4 M20 14v6H4V4h6`

---

## 8. Gestures

Implemented on the card area (not the whole screen) with unified mouse + touch handlers. See `app.jsx` for the full logic. Key points:

- **Drag start**: record `x`, `y`, `axis: null`
- **On move**: if `|dx| > 8 || |dy| > 8` lock axis to whichever is larger
- **Horizontal drag**: update `swipeX` state live; the card translates and rotates: `transform: translateX({swipeX}px) rotate({swipeX * 0.04}deg); transform-origin: bottom center`
- **Release**:
  - If `|swipeX| > 90` → register feedback ('up' if right, 'down' if left), then animate card off-screen (`translateX: ±400px rotate: ±15deg; opacity: 0; transition: 0.22s ease-in`), then advance index
  - Else → spring back (`swipeX = 0`)
- **Vertical up gesture** and **↑ key** → open Ask sheet
- **↓ / Escape** → close Ask sheet
- **← / →** keys → simulate swipe (set swipeX to ±120, then advance after 180ms)

---

## 9. Ask sheet detail

78% height, slides up from bottom with `transform: translateY(0 / 100%)` + `transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)`. 2px solid ink top border. Shadow `0 -12px 40px rgba(26,22,18,0.18)`. zIndex 30. Dim backdrop behind (`rgba(26,22,18,0.35)`, zIndex 25, click closes).

Structure:
1. **Handle**: 32×3 `ruleSoft` pill, centered, padding 8 0 2
2. **Header**: article title (truncated, serif italic 14 weight 600) + overline "ASK CLAUDE · HAIKU 4.5" + close button (26×26, `1px solid ink`, border-radius 2, "✕")
3. **Messages area** (flex: 1, overflow-y auto, padding 14 20, gap 12):
   - Assistant bubbles: left-aligned, `bg` background, `ink` text, `1px solid ruleSoft`, border-radius 2, padding `10px 14px`, sans 14/1.5
   - User bubbles: right-aligned, `ink` background, `card` text, no border
   - **Suggestion chips** (below messages, column, gap 6): full-width buttons, `1px dashed ink`, padding `10px 12px`, serif 13 italic, prefixed "→ "
4. **Input row** (border-top `1px solid ruleSoft`, padding `10 14 14`, flex gap 8):
   - Input: flex: 1, bg `bg`, `1px solid ruleSoft`, border-radius 2, padding `10 12`, sans 14
   - Send button: bg `ink`, text `card`, no border, border-radius 2, padding `0 16`, mono 11 weight 600, "SEND"

---

## 10. Quiz card detail (Duolingo-style)

Height 100%, bg `card`, padding `20px 24px`.

- Mono 10px weight 700 overline `"◇ RECALL QUIZ · N DAYS AGO"` in `accent`, letter-spacing 2, margin-bottom 4
- Article title reference: serif 13 italic `inkMuted`, margin-bottom 18
- **Question** (h2): serif 22 / 1.25 / 700, `text-wrap: pretty`, margin-bottom 20
- **Options** (flex col, gap 8, flex: 1):
  - Each option button is full-width, text-left
  - Default: bg `card`, `1.5px solid ruleSoft`
  - Selected (not revealed): bg `bg`, border `1.5px solid ink`
  - Correct (after reveal): bg `positiveSoft`, border `1.5px solid positive`, trailing "✓" in positive color
  - Wrong selected (after reveal): bg `accentSoft`, border `1.5px solid negative`, trailing "✕" in negative color
  - Padding `12 14`, sans 14/1.4, border-radius 2
  - Prefix: mono 11 weight 700 letter-spacing, color `inkFaint`, "A" / "B" / "C" / "D" in a 14px-min-width column
- **Explanation** (shown after reveal): bg `bg`, `1px solid ruleSoft`, **left-border 3px solid accent**, padding `10 12`, sans 12/1.5
- **Bottom button**: bg `ink` (or `ruleSoft` when disabled), text `card`, padding `12 0`, mono 12 weight 600 letter-spacing 2 uppercase. Label: "CHECK ANSWER" → (on first click reveals) → "CONTINUE TO BRIEF →"

---

## 11. Celebration screen detail

Height 100%, bg `card`, padding `40px 24px 24px`, flex column.

1. **Decorative double-rule** at top: `height: 3px bg: ink` + 6px gap + `height: 1px bg: ink` (like a masthead divider in newspapers), margin-bottom 24
2. Overline: mono 10 `inkFaint` letter-spacing 2 uppercase `"END OF EDITION · APR 19"`, margin-bottom 10
3. **Headline** (h1): serif 40 / line-height 1.02 / weight 900 / **italic** / letter-spacing -0.8. Two lines: `"That's it for<br/>today."` Margin-bottom 8
4. **Deck**: serif 15 / 1.45 / italic / `inkMuted`. "You've read the morning. Come back tomorrow — the world won't slow down." Margin-bottom 28
5. **Streak callout** (bg `bg`, `1.5px solid ink`, border-radius 2, padding 16, flex row gap 14):
   - Giant serif 48 weight 900 streak number in `accent` color
   - Middle col: overline "DAY STREAK" + sans 13 weight 500 ink "personal best N · 1 away from new record"
   - Right: 🔥 emoji 28px
6. **Today stats grid** (3 cols, 1px gap, bg `ink` wrapper with `1.5px solid ink` border → creates a dividing line between cells; each cell has bg `card`, padding `14 8`, text-align center):
   - Cell: overline "READ" / "SAVED" / "RECALL" in `inkFaint` → serif 24 weight 700 value → sans 10 `inkMuted` unit (`min` / `篇` / `correct`)
7. **Weekly peek** (full-width button): transparent, `1px dashed ink`, padding 12, text-left. Inside: overline "THIS WEEK · SO FAR" → serif 16 weight 600 "N articles · mostly #infra, #model-release" + trailing arrow "→"
8. **Footer note**: mono 9 `inkFaint` letter-spacing 2 uppercase text-align center `"— NEXT EDITION · TOMORROW 07:30 —"`

---

## 12. Responsive behavior

- **< 700px viewport**: fullscreen (card area fills viewport)
- **≥ 700px viewport**: center a 402 × 874 iPhone device frame; show a left-side context panel explaining the product + keyboard shortcuts

For Claude Code you likely only need the mobile path — ignore the device frame unless building a marketing/showcase page.

---

## 13. State model

```typescript
type Feedback = 'up' | 'down';
type RenderLevel = 'FULL' | 'LIGHT' | 'OMIT';

interface Article {
  id: string;
  index: number;
  renderLevel: RenderLevel;
  categoryTag: string;       // e.g. "#model-release"
  skillTags: string[];       // e.g. ["#anthropic", "#reasoning"]
  source: string;
  sourceTier: 'broad' | 'technical';
  publishedAgo: string;      // "3h"
  title: string;
  summary: string;           // ≤ 25 Chinese chars ideal
  context: string;           // 1–5 sentences
  engineeringImpact: string; // 1 sentence, concrete
  reason: string;            // 1 sentence, why read now
  shortJudgment: string | null; // LIGHT only, ≤ 20 chars
  url: string;
  score: number;             // 0–100
}

interface AppState {
  idx: number;                            // card index; == cards.length → celebration
  swipeX: number;                         // live drag offset
  dragStart: { x, y, axis } | null;
  showAsk: boolean;
  feedback: Record<string, Feedback>;     // keyed by article id
  saved: Record<string, boolean>;
  quizDone: boolean;
  transitioning: boolean;                 // post-swipe fly-away
}
```

On feedback submit (swipe past threshold OR button click): write to DB, then advance. On save: toggle in state, write to DB, kick off Notion API call async (fire-and-forget with retry in V2 spec).

---

## 14. File structure for Claude Code

Suggested split (matches how the reference is built):

```
src/
  theme.ts          // THEME_LIGHT, THEME_DARK, TAG_COLORS
  types.ts          // Article, Feedback etc
  components/
    Card.tsx        // ArticleCard + CategoryTag
    Chrome.tsx      // TopChrome + FeedbackBar + icons
    AskSheet.tsx
    QuizCard.tsx
    Celebration.tsx
  App.tsx           // MorningBriefApp — swipe logic, overlays, routing
  main.tsx
```

For Vite + React + PWA: use `vite-plugin-pwa`. Add the 3 Google Fonts via `<link>` in `index.html` (not `@import` in CSS — faster FCP).

---

## 15. Reference implementation

Every JSX file in this `handoff/` folder is the working reference. Reading order:

1. `theme.jsx` — all tokens
2. `data.jsx` — sample data shape (mirrors V1 classifier output)
3. `card.jsx` — ArticleCard
4. `chrome.jsx` — TopChrome + FeedbackBar
5. `overlays.jsx` — AskSheet + QuizCard + Celebration
6. `app.jsx` — assembles everything, swipe logic

The reference uses `window.X` globals because it runs as inline Babel. For your codebase: replace with ES imports. Style logic (numbers, colors, flex rules) is copy-paste ready.

---

## 16. Prompt to paste into Claude Code

> I'm building a mobile-first PWA called "AI Morning Brief" — a swipeable daily-tech-news card feed for backend engineers. Read `handoff/SPEC.md` and all `handoff/*.jsx` files; they contain a complete reference implementation with exact tokens, layouts, spacing, and gestures.
>
> Port this reference to a production Vite + React + TypeScript + PWA project. Preserve the visual design pixel-for-pixel: same fonts (Source Serif 4 + Noto Serif TC + Inter + JetBrains Mono), same tokens (see `design-tokens.json`), same card structure, same swipe physics, same overlays.
>
> **Current theme config**: dark mode, accent `#1E3D8A` (navy). Keep light mode + theme-switcher but default to dark.
>
> Replace global `window.X` patterns with proper ES imports. Split into the file structure described in SPEC section 14. Use styled-components or inline style objects — don't introduce Tailwind.
>
> Start by scaffolding the project, then port `theme` → `Card` → `Chrome` → `App` → overlays in that order. After each file, run `npm run build` to catch type errors early.

---

## 17. What's intentionally NOT in the reference

Things to build on top, not part of this UI spec:

- SSE streaming for Claude chat (reference uses a fake response chip). See V2_DESIGN.md §F3.
- Notion API integration on bookmark (see V2 §F4).
- Real data fetching — reference uses hardcoded `TODAY_CARDS`.
- 👍👎 persistence to Turso — reference only puts it in React state.
- Quiz generation (should happen at save time via Haiku — see V2 §F5).
- Weekly report (V2 §F7).

Design is complete. Wiring is the implementation work.
