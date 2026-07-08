# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A demo of ERC-7715 (permissions), EIP-5792 (`wallet_sendCalls`) and ERC-4337 (smart accounts) built on a Cartesi Rollups V2 tic-tac-toe application. Two independent workspaces (no monorepo tooling), both using **bun** as package manager:

- `backend/` — the Cartesi application (game logic), runs inside a RISC-V Cartesi machine
- `frontend/` — Next.js 16 App Router client, runs on Base Sepolia

## Commands

Frontend (`cd frontend`):

```shell
bun install
bun run dev      # dev server (Turbopack)
bun run build    # production build; also the type-check — there is no separate lint/test setup
```

Backend (`cd backend`):

```shell
bun install
bun run build    # bundles src/index.ts with esbuild (node esbuild.mts)
cartesi build    # builds the Cartesi machine snapshot (requires Docker + @cartesi/cli 2.0.0-alpha.35, the "alpha" npm dist-tag)
cartesi run      # runs a local Cartesi node
```

Pushing a git tag triggers `.github/workflows/release.yml`: builds the machine snapshot (riscv64 via QEMU) and attaches `backend/.cartesi/image` contents as a release tarball.

Frontend env vars live in `frontend/.env` (all `NEXT_PUBLIC_*`, inlined at build time — restart dev server after changing): application address, Cartesi node RPC URL, JAW API key, and an ERC-7677 paymaster URL (Pimlico, Base Sepolia, EntryPoint v0.8).

Formatting: Prettier with `tabWidth: 4` (root `.prettierrc.json`).

## Architecture

### Game round-trip

1. Frontend sends a play as a 1-byte payload (cell index 0–8) via `addInput(application, payload)` on the Cartesi InputBox contract (Base Sepolia), using EIP-5792 `wallet_sendCalls`.
2. The Cartesi node feeds the input to the backend machine. `backend/src/index.ts` (built on `@deroll/app`) validates the move, updates the board (two bitmasks, X and O), and emits a **Notice** containing the full game state as JSON. Players alternate implicitly; `metadata.msgSender` identifies who played.
3. The frontend tracks the round trip in `frontend/src/hooks/game.ts`: `useSendCalls` → `useWaitForCallsStatus` → parse `InputAdded` event from receipts to get the input index → `useWaitForInput` / `useOutputs` (from `@cartesi/wagmi`, talking to the Cartesi node RPC) → decode the Notice into the board state. The single `isPending` returned to the UI is the union of all these stages.

### Wallet / session model (the subtle part)

Single wagmi v3 config (`frontend/src/wagmi.ts`) with **three connectors** in one provider:

- `metaMask()` — plain EOA path
- `jaw()` (`@jaw.id/wagmi`) — the user's passkey smart account (JAW/JustaName). Grants and interactive sends go through this connector; jaw's method policy never allows headless sends.
- `sessionConnector()` (`frontend/src/connectors/session.ts`) — **internal, hidden from the wallet picker UI**. Wraps a "burner" wallet whose private key lives in localStorage (`session` key). Implements a minimal EIP-1193 provider: `wallet_sendCalls` executes through `@jaw.id/core`'s `Account.fromLocalAccount(...).sendCalls(calls, { permissionId })` (jaw's permission manager contract enforces scope), `wallet_getCallsStatus` proxies jaw's `getCallStatus`.

Session lifecycle (`frontend/src/hooks/session.ts`): creating a session generates a burner key, derives its **counterfactual jaw smart account** (no EIP-7702 — deliberately avoided), and grants an ERC-7715 permission through the connected jaw wallet with `spender` = that smart-account address, scoped to `addInput` on the InputBox with an expiry. The hook then connects the session connector (wagmi requires an active connection to route actions to a connector) and immediately switches the "current" connection back to the user's wallet so the UI selection doesn't change. Deleting a session revokes the permission on-chain.

Play routing is a single pipeline: `sendCalls({ calls, connector: session ? burnerConnector : undefined })`, and `useWaitForCallsStatus({ connector: variables?.connector, id })` polls the same connector that sent. Do not reintroduce a parallel manual send path for sessions — unifying this was a deliberate fix.

Gas: nothing here holds ETH. All UserOperations (including the burner smart account's deployment on first session play) are sponsored via the paymaster URL, passed both to the jaw connector (`paymasters` map) and to `Account.fromLocalAccount` config.

### Constraints worth knowing

- `@tanstack/react-query` is pinned to exactly `5.100.9` because `@jaw.id/wagmi` declares a peer range of `>=5.0.0 <5.100.10`. Don't bump it past that without checking jaw.
- The app is single-chain (Base Sepolia); the session connector assumes `config.chains[0]`.
- SSR wagmi state: cookie storage in the config + `cookieToInitialState` in `src/app/layout.tsx`.
- The UI is Mantine v9 (`c` prop instead of `color` on `Text`/`Anchor`).
- Backend bundling: `@deroll/cmio` is a native addon and must stay `external` in `esbuild.mts`; the Dockerfile copies it next to the bundle.
