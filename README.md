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
# 1. Install
npm install

# 2. Configure
cp .env.example .env
```

Open `.env` and set `NUXT_GEMINI_API_KEY`. A free key comes from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey). Leave
`NUXT_GEMINI_MODEL` as it is unless you have a reason to change it.

```bash
# 3. Run
npm run dev     # http://localhost:3000
npm test        # 17 unit tests, no network or API key needed
npm run build   # production build
```

The fintech page is seeded automatically on first boot, so there is something to look at
immediately. The app runs without an API key too — it falls back to template-written copy
(see [Error handling](#error-handling)).

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NUXT_GEMINI_API_KEY` | For AI copy | Google AI Studio key. Without it, template copy is used. |
| `NUXT_GEMINI_MODEL` | No | Defaults to `gemini-3.5-flash-lite`. |
| `NUXT_PUBLIC_SITE_URL` | For deployment | Used for canonical URLs and the sitemap. |
| `NUXT_UPLOAD_PASSCODE` | No | If set, `/upload` requires this passcode. Useful on a public deploy. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Production only | Set automatically when adding Upstash Redis on Vercel. |

---

## Tools used

Everything here is free, and the dependency list is deliberately short.

| Tool | Version | Why |
| --- | --- | --- |
| [Nuxt](https://nuxt.com) | 4.6.3 | Required by the brief. Gives server-side rendering, file-based routing and an API layer in one framework. |
| Vue | 3.5.44 | Nuxt's component layer. |
| [Nitro](https://nitro.build) / unstorage | bundled with Nuxt | The server and its storage abstraction. Lets the same code write to JSON files locally and Redis in production. |
| [Papa Parse](https://www.papaparse.com/) | 5.7.0 | CSV parsing. Handles quoted fields containing commas, which a naive `split(',')` does not. |
| [Google Gemini](https://ai.google.dev/) | `gemini-3.5-flash-lite` | Writes the prose. Free tier. |
| [Vitest](https://vitest.dev) | 3.2.7 | Unit tests. |
| `@upstash/redis` | 1.40.0 | Storage driver for production only. |

No CSS framework, no component library and no charting library — the styling is one
hand-written stylesheet and the bar charts are divs with a percentage width. That keeps the
page light and means the charts render on the server, so their numbers are real text that
crawlers and screen readers can read.

---

## Approach

The whole flow is one pipeline, in [`server/lib/pipeline.ts`](server/lib/pipeline.ts):

```
CSV  ──▶  detect columns  ──▶  clean rows  ──▶  compute statistics  ──▶  write copy  ──▶  save
          columns.ts          normalise.ts      stats.ts                 copy.ts         storage
```

The browser parses the CSV with Papa Parse and POSTs the rows as JSON. The server returns a
single `BlogRecord` containing the cleaned rows, every computed statistic and the finished
copy. `app/pages/blog/[slug].vue` renders that record — one template for every dataset.

### Working with any industry

Nothing is hardcoded for fintech. The problem is that two CSVs describing the same thing
rarely agree on column names: one says `Company` and `Total Raised`, another says
`Organisation` and `Funding (£m)`.

So columns are **detected, not configured**, in two passes:

1. **Header matching.** Each role (name, amount, region, tags, stage, size, year,
   description, website) has a regex tried against the headers. Order matters — `name` is
   matched last so that `Company website` is claimed by `website` rather than `name`.
2. **Value sniffing**, for any role still unfilled. A column where more than 80% of values
   look like URLs is the website. A text column where nearly every value is unique is the
   company name. This is how the `ai_alt_headers.csv` fixture works: its name column is
   headed `Entity`, which matches no pattern at all, and is found from its values.

Amount parsing is unit-aware, so `£30,314,247`, `$12.5m`, `£1.1bn` and `950k` all become
plain pounds. The column header is used as a hint too, so `Funding (£m)` containing `12.5`
correctly becomes 12,500,000.

**Every statistic is optional.** `stats.ts` returns `null` for any section the data cannot
support, and the template renders each section behind a `v-if`. A CSV with only a name and
a description still produces a valid page — it just has a ranking table, an intro and an
FAQ, with the funding, region, sector and size sections absent rather than empty. That case
is covered by the `cleantech_sparse.csv` fixture.

### The LLM never produces a number

This was the main design decision. LLMs are unreliable with arithmetic, and a ranking page
whose figures are wrong is worse than no page.

So the model never sees the dataset. The sequence is:

1. `stats.ts` computes every number in TypeScript — totals, mean, median, top and bottom,
   top-10 share, funding bands, region and sector counts, size and stage breakdowns.
2. `buildFacts()` turns only those finished, pre-formatted values into a small JSON object.
3. That object is the only material in the prompt, which instructs the model to copy
   figures exactly and invent nothing.
4. The response is requested as JSON against a schema, so it arrives as structured copy
   rather than prose to be parsed.

The model's job is wording, not calculation. I verified this on the fintech dataset by
checking every figure in the generated copy against the computed statistics: total £622m,
mean £6.2m, median £4.1m, largest Nevis at £30.3m, top-10 share 33%, London 78 companies
(78%), sector counts 35 and 27, size bands 49 and 11 — all exact.

A useful side effect: because the numbers live in code, they are unit-testable, which the
prose never could be.

### Connecting to Gemini

The Gemini integration is a plain `fetch` to Google's REST API — no SDK, since one HTTP
call does not justify a dependency.

Getting there was the one genuinely awkward part of the build. The obvious endpoint,
`models/gemini-2.5-flash:generateContent`, returned a 404:

```
This model models/gemini-2.5-flash is no longer available to new users.
```

The model was still listed by the API's own `/models` endpoint, and the key worked for
other calls, so the cause was not obvious. Google has closed the Gemini 2.5 models to
newly created API keys, and `generateContent` itself is now legacy. The fix was to move to
Google's current **Interactions API**:

- `POST /v1beta/interactions` rather than `models/{model}:generateContent`
- `response_format` rather than `generationConfig.responseSchema` for structured JSON
- the reply arrives as a list of steps, so the answer is found by locating the
  `model_output` step rather than reading a fixed index — a reasoning model also returns
  `thought` steps before it

`gemini-3.8-flash` is Google's current recommendation but timed out repeatedly in testing,
so the default is `gemini-3.5-flash-lite`, which is fast and well within the free tier. The
model name is an environment variable, so replacing it needs no code change.

Two smaller problems worth recording:

- **The failure message was useless.** The log said only `404 Not Found`, while Google's
  actual explanation sat in the response body. Surfacing `err.data.error.message` is what
  made the problem diagnosable at all.
- **The request could hang indefinitely.** One upload sat for over five minutes. The HTTP
  client's `timeout` option did not bound a request where Google accepted the connection
  and then stalled without replying. It now uses an explicit
  `signal: AbortSignal.timeout(45_000)` with `retry: 0`, which I confirmed aborts on
  schedule. This mattered because the whole fallback design assumes a failing LLM call
  fails *quickly*.

---

## SEO

The brief asked for an SEO-optimised page, so this is treated as a feature rather than an
afterthought.

- **Server-side rendered.** The page is fetched during SSR, so the copy and all 100 table
  rows are in the HTML of the first response. Nothing important waits for JavaScript.
- **Head tags** per page: a `<title>` under 60 characters, a meta description around 155,
  Open Graph and Twitter card tags, and a canonical URL.
- **Heading structure:** one `<h1>`, then a section `<h2>` per insight, with `<h3>` for FAQ
  questions.
- **Structured data (JSON-LD):** `Article` describes the page, `ItemList` marks up the
  ranking as positioned items with organisation names and links, and `FAQPage` makes the
  FAQ eligible for rich results. `FAQPage` is only emitted when there are questions — an
  empty `mainEntity` is invalid and would be flagged.
- **`/sitemap.xml` and `/robots.txt`** are generated from storage, not written by hand, so
  a newly uploaded blog appears in the sitemap immediately with no rebuild. `robots.txt`
  allows crawlers but blocks `/upload` and `/api/`.
- **Semantic, readable markup.** The bar charts are real text and the table uses proper
  `<th scope>` headers and a caption, so the content is readable without CSS.

The ranking table is also filterable in the browser, but all rows are server-rendered
first — the filter hides rows rather than fetching them, so crawlers still see all 100.

---

## Error handling

A CSV from an unknown source, parsed in a browser and sent to a free third-party API, has
plenty of ways to go wrong. The guiding rule is that **a page is always produced**, and that
failures are specific rather than generic.

| Failure | What happens |
| --- | --- |
| No API key configured | Template-written copy is used. The pipeline does not even attempt the call. |
| Gemini errors, times out or is rate-limited | Caught, logged with Google's own message, template copy used. |
| Gemini stalls without responding | Aborted after 45 seconds by `AbortSignal.timeout`, then template copy. |
| Gemini returns unusable JSON | `validateCopy` rejects it if required fields are missing, and falls back field by field for anything over-length or absent. |
| A column is missing | That statistic is `null` and its whole section is omitted from the page. |
| No company name column at all | 422 with a message naming the headers it actually saw, rather than a generic failure. |
| CSV has no rows, or over 2000 | 400 and 413 respectively, checked before any work is done. |
| Unknown blog slug | Proper 404 page, not a crash. |
| `/upload` on a public deploy | Optional passcode via `NUXT_UPLOAD_PASSCODE`. |

The fallback copy is not a stub. `templateCopy()` builds a complete page — title, meta
description, intro, per-section insights, conclusion and FAQ — from the same computed
statistics, in British English. The record stores which path was used (`copySource:
'gemini' | 'template'`), it is shown on the page footer and tagged on the blog index, so
there is no ambiguity about what wrote the copy.

The FAQ is a small example of the same thinking. A names-only CSV produced no FAQ, which
left a heading with nothing under it and an invalid empty `FAQPage`. The template now always
includes one question answerable from the row count alone, so the section is never empty.

---

## Tests

```bash
npm test
```

17 Vitest tests. They run against `server/lib`, which is deliberately plain TypeScript with
no Nuxt-specific imports, so it can be tested directly with no framework harness, no
running server, no network and no API key.

The tests are built around four fixture CSVs, because the real risk in this project is not
a logic bug — it is an unfamiliar CSV shape on the day:

| Fixture | What it proves |
| --- | --- |
| `fintech.csv` | The supplied dataset. Exact mapping and headline statistics, including that `Wealth, asset and investment management` stays one tag rather than splitting on its commas. |
| `healthtech_messy.csv` | Different header names, blank values, `N/A`, no rank column (so it ranks by amount instead), and no employees column (so that section disappears). |
| `ai_alt_headers.csv` | Headers sharing no vocabulary with the others (`Entity`, `Cash Raised`, `Verticals`). Mixed money formats in one column: `$12.5m`, `£1.1bn`, `950k`, `£17,600,000`, `N/A` and blank. Proves the name column can be found from values alone. |
| `cleantech_sparse.csv` | The worst case: a name and a description, nothing else. Every statistic goes `null` and the page still renders. |

There are also two end-to-end `buildBlog` tests: one asserting a brand-new CSV becomes a
complete record with template copy, and one asserting a CSV with no name column fails with
a readable error.

---

## Design decisions and trade-offs

- **One dynamic SSR route, not generated static pages.** The brief requires upload → page
  with no rebuild. Static generation would need a build step per upload. The cost is
  rendering per request rather than serving a static file; for a page of this size that is
  a fair trade, and the storage read is a single key lookup.
- **Statistics in code, prose from the LLM.** Covered above. It is the decision I would
  defend hardest.
- **Columns detected rather than mapped by hand.** A manual mapping UI would be more
  accurate but adds a step and more code; detection covers the realistic cases and the
  upload page shows what it found, including the roles it could not fill, so there is no
  guessing.
- **Storage behind an interface.** JSON files locally, Upstash Redis in production,
  identical calling code, because a serverless filesystem is read-only.
- **No SDKs or UI libraries.** One HTTP call and one stylesheet do not justify the
  dependencies or the bundle size.

### What I would do next

- Validate the generated copy against the facts automatically — reject any number in the
  prose that does not appear in `buildFacts()`, rather than relying on the prompt.
- Per-page Open Graph images.
- Let the user correct a detected column from the upload page when detection gets it wrong.
- Cache Gemini responses by dataset fingerprint, to avoid paying for a regeneration that
  would produce the same copy.
