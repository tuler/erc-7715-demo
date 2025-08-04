# ERC-7715 Demo

This demonstrates the usage of [ERC-7715](https://eip.tools/eip/7715), [EIP-5792](https://eip.tools/eip/5792) and [ERC-4337](https://eip.tools/eip/4337) with a [Cartesi](https://cartesi.io) Rollups V2 application.

The implementation uses [ZeroDev Kernel](https://docs.zerodev.app) as Smart Account.

## Backend

The backend implements a simple tick-tac-toe game. Inputs are player choices, automatically alternating Xs and Os.
The game keeps tracks of stats (wins by Xs and Os and draws).

Run a local cartesi environment, build the application backend and deploy it using the commands below.

```shell
cd backend
pnpm i
cartesi build
cartesi run --services bundler,paymaster,passkey
```

## Frontend

Frontend is implemented using Next and requires a browser with MetaMask installed.

```shell
cd frontend
pnpm i
pnpm run dev
```
