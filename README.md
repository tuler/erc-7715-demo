# ERC-7715 Demo

This demonstrates the usage of [ERC-7715](https://eip.tools/eip/7715), [EIP-5792](https://eip.tools/eip/5792) and [ERC-4337](https://eip.tools/eip/4337) with a [Cartesi](https://cartesi.io) Rollups V2 application.

The implementation uses [JAW](https://docs.jaw.id) as Smart Account, an identity-first smart account with passkey authentication and programmable permissions. The application runs on the Base Sepolia testnet.

## Backend

The backend implements a simple tic-tac-toe game. Inputs are player choices, automatically alternating Xs and Os.
The game keeps track of stats (wins by Xs and Os and draws).

Build the application backend using the commands below.

```shell
cd backend
bun install
cartesi build
cartesi run
```

A machine snapshot is also built and published as a GitHub release artifact whenever a tag is pushed (see `.github/workflows/release.yml`).

## Frontend

The frontend is implemented using Next.js, [wagmi](https://wagmi.sh) v3 and [Mantine](https://mantine.dev). Users can connect with MetaMask or with a JAW passkey-based smart account. When connected through JAW, the user can create a game "session" by granting an ERC-7715 permission scoped to the InputBox `addInput` function, so subsequent plays don't require individual approvals.

Configure the environment in `frontend/.env` (or `.env.local`):

- `NEXT_PUBLIC_JAW_API_KEY`: JAW API key, from [dashboard.jaw.id](https://dashboard.jaw.id)
- `NEXT_PUBLIC_APPLICATION_ADDRESS`: address of the Cartesi application
- `NEXT_PUBLIC_CARTESI_RPC_URL`: URL of the Cartesi node RPC endpoint

Then run the development server:

```shell
cd frontend
bun install
bun run dev
```
