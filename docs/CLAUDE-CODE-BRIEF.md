# Claude Code Brief — Audio → Timestamped Subtitle Tool

**Phase:** 0 — Reconnaissance and Planning ONLY
**Status:** Awaiting execution
**Implementation permitted:** NO

---

## HOW TO USE THIS FILE

Paste this into Claude Code:

> Read `CLAUDE-CODE-BRIEF.md` in full. Follow it exactly. You are in Phase 0 — recon and planning only. Do not write any code. Your only output artifact is the plan file specified in Task D. Stop at the approval gate.

---

## SECTION 1 — RULES OF ENGAGEMENT (STRICT, NON-NEGOTIABLE)

These rules override any instinct to be helpful by starting work.

### 1.1 Absolute prohibitions for this phase

- **DO NOT** create, modify, rename, move, or delete any file in the repository, with the single exception of the plan file named in Task D.
- **DO NOT** run `npm install`, `pnpm add`, `yarn add`, or any package manager write command. Read-only inspection of `package.json` and lockfiles only.
- **DO NOT** modify `package.json`, `next.config.*`, `vercel.json`, `tsconfig.json`, or any config file.
- **DO NOT** create branches, stage files, commit, or push.
- **DO NOT** scaffold "just a quick test" or "a minimal proof of concept." Not even in a scratch directory. Not even if it would be genuinely useful.
- **DO NOT** run the dev server, build, or any long-running process. `npm run lint`/`typecheck` for a baseline read is acceptable if they are non-mutating; if unsure, skip and note it.
- **DO NOT** proceed past the approval gate in Section 7 under any circumstances.

### 1.2 Evidence rules

- Every factual claim about the codebase must cite `path/to/file.ts:LINE` or `path/to/file.ts:START-END`. No claims from memory or inference about what the code "probably" does.
- If you cannot verify something, write `UNVERIFIED:` and say exactly what you'd need to check. Do not fill gaps with plausible-sounding assumptions.
- Do not state library versions or API signatures from training data. Read them from the lockfile and from `node_modules/<pkg>/package.json`, or from the package's own `.d.ts` files.
- Where this brief itself asserts a technical fact (see Section 2), **verify it against the installed versions** and flag any mismatch. This brief may be out of date. The repository is the source of truth.

### 1.3 Behavioural rules

- Ask before assuming. If a decision point has two defensible answers, list both in the plan with a recommendation — do not silently pick one.
- Do not re-litigate the architecture in Section 2. It was decided after extensive research. If you find a *codebase-specific* reason it won't work, raise it explicitly as a blocker in the plan; do not quietly substitute a different design.
- Report bad news plainly. If the existing code needs significant refactoring, say so with the estimate.
- No filler. No "Great question!" No summarising what you're about to do before doing it.

### 1.4 Scope guard

If following an instruction in this brief would require touching code, **stop and record it as a planned task instead**. The output of this phase is a document, not a diff.

---

## SECTION 2 — WHAT WE ARE BUILDING (DO NOT REDESIGN)

A browser-only tool: user supplies audio (or video), gets an editable, timestamped transcript, exports SRT/VTT. Nothing is uploaded to any server. This is a sibling to the existing video→audio extraction tool in this repo.

### 2.1 The core architectural decision: two models

Whisper is excellent at *what words were said* and poor at *when they were said* — it was trained to emit segment timestamps at roughly one-second granularity, not word boundaries. So we split the job:

| Job | Model | Output |
|---|---|---|
| Words + punctuation | Whisper (`base`, optionally `small`) | text + coarse segment bounds |
| Timing | wav2vec2 CTC (`wav2vec2-base-960h`) | frame-accurate word start/end |

Whisper's segment timestamps are used **only** to bound the alignment windows. Every timestamp that reaches the user comes from the CTC aligner.

**Consequences that must be reflected in the plan:**

- We use **plain** Whisper ONNX exports, NOT the `*_timestamped` variants. Smaller download, and it avoids a known quantised-decoder session-creation failure in newer transformers.js runtimes.
- We do **not** implement DTW over cross-attention.
- The CTC forced alignment (trellis + Viterbi backtrack) is ~40 lines of JS we write ourselves. It is a single forward pass per chunk — no autoregressive decoding — so it is cheap relative to Whisper.
- Because the aligner is a standalone stage, **re-timing after a user edits a word** is nearly free. This is the product differentiator. Architect for it from day one even though it ships later.

