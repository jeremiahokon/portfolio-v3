# Tooling

- Always use `pnpm` for package management and running scripts in this repo (`pnpm install`, `pnpm dev`, `pnpm build`, `pnpm vitest run`, etc.), never `npm` or `yarn`.

# Writing style

- Never use em dashes ("—") anywhere in this codebase: not in code comments, not in visible copy/UI text, not in commit messages. Use a comma, period, colon, or parentheses instead, whichever reads most naturally.

# Code organization

- `src/components/ui/` is reserved for components installed via the shadcn CLI (`npx shadcn add ...`) only. Never hand-write or hand-edit a new component directly into this folder, even a small one.
- Every hand-written, project-specific component (anything you build yourself rather than install) goes in `src/components/custom/`, imported via the `@/custom/*` path alias. This keeps `ui/` a clean mirror of what the CLI generated, so it's always obvious which files are vendor output versus custom code.
- If a shadcn-installed component later needs custom modification beyond its generated defaults, prefer wrapping it from `custom/` rather than editing the `ui/` original in place.
