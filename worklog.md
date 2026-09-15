# LCIE Landed Cost Agent — Worklog

Project: LCIE Landed Cost Calculator under the Green G(P)4 Supply Chain Framework
Reference site: https://alpine-rcic.netlify.app/
Goal: AI agent that auto-determines HS codes + duty/tax/levies for US (HTS), UK (Global Tariff), EU (TARIC) when a Purchase Order is uploaded.

## Architecture Overview

**Single route:** `/` (src/app/page.tsx) — full LCIE Landed Cost workspace.

**Backend API routes (Next.js App Router, server-side):**
- `POST /api/lcie/upload-po` — parse uploaded PO (CSV/JSON/text or manual) into line items
- `POST /api/lcie/determine-codes` — AI agent (z-ai-web-dev-sdk LLM) determines HS codes + duty/VAT/levies for US/UK/EU per line item, grounded with a knowledge base
- `POST /api/lcie/calculate` — compute landed cost per region (duty + VAT + MPF/HMF + freight + insurance)

**Database (Prisma/SQLite):**
- `PurchaseOrder`, `LineItem`, `HsDetermination`, `LandedCostCalculation`

**Tech:** Next.js 16, TypeScript, Tailwind 4, shadcn/ui, Prisma, z-ai-web-dev-sdk (LLM), recharts.

**Visual:** Emerald/green accent (Green G(P)4 sustainability theme), dark+light mode, sticky footer.

## Task Plan

- **Task 1** (parallel, subagent): Build HS code knowledge base + duty/tax rules reference file
- **Task 2** (me): Prisma schema + db push
- **Task 3** (me): Backend API routes with z-ai-web-dev-sdk LLM integration
- **Task 4** (me): Frontend page (PO upload, AI agent panel, US/UK/EU duty stack dashboard, charts)
- **Task 5** (me): Lint, dev server, Agent Browser self-verification

---
Task ID: 0
Agent: orchestrator (main)
Task: Plan architecture and seed worklog.

Work Log:
- Read project state (Next.js 16, shadcn/ui present, Prisma configured, page.tsx is a blank logo screen)
- Invoked web-reader and LLM skills to learn the SDK usage
- Designed LCIE architecture (single route, 3 API routes, 4 Prisma models, AI agent grounded by knowledge base)

Stage Summary:
- Architecture defined; ready to dispatch Task 1 (knowledge base) and proceed with Tasks 2-5.

---
Task ID: 1
Agent: general-purpose (HS knowledge base)
Task: Build static HS code knowledge base + duty/tax rules reference module at `src/lib/hs-knowledge-base.ts` to ground the LCIE Landed Cost Agent's classification step.

Work Log:
- Read worklog.md to absorb architecture context (single route, 3 API routes, Prisma models, z-ai LLM agent grounded by this KB).
- Inspected tsconfig.json (strict, target ES2017, bundler module resolution) and existing `src/lib/utils.ts` to match code style.
- Designed 24 product entries spanning 6 categories (4 each): Apparel & Textiles, Electronics & Technology, Food & Beverages, Machinery & Tools, Home & Consumer Goods, Health & Beauty.
- For each entry populated US HTS (10-digit), UK Global Tariff (10-digit), EU TARIC CN8 (with spaces) codes + research-typical MFN/Column-1/Third-Country duty rates as decimals, plus VAT rates (UK 20% std / 0% on zero-rated food, EU 19% DE std / 7% reduced on food) and 5-state memberStateVat arrays.
- Implemented `DUTY_RULES: Record<'US'|'UK'|'EU', DutyRule>` with MPF 0.3464% (min $31.67, max $614.35), HMF 0.125% (ocean), US duty on FOB / no federal VAT; UK/EU duty on CIF, VAT on (CIF + duty), 20% UK / 19% DE default.
- Implemented `findHsEntries(query)` keyword fuzzy-match helper (≤3 hits, case-insensitive substring either direction; empty array on no match).
- Exported interfaces `HsCodeEntry`, `RegionalHsCode`, `DutyRule`.
- Verified with `bunx tsc --noEmit src/lib/hs-knowledge-base.ts` → no errors in the new file (only pre-existing errors in `examples/` and `skills/` dirs).
- Runtime smoke test via bun: confirmed 24 entries, 6 categories, all 3 DUTY_RULES keys, findHsEntries("cotton t-shirt for summer") → [cotton-tshirt, denim-jeans], findHsEntries("iphone") → [smartphone], findHsEntries("gibberish xyzzy") → [].