### 2.2 Pipeline stages

```
File
 └─> [1] Decode          FFmpeg.wasm → pcm_s16le, 16 kHz, mono → Int16 in OPFS
 └─> [2] VAD             Silero (ONNX) → speech regions
 └─> [3] Chunk plan      ~30 s windows with boundaries landing in silence
 └─> [4] ASR             Whisper (WebGPU, WASM fallback) → text + segment bounds
 └─> [5] Align           wav2vec2 CTC → per-word start/end + confidence
 └─> [6] Stitch          overlap dedupe, monotonicity, pause normalisation
 └─> [7] Cue build       group words into cues under subtitle readability rules
 └─> [8] Editor          edit text without disturbing time; QC panel
 └─> [9] Export          SRT / VTT / JSON (word-level)
```

### 2.3 Data model (non-negotiable)

**Words are the single source of truth. Cues are a derived view.**

```ts
type Word = {
  id: string
  text: string          // user-editable
  origText: string      // as recognised, for diffing
  start: number         // seconds, from the aligner
  end: number
  conf: number          // 0..1, alignment score
  edited: boolean       // set true on text change → marks region for re-alignment
  timeLocked: boolean   // user dragged this boundary; aligner must not overwrite
}

type Cue = {
  id: string
  wordStart: number     // index into Word[]
  wordEnd: number       // inclusive
  lineBreaks: number[]  // word indices where a line break occurs
  overrideStart?: number  // set only when a human drags the cue handle
  overrideEnd?: number
}
```

Editing a word's `text` must never touch its `start`/`end`. Split/merge/re-segment only rewrite index ranges, making them lossless and trivially undoable. Export is a pure function of `(Word[], Cue[])`.

### 2.4 Subtitle readability defaults (broadcast-standard, make configurable)

- Max 42 characters per line (~16 for CJK)
- Max 2 lines per cue
- Cue duration: min 0.833 s, max 7 s
- Reading speed: 17 CPS default, 20 CPS ceiling
- Minimum 2-frame gap between cues
- Prefer breaks at grammatical boundaries; prefer balanced line lengths

### 2.5 Deployment constraints (Vercel) — these shape the code

1. **Cross-origin isolation must be OFF for this tool.** `COEP: require-corp` blocks cross-origin subresources lacking CORP/CORS — which includes model weight downloads from an external host. ONNX Runtime Web on **WebGPU does not need SharedArrayBuffer**, so we don't need isolation.
2. **Therefore: use the single-threaded FFmpeg core** (`@ffmpeg/core`, not `@ffmpeg/core-mt`) for this tool. Extraction is a small fraction of total runtime. **This may conflict with the existing extraction tool** — see Task A.3, it is the highest-priority finding of this phase.
3. **Model weights are never served from Vercel.** Vercel meters CDN egress ("Fast Data Transfer") per visit, regionally priced. Weights live on Hugging Face Hub or Cloudflare R2. Vercel serves the app shell only.
4. **Ship as a static export where possible.** All compute is client-side; no serverless functions needed, which sidesteps Vercel's function size, body size, and duration limits entirely. Do not propose a server-side transcription fallback.
5. Long, immutable `Cache-Control` on any self-hosted `.wasm` / weights, keyed by revision hash.

---

## SECTION 3 — TASK A: CODEBASE RECONNAISSANCE

Work through this checklist. Record findings with file:line evidence. Where something does not exist, say "not present" rather than omitting the item.

### A.1 Repo shape
- Framework and version (Next.js App/Pages router? Vite? plain?)
- TypeScript or JS; strictness settings
- Package manager and lockfile
- Directory conventions actually in use (not aspirational ones from a README)
- Node version pinned anywhere (`.nvmrc`, `engines`, Vercel setting)

### A.2 The existing extraction pipeline — read it end to end
- Entry point: where does the user's file enter the app?
- Which FFmpeg package and version, exactly, from the lockfile
- **Single-threaded or multi-threaded core?** Quote the import.
- Where is FFmpeg instantiated, and in what execution context?
- Command string(s) currently passed to FFmpeg
- How output is returned to the UI (Blob? ArrayBuffer? object URL?)
- Progress reporting mechanism
- Error handling and abort/cancel support
- Memory hygiene: is `deleteFile` / cleanup called after reads?

