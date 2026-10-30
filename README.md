# Dataset Blog Generator

Turns a CSV of companies into an SEO-optimised, server-rendered blog page: a ranking
table, computed statistics, and copy written by an LLM.

The page for the supplied top 100 UK fintech dataset lives at `/blog/top-100-uk-fintech`.
Uploading a CSV from any other industry at `/upload` produces an equivalent page from the
same template, with no code changes and no rebuild.

---

## Setup

**Requirements:** Node 20 or later, and a free Google AI Studio API key.

```bash
npm install
cp .env.example .env     # then set NUXT_GEMINI_API_KEY
npm run dev              # http://localhost:3000
```

A free key comes from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
The fintech page is seeded on first boot, so there is something to look at immediately.
The app also runs without a key — it falls back to template-written copy.

```bash
npm test        # 17 unit tests, no network or API key needed
npm run build   # production build
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `NUXT_GEMINI_API_KEY` | For AI copy | Google AI Studio key. Without it, template copy is used. |
| `NUXT_GEMINI_MODEL` | No | Defaults to `gemini-3.5-flash-lite`. |
| `NUXT_PUBLIC_SITE_URL` | For deployment | Canonical URLs and the sitemap. |
| `NUXT_UPLOAD_PASSCODE` | No | If set, `/upload` requires this passcode. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Production only | Set automatically when adding Upstash Redis on Vercel. |

---

## Tools used

| Tool | Version | Why |
| --- | --- | --- |
| [Nuxt](https://nuxt.com) | 4.6.3 | Required by the brief. SSR, file-based routing and an API layer in one framework. |
| Vue | 3.5.44 | Nuxt's component layer. |
| [Nitro](https://nitro.build) / unstorage | bundled with Nuxt | The server and its storage abstraction — same code writes to JSON files locally and Redis in production. |
| [Papa Parse](https://www.papaparse.com/) | 5.7.0 | CSV parsing. Handles quoted fields containing commas, which `split(',')` does not. |
| [Google Gemini](https://ai.google.dev/) | `gemini-3.5-flash-lite` | Writes the prose. Free tier. |
| [Vitest](https://vitest.dev) | 3.2.7 | Unit tests. |
| `@upstash/redis` | 1.40.0 | Production storage driver. |

No CSS framework, component library or charting library. The styling is one 
stylesheet and the bar charts are divs with a percentage width, so they render on the
server and their numbers stay as real text for crawlers and screen readers.

---

## Approach

```
CSV  ──▶  detect columns  ──▶  clean rows  ──▶  compute statistics  ──▶  write copy  ──▶  save
          columns.ts          normalise.ts      stats.ts                 copy.ts         storage
