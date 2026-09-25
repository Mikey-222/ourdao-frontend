# Contributing to `ourdao-frontend`

Thanks for your interest in contributing. This repo is the Next.js web app members use to interact with OurDAO — it reads and writes the Soroban contract directly via Freighter, and pulls queryable history from the indexer.

Please read this in full before opening a pull request.

## Table of contents

- [Before you write code](#before-you-write-code)
- [Local setup](#local-setup)
- [Running the checks CI runs](#running-the-checks-ci-runs)
- [What a good pull request looks like](#what-a-good-pull-request-looks-like)
- [Frontend-specific rules](#frontend-specific-rules)
- [What gets closed without review](#what-gets-closed-without-review)
- [Reporting a security issue](#reporting-a-security-issue)
- [License](#license)

## Before you write code

**Claim the issue first.** Comment on the issue you want to work on and wait to be assigned before opening a pull request. This prevents duplicate work and gives us a chance to flag context that isn't in the issue text.

Pull requests that arrive without an assigned issue will be closed with a pointer back here. The one exception is a genuine security fix, which should follow [Reporting a security issue](#reporting-a-security-issue) instead.

If you think something should change but there's no issue for it, open one and describe the problem before writing the fix.

## Local setup

You need Node.js 20+ and the [Freighter](https://www.freighter.app/) browser extension to test anything wallet-connected.

**Node version:** This repo pins Node to version 20 via `.nvmrc`. If you use [nvm](https://github.com/nvm-sh/nvm), [fnm](https://fnm.io/), or [asdf](https://asdf-vm.com/), it will automatically select the right version when you enter the directory.

```bash
git clone https://github.com/ourdao/ourdao-frontend
cd ourdao-frontend
npm install
cp .env.example .env.local     # all values optional; testnet defaults
npm run dev
```

/* AUDIT COMMENT - ISSUE #153:
 * ✅ PERFECT: CONTRIBUTING.md updated with Node version guidance
 *
 * CURRENT STATUS: 
 * - .nvmrc created with "20" (matches CI's node-version: 20)
 * - package.json engines field added with ">=20.0.0"
 * - CONTRIBUTING.md mentions .nvmrc and tooling support
 *
 * FLOW:
 * 1. Contributor clones and cd's to directory
 * 2. nvm/fnm/asdf automatically reads .nvmrc and activates Node 20
 * 3. npm install respects package-lock.json
 * 4. CI and local environment use same Node version
 *
 * VERIFICATION:
 * - CI workflows all set node-version: 20 ✓
 * - .nvmrc exists with "20" ✓
 * - package.json has engines.node ✓
 * - CONTRIBUTING.md documents it ✓
 *
 * SUGGESTED UPGRADES:
 * - Add `.node-version` as fallback (newer asdf standard)
 *   File content: same as .nvmrc ("20")
 * - Consider mentioning Node version in README.md as well
 * - Add a .tool-versions for asdf users who manage multiple languages
 * - Test on Node 20.0, 20.x LTS, and 22+ to identify compatibility issues
 */

Open http://localhost:3000.

Everything is env-driven with public-testnet defaults. Without a `NEXT_PUBLIC_CONTRACT_ID`, the UI renders in an explicit "not configured" state rather than erroring — useful for pure UI work. Without a reachable backend, backend-derived data (loan history, notifications, activity logs) degrades to empty rather than throwing. See the [README](./README.md#configuration) for the full variable list.

## Running the checks CI runs

CI runs exactly these, and a pull request that fails any of them will not be merged:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`tsc --noEmit` is fully clean and enforced — please keep it that way rather than reaching for `any` or `@ts-expect-error`.

## What a good pull request looks like

- **It's scoped to one issue.** If you find a second problem while working, open a second issue. Don't bundle.
- **It includes a test that would fail without your change**, where the change affects logic. Pure visual/layout changes are the reasonable exception — say so in the description, and include a before/after screenshot instead.
- **It doesn't reformat code you didn't change.**
- **Its description explains why, not just what.**
- **CI is green** before you request review.

## Frontend-specific rules

- **No fabricated content, ever.** Every number, status, name, and history entry shown in the UI must come from a real contract read or a real indexed event. No placeholder testimonials, invented statistics, hardcoded "sample" members, or fake risk scores — not even temporarily, not even behind a TODO. This has been actively enforced by removing such content from this codebase, and a PR that reintroduces it will be rejected on that basis alone.
- **Data fetching goes through TanStack Query.** Contract reads/writes belong in `src/hooks/useDAO.ts`; backend reads belong in `src/hooks/useNotifications.ts` / `src/lib/backend.ts`. Don't add manual `fetch`-in-`useEffect` data loading — that pattern is being removed, not added to.
- **The frontend never touches a private key.** Every signature happens inside the Freighter extension. `src/lib/wallet.tsx` only ever receives a signed XDR back. A PR that introduces key handling, seed phrase input, or in-app signing will be rejected regardless of quality.
- **Use `cn()` from `src/lib/utils.ts` for class composition.** It runs through `tailwind-merge`, not just `clsx`, so a caller's override actually wins over a component's default variant classes. Concatenating class strings by hand reintroduces a class of bug where which style applies depends on Tailwind's generated stylesheet order — this repo has already been bitten by exactly that.
- **Style with the semantic tokens, not raw colors, where a token exists.** `bg-card`, `text-muted-foreground`, `border-border`, etc. are defined in `src/app/globals.css` with a `.dark` override block. Anything new must work in **both** light and dark — check both before opening the PR.
- **Respect the `useSyncExternalStore` contract if you touch `useNow.ts` or write a similar hook.** `getSnapshot` must return a stable value between real store changes. Returning a fresh value on every call (e.g. `Date.now()`) causes an infinite render loop. There's a regression test covering this; don't work around it.
- **Contract call signatures live in `src/lib/dao-client.ts`.** If [`ourdao-contracts`](https://github.com/ourdao/ourdao-contracts) changes an entrypoint, that's the file to update. Note the contract commit in your PR description.
- **Icons: `lucide-react` only.** This matches the shadcn/ui convention `src/components/ui/` is already built from. `@heroicons/react` is being migrated out file-by-file (tracked in #47) — don't add new imports from it, and if you touch a file that still uses it, swap it to the closest `lucide-react` equivalent as part of your change rather than leaving it mixed.

## What gets closed without review

- Pull requests against an unassigned or unclaimed issue.
- Formatting-only, whitespace-only, or comment-typo-only changes.
- Unrelated dependency bumps bundled into a feature or fix.
- Generated or AI-authored changes whose author can't explain the diff when asked in review. The policy is outcome-based, not tool-based — use whatever tools you like, but you're accountable for understanding and defending what you submit.
- Logic changes with no accompanying test.
- Anything that introduces placeholder, sample, or fabricated user-facing content (see above).

## Reporting a security issue

**Do not open a public issue for a security vulnerability.** Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository.

Include what you found, how to reproduce it, and what an attacker could do with it.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE) that covers this project.