### A.3 Worker vs Service Worker — CRITICAL
The user described the extractor as running in a *service worker*. Determine what it actually is.
- Locate every `new Worker(...)`, `new SharedWorker(...)`, and `navigator.serviceWorker.register(...)`
- For each: file:line, what runs inside it, and the message protocol
- If heavy compute genuinely runs in a Service Worker, **flag it as a P0 defect** in the plan. Service workers are terminated on idle timeouts and long-running-task detection (order of tens of seconds; iOS is harsher). Recommend migration to a dedicated Web Worker and estimate the work.
- Note any existing worker bundling config (Next.js worker loader, Vite `?worker`, custom webpack rule) — the new workers must follow the same pattern.

### A.4 Cross-origin isolation status — CRITICAL
- Search for `Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`, `crossOriginIsolated`, `SharedArrayBuffer` across the repo, including `next.config.*`, `vercel.json`, `middleware.*`, and any custom server
- Determine whether isolation is currently enabled, and on which routes (global `source: "/(.*)"` or scoped?)
- **If globally enabled:** this directly conflicts with constraint 2.5.1. Present the resolution options in the plan without picking one:
  - (a) Scope the isolation headers to the extraction route only; serve the transcription route un-isolated
  - (b) Drop isolation app-wide and move extraction to the single-threaded core
  - (c) Keep isolation and mirror all model weights same-origin (loses the "don't serve weights from Vercel" benefit)
  - (d) `COEP: credentialless` — note that Chromium and Firefox support it; Safari support is inconsistent across sources and **must be verified against MDN/caniuse before being relied on**
- Include a runtime-detection recommendation: read `crossOriginIsolated` and select the FFmpeg core accordingly, rather than hardcoding.

### A.5 Audio handling already present
- Any `AudioContext`, `OfflineAudioContext`, `decodeAudioData` usage
- Any existing resampling or PCM conversion helper — if one exists, stage [1] may already be half-built
- Any waveform rendering (wavesurfer.js, peaks.js, custom canvas)
- Any `<audio>`/`<video>` player component with a seek/currentTime API we can drive

### A.6 Storage
- Existing use of OPFS (`navigator.storage.getDirectory`), IndexedDB, Cache API, localStorage
- Any existing quota handling or `QuotaExceededError` catch
- Any existing model/asset caching layer we can extend

### A.7 UI inventory
- Component library (shadcn? MUI? custom?) and styling approach
- Existing progress bar, file dropzone, toast/notification, modal primitives — list what is reusable
- Any virtualised list already in use (`react-window`, `virtua`, TanStack Virtual)
- Routing structure: where would a `/transcribe` route go?

### A.8 State management
- Global store in use (Zustand, Redux, Context, none)?
- How is long-running async work currently modelled in state?

### A.9 Build, deploy, quality gates
- `vercel.json` contents in full
- Build command, output mode (is `output: 'export'` set?)
- Environment variables referenced anywhere in client code
- Test setup and whether any tests currently pass
- Lint/format/typecheck scripts and whether they currently pass clean
- CI workflows
- Current production bundle size if obtainable without a full build; otherwise mark UNVERIFIED

### A.10 Prior ML work
- Any existing `onnxruntime-web`, `@huggingface/transformers`, `@xenova/transformers`, or model-loading code
- **If transformers.js is already installed, record the exact version.** Then verify from that version's own types/source whether the `automatic-speech-recognition` pipeline options this plan relies on exist as described. Report mismatches.

---

## SECTION 4 — TASK B: GAP ANALYSIS

Produce a table mapping each pipeline stage from 2.2 to reality:

| Stage | Status | Evidence | Reusable as-is? | Work needed |
|---|---|---|---|---|
| [1] Decode | exists / partial / missing | `file.ts:12-40` | yes/no/refactor | … |

Then answer explicitly:

1. What is the **smallest first vertical slice** that proves the pipeline end-to-end, given what already exists?
2. What existing code must be **refactored** (not just extended) and why?
3. What are the **hard blockers** — things that cannot proceed until a human decides?
4. What is the **integration seam** between the extraction tool and this tool? Shared decode layer, or separate? Recommend one.

---

## SECTION 5 — TASK C: MODEL HOSTING RUNBOOK

This must be written into the plan file as an executable runbook, not a summary. Assume the person following it has never mirrored a model before.