```

The browser parses the CSV with Papa Parse and POSTs the rows as JSON.
[`server/lib/pipeline.ts`](server/lib/pipeline.ts) runs the five steps above and returns a
single `BlogRecord` holding the cleaned rows, every statistic and the finished copy.
`app/pages/blog/[slug].vue` renders that record — one template for every dataset.

### Working with any industry

Nothing is hardcoded for fintech. The difficulty is that two CSVs describing the same thing
rarely agree on column names: one says `Company` and `Total Raised`, another `Organisation`
and `Funding (£m)`. So columns are **detected, not configured**, in two passes, a regex per
role against the headers first, then value sniffing for anything still unfilled. A column
of mostly URLs is the website, a text column of near-unique values is the company name.
That second pass is why a name column headed `Entity` is still found. Amount parsing is
unit-aware, so `£30,314,247`, `$12.5m`, `£1.1bn` and `950k` all become plain pounds, and
the header is used as a hint so `Funding (£m)` containing `12.5` becomes 12,500,000.

**Every statistic is optional.** `stats.ts` returns `null` for any section the data cannot
support and the template renders each section behind a `v-if`, so a CSV with only names and
descriptions still produces a valid page — just without the funding, region, sector and
size sections.

### The LLM never produces a number

This is the main design decision. LLMs are unreliable with arithmetic, and a ranking page
with wrong figures is worse than no page. So the model never sees the dataset: `stats.ts`
computes every number in TypeScript, `buildFacts()` turns only those finished values into a
small JSON object, and that object is the only material in the prompt, which instructs the
model to copy figures exactly and invent nothing. The reply is requested as JSON against a
schema, so it arrives as structured copy rather than prose to be parsed. The model's job is
wording, not calculation.

I checked this on the fintech dataset by comparing every figure in the generated copy
against the computed statistics — total £622m, mean £6.2m, median £4.1m, largest Nevis at
£30.3m, top-10 share 33%, London 78 companies (78%) — all exact.

### Connecting to Gemini

The integration is a plain `fetch` to Google's REST API, with no SDK, since one HTTP call
does not justify a dependency. The endpoint turned out to be a dead end as 
`models/gemini-2.5-flash:generateContent` returns a 404 reading *"no longer available to new
users"*, because Google has closed the Gemini 2.5 models to newly created API keys and
`generateContent` itself is now legacy. The fix was to move to Google's current Interactions API: `POST
/v1beta/interactions`, `response_format` in place of `generationConfig.responseSchema`, and
a reply that arrives as a list of steps, so the answer is found by locating the
`model_output` step rather than a fixed index. The model name is an environment variable, so
swapping it needs no code change.

---

## SEO

- **Server-side rendered.** The copy and all 100 table rows are in the HTML of the first
  response. Nothing important waits for JavaScript.
- **Head tags** per page: a `<title>` under 60 characters, a meta description around 155,
  Open Graph and Twitter card tags, and a canonical URL.
- **Heading structure:** one `<h1>`, a section `<h2>` per insight, `<h3>` for FAQ questions.
- **Structured data (JSON-LD):** `Article` for the page, `ItemList` marking up the ranking as
  positioned items, and `FAQPage` for rich-result eligibility. `FAQPage` is only emitted when
  there are questions, since an empty `mainEntity` is invalid.
- **`/sitemap.xml` and `/robots.txt`** are generated from storage, so a newly uploaded blog
  appears in the sitemap with no rebuild. `robots.txt` allows crawlers but blocks `/upload`
  and `/api/`.
- **Semantic markup.** Proper `<th scope>` headers and a table caption; the bar charts are
  real text.

The ranking table is filterable in the browser, but all rows are server-rendered first — the
filter hides rows rather than fetching them, so crawlers still see all 100.

---

## Error handling

A CSV from an unknown source, parsed in a browser and sent to a free third-party API, has
plenty of ways to go wrong. The guiding rule is that **a page is always produced**, and that
failures are specific rather than generic.

| Failure | What happens |
| --- | --- |
| No API key configured | Template copy is used; the call is never attempted. |
| Gemini errors or is rate-limited | Caught, logged with Google's own message, template copy used. |
| Gemini stalls without responding | Aborted after 45 seconds by `AbortSignal.timeout`, then template copy. |
| Gemini returns unusable JSON | `validateCopy` rejects it if required fields are missing, and falls back field by field for anything over-length or absent. |
| A column is missing | That statistic is `null` and its whole section is omitted. |
| No company name column at all | 422 naming the headers it actually saw, rather than a generic failure. |
| CSV has no rows, or over 2000 | 400 and 413 respectively, before any work is done. |
| Unknown blog slug | Proper 404 page, not a crash. |

The fallback copy is not a stub: `templateCopy()` builds a complete page — title, meta
description, intro, per-section insights, conclusion and FAQ — from the same computed
statistics, in British English. The record stores which path was used (`copySource`), shown
in the page footer and tagged on the blog index, so there is no ambiguity about what wrote
the copy.

---

## Tests

```bash
npm test
```

17 Vitest tests covering column detection, money parsing, normalisation, statistics and two
end-to-end `buildBlog` runs. They run against `server/lib`, which is deliberately plain
TypeScript with no Nuxt imports, so they need no framework harness, running server, network
or API key.

They run over four fixture CSVs, because the real risk here is not a logic bug but an
unfamiliar CSV shape on the day: the supplied fintech dataset; a messy healthtech file with
different headers, blanks and missing columns; one whose headers share no vocabulary with
the others and mixes money formats in a single column; and a worst case of names and
descriptions only, where every statistic goes `null` and the page must still render.

---

## Known limitations

- **There is no way to delete a generated blog.** The API has create, list and get, but no
  delete. Removing one means clearing its key from the storage backend by hand. On a
  publicly reachable deploy that also means an unwanted upload cannot be taken down from
  the interface.
- **Generated blogs are shared and public, not per-user.** There is no authentication or
  session handling: every blog is saved to one store, listed on `/blog` for all visitors
  and included in `sitemap.xml`. That suits a publishing tool, but it means the upload form
  should not be treated as a private workspace. `NUXT_UPLOAD_PASSCODE` restricts who can
  generate a page, but does not scope what they can see.
- **Column detection is automatic with no manual override.** The upload form reports what it
  detected for each role, including the roles it could not fill, so a mistake is visible.
  But if it maps the wrong column there is currently no way to correct it short of renaming
  the CSV header.

## Design decisions and trade-offs

- **One dynamic SSR route, not generated static pages.** The brief requires upload → page
  with no rebuild, and static generation would need a build step per upload. The cost is
  rendering per request, which for a page this size is a fair trade.
- **Statistics in code, prose from the LLM.** Covered above; the decision I would defend
  hardest.
- **Columns detected rather than mapped by hand.** A manual mapping UI would be more
  accurate but adds a step and more code. Detection covers the realistic cases, and the
  upload page shows what it found so there is no guessing.
- **Storage behind an interface.** JSON files locally, Upstash Redis in production,
  identical calling code, because a serverless filesystem is read-only.

### What I would do next

- A `DELETE /api/blogs/:slug` endpoint, with a confirmation step on the blog index.
- Validate the generated copy against the facts automatically — reject any number in the
  prose that does not appear in `buildFacts()`, rather than relying on the prompt.
- Per-page Open Graph images.
- Let the user correct a detected column from the upload page.