Stage Summary:
- Artifact: `/home/z/my-project/src/lib/hs-knowledge-base.ts` (≈540 LOC, no runtime deps, no network calls).
- Exports: `HS_KNOWLEDGE_BASE` (24 HsCodeEntry), `DUTY_RULES` (US/UK/EU), `findHsEntries(query)`, plus types `HsCodeEntry`, `RegionalHsCode`, `DutyRule`.
- Key decisions:
  - Kept `dutyType: string` per spec (allowed values: "ad valorem" | "specific" | "free"); used `dutyType: "specific"` for US wine (2204.21) with dutyRate representing $/L ($0.2625/L on still wine ≤2L) and explained unit in `specialNotes`.
  - Applied UK zero-rated VAT (0) on food items (roasted-coffee-beans, olive-oil) and EU reduced VAT (7% DE default) on food/supplements per the spec's "20% standard unless reduced" instruction; standard 20% UK / 19% EU on all other goods.
  - Reusable 5-state `memberStateVat` array (DE/FR/NL/IT/ES) attached to every EU entry for grounding even where the row's own `vatRate` reflects a reduced rate; for reduced-rate food items the array was overwritten with each state's reduced food rate (DE 7%, FR 5.5%, NL 9%, IT 4%, ES 4% or 10% as appropriate).
  - `findHsEntries` matches either direction (token ⊂ keyword OR keyword ⊂ token) so "iphone" finds smartphone and "cotton" finds both cotton-tshirt and denim-jeans.
- TS strict: clean. Ready for Task 3 (`/api/lcie/determine-codes`) to import `findHsEntries`, `HS_KNOWLEDGE_BASE`, `DUTY_RULES` for LLM grounding + landed-cost calculation.

---
Task ID: 2-5
Agent: orchestrator (main)
Task: Build Prisma schema, backend API routes, frontend page, and verify end-to-end with Agent Browser.

Work Log:
- Task 2: Authored prisma/schema.prisma with 4 models (PurchaseOrder, LineItem, HsDetermination, LandedCostCalculation); ran `bun run db:push` — DB in sync.
- Task 3: Built backend in src/lib/lcie/ + src/app/api/lcie/:
  - types.ts — shared API DTOs (PoDto, DetermineResponse, CalculateResponse, AgentStep, RegionCalculation, etc.)
  - parser.ts — PO parser accepting CSV / JSON / free-text (auto-detects columns + qty/price regex)
  - agent.ts — the LCIE AI agent: grounding via findHsEntries, then z-ai-web-dev-sdk chat.completions.create with a customs-broker system prompt; strict JSON parse + fallback to KB; upserts HsDetermination rows for US/UK/EU per line item
  - calculator.ts — landed cost engine: US (duty on FOB + MPF clamp $31.67-$614.35 + HMF 0.125%), UK/EU (duty on CIF + VAT on CIF+duty); all amounts in PO currency
  - sample-po.ts — 3 multi-category sample consignments (mixed retail, pantry+beauty, tools+home)
  - 4 API routes: POST /api/lcie/upload-po, POST /api/lcie/determine-codes, POST /api/lcie/calculate, GET /api/lcie/sample-po
- Task 4: Built frontend:
  - src/components/theme-provider.tsx + layout.tsx — next-themes dark/light
  - globals.css — emerald/green token palette (Green G(P)4 sustainability theme; no indigo/blue)
  - src/components/lcie/duty-charts.tsx — recharts stacked bar (cost composition), horizontal bar (effective rate), donut (top region breakdown)
  - src/app/page.tsx — full LCIE workspace: sticky header w/ branding + theme toggle, hero, upload card (drag/drop + paste + 3 samples), line-items table, "Run LCIE AI Agent" button, live agent trace panel (progressive step reveal + flow bar), results dashboard (charts + 3 region cards US/UK/EU with duty/VAT/MPF/HMF breakdown + confidence bar + per-line HS determination tabbed table), export JSON, sticky footer
- Task 5: Verification with Agent Browser:
  - Initial render: HTTP 200, hero + upload card + 3 samples render
  - Loaded "Mixed Retail Consignment" sample → 6 line items parsed & stored
  - Clicked "Run LCIE AI Agent" → POST /api/lcie/determine-codes 200 in 22.1s (LLM classified 6 lines × 3 regions with real HS codes, e.g. 5G smartphone → 8517.13.00.00 Free under ITA, denim jeans → 6203.42.80.00 @ 16.6%, leather handbag → ch.42, BT headphones → 8518.30.20.00 Free)
  - POST /api/lcie/calculate 200 → 3 region cards rendered: US $282,035 (4.42% effective), UK $334,552, EU $331,762
  - "Lowest effective rate: 🇺🇸 US (4.42%)" badge correct (US has no VAT → lowest burden)
  - Sticky footer verified: footerPosition=static, mainPushesFooter=true, sticks to viewport bottom on short screen (800=800), pushed naturally on long results screen (3157)
  - Mobile responsive: grid stacks to grid-cols-1 at 390px
  - Dark mode toggle: html.dark class applied
  - Lint: clean. No errors/warnings in dev.log.

Stage Summary:
- Full LCIE Landed Cost Agent live at / — upload PO → AI determines HS codes for US HTS / UK Global Tariff / EU TARIC → calculates duty + VAT + MPF/HMF + freight + insurance per region → auditable reasoning + charts.
- All currency consistent (PO currency), "lowest touch" now correctly compares effectiveRate (currency-agnostic).
- Artifacts: prisma/schema.prisma, src/lib/lcie/{types,parser,agent,calculator,sample-po}.ts, src/lib/hs-knowledge-base.ts (from Task 1), src/app/api/lcie/{upload-po,determine-codes,calculate,sample-po}/route.ts, src/app/page.tsx, src/app/layout.tsx, src/components/lcie/duty-charts.tsx, src/components/theme-provider.tsx, src/app/globals.css.