### C.1 Decide the host

Document both, recommend one:

**Option 1 — Hugging Face Hub**
- Free, already CORS-permissive, models may already exist upstream so mirroring is optional
- Serves as a plain HTTPS CDN; transformers.js targets it by default
- Trade-off: no custom domain, less control over cache headers, rate-limit behaviour is theirs not yours

**Option 2 — Cloudflare R2**
- Zero egress fees, custom domain, full control of CORS and `Cache-Control`
- Trade-off: you own the mirroring, the bucket config, and the cache-busting discipline

Recommendation baseline: **start on Hugging Face, keep the loader host-agnostic behind one config constant so switching to R2 is a one-line change.** Justify or override.

### C.2 Determine the exact file manifest — DO NOT GUESS

For each model, list the actual files required by the installed transformers.js version. Derive this by reading the library's model-loading code, not from memory.

Models needed:
- `onnx-community/whisper-base` (encoder + decoder; note we want fp32 encoder, q4 decoder — confirm which ONNX filenames correspond)
- a `wav2vec2-base-960h` ONNX export for the aligner
- Silero VAD ONNX (ships with the VAD package — confirm whether it must be self-hosted or is CDN-loaded by default)
- `onnxruntime-web` `.wasm` / `.mjs` artifacts, if we choose to self-host rather than CDN them

For each: filename, byte size, and whether it is required or optional. Record a checksum for each file you intend to mirror.

### C.3 Mirroring procedure

Write step-by-step for the chosen host. For Hugging Face this is roughly: authenticate, create the repo, `huggingface-cli upload` or a git-lfs clone-and-push of the specific `onnx/` subfolder, pin to a commit SHA. For R2: create bucket, upload preserving the directory layout transformers.js expects, attach a custom domain, set CORS and cache policy. **Verify the current CLI syntax from official docs before writing the commands into the plan — do not transcribe commands from memory.**

Include for either option:
- Directory layout that must be preserved (the library resolves paths by convention)
- CORS policy: allow `GET`, `HEAD`; `Access-Control-Allow-Origin` for your Vercel production domain, preview-deploy wildcard pattern, and `localhost` for dev
- `Cache-Control: public, max-age=31536000, immutable`
- `Accept-Ranges` / range-request support — the library may issue range requests; confirm and note
- Pin a **revision SHA**, never `main`. Cache keys derive from it.

### C.4 Wiring it to the app

Document how the installed transformers.js version is pointed at a custom host. In recent versions this is done via the `env` object — properties in the neighbourhood of `env.remoteHost`, `env.remotePathTemplate`, `env.allowLocalModels`, `env.allowRemoteModels`, and `env.backends.onnx.wasm.wasmPaths`. **Read the actual `env` type definition from the installed package and document the real property names and semantics.** Flag any that don't exist.

Then specify:
- A single `src/lib/models/config.ts` holding host, revision SHA, model IDs, and dtype choices — the only place these appear
- Progress reporting: how per-file download progress surfaces to the UI
- Cache strategy: where weights persist between sessions, keyed by revision
- Quota handling: wrap cache writes and handle `QuotaExceededError` by falling back to streaming from the CDN each session rather than failing
- A fallback chain: primary host → secondary host → clear user-facing error. Never a silent hang.
- Abort support: model download must be cancellable via `AbortSignal`

### C.5 Verification checklist

Write the steps to prove it works, to be run after implementation:
- DevTools Network: weights fetch from the expected host, status 200, correct `Cache-Control`, no CORS error
- Second load serves from cache with no network request for weights
- `crossOriginIsolated` value logged and matching expectation
- No `blocked:NotSameOriginAfterDefaultedToSameOriginByCoep` entries in the Network panel
- Works on: Chrome desktop, Safari desktop, Firefox desktop, Chrome Android, Safari iOS — record actual pass/fail per browser, no extrapolation

---

## SECTION 6 — TASK D: WRITE THE PLAN FILE

Create **exactly one file**: `docs/PLAN-transcription.md`

If `docs/` does not exist, create it — that is the only directory creation permitted.

### Required structure

1. **Executive summary** — 10 lines max. What we're building, the two-model decision in two sentences, the single biggest risk.
2. **Codebase findings** — output of Task A, organised by the A.x headings, every claim cited.
3. **Gap analysis** — the table and four answers from Task B.
4. **Blockers requiring human decision** — numbered, each with options and a recommendation. The cross-origin isolation question (A.4) goes here if isolation is currently enabled.
5. **Target architecture** — file-by-file layout of what will be created, with one-line purpose each. Module boundaries. Worker topology and message protocol (typed).
6. **Model hosting runbook** — output of Task C, executable.
7. **Milestones** — M1..M5 as below. Each with: scope, files touched, acceptance criteria, rough estimate, and what is explicitly NOT in it.
8. **Acceptance gates** — how each milestone is proven done, including the M2 measurement below.
9. **Risk register** — risk, likelihood, impact, mitigation. Seed it with: WebGPU unavailable/driver issues; GPU memory growth across chunks; mobile memory ceilings; model download failure or quota exhaustion; aligner failure on digits and symbols; transformers.js version regressions; conflict with the existing extraction tool's headers.
10. **Decision log** — every choice made during recon, with rationale. Append-only from here.
11. **Open questions** — anything marked UNVERIFIED, with what's needed to resolve it.

### Milestone shape (adapt to what recon finds)

- **M1 — Pipeline spine.** Decode → VAD → chunk → Whisper text → naive cues → SRT export. No aligner, no editor. Proves end-to-end on a 5-minute file. Explicitly not: word timing, editing, waveform.
- **M2 — The aligner.** wav2vec2 CTC worker, JS trellis + backtrack, calibration offset, score-threshold fallback to Whisper bounds. **Acceptance gate: word-boundary precision and recall measured at a 200 ms collar against a hand-aligned reference clip.** Write the scorer as part of this milestone — it is the gate, not an afterthought.
- **M3 — Editor.** Words-as-source-of-truth store, virtualised cue list, player sync, edit-preserving-time, split/merge/shift, QC panel for CPS and overlap violations.
- **M4 — Re-alignment on edit.** Re-run alignment over the edited cue's audio window only. Respect `timeLocked`.
- **M5 — Hardening.** Model manager UI, resumable long jobs with OPFS checkpointing, mobile degradation path, offline shell.

### Style requirements for the plan file

- Prose over bullet soup where reasoning matters; tables where data compares
- Every codebase claim carries a file:line citation
- No estimates without a stated assumption
- Mark speculation as speculation
- No emoji, no decorative headers
- Assume the reader is the repo owner and knows the domain — do not explain what SRT is

---

## SECTION 7 — APPROVAL GATE (HARD STOP)

When `docs/PLAN-transcription.md` is written, output this and nothing further:

```
PHASE 0 COMPLETE — AWAITING APPROVAL

Plan written to: docs/PLAN-transcription.md

Blockers requiring your decision: <count>
  1. <one line each>

Highest risk identified: <one line>

Files created: docs/PLAN-transcription.md
Files modified: none
Packages installed: none

I will not begin implementation. To proceed, reply with:
  APPROVED — PROCEED WITH M1
or
  REVISE — <what to change>
```

Then **stop and wait**. Do not:
- begin M1 because the plan seems obviously correct
- install dependencies "so we're ready"
- create placeholder files or directories
- interpret enthusiasm, a thumbs up, "looks good", or "nice" as approval

The only valid approval is the literal string `APPROVED — PROCEED WITH M<n>`. Approval for one milestone is **not** approval for the next; return to this gate at the end of every milestone.

---

## SECTION 8 — DEFINITION OF DONE FOR PHASE 0

- [ ] Every item in Section 3 addressed, including explicit "not present" entries
- [ ] Every codebase claim carries a file:line citation
- [ ] Cross-origin isolation status determined and its implications stated (A.4)
- [ ] Whether compute runs in a Service Worker determined, and flagged if so (A.3)
- [ ] Installed transformers.js version recorded, or absence confirmed (A.10)
- [ ] Model file manifest derived from the installed library, not from memory (C.2)
- [ ] `env` property names for host configuration verified against the installed package (C.4)
- [ ] Gap analysis table complete with the four answers
- [ ] Hosting runbook executable by someone who has never done it
- [ ] All five milestones have acceptance criteria; M2's is a measured number
- [ ] Risk register seeded with at least the risks listed in Section 6
- [ ] Zero files modified outside `docs/PLAN-transcription.md`
- [ ] Approval gate text output verbatim
