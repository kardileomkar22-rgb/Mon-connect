# Deploy the contracts and connect the frontend

Contracts live in `blockchain/`. The frontend reads **one generated file**, `src/contracts/deployment.json`
(addresses + ABIs). Deploying overwrites it, so there is no manual copy/paste of ABIs.

## 0. Prerequisites
- Node 18+ (22 tested), MetaMask, a **dedicated deployer wallet** funded with Monad testnet MON (faucet).
- A second address for `FEE_WALLET` (receives the 1% organizer + 1% vendor fees). Defaults to the deployer.

## 1. Install and test
```bash
cd blockchain
npm install
npx hardhat compile
npx hardhat test          # all tests must pass before deploying
```

## 2. Configure secrets (never commit `.env`)
```bash
cp .env.example .env
# edit .env:
#   PRIVATE_KEY=<deployer key, no 0x prefix issues: 64 hex chars>
#   RPC_URL=https://testnet-rpc.monad.xyz
#   FEE_WALLET=<fee receiving address>
```
`.env` is git-ignored. Use a throwaway testnet wallet only.

## 3. Dry run (optional, does not touch the frontend)
```bash
npm run deploy:local
```

## 4. Deploy to Monad testnet (chainId 10143)
```bash
npm run deploy:testnet
```
It deploys, in order: `VerifiedNft` (Organizer), `VerifiedNft` (Service Provider), `ChainConnectV2`, prints each
address / tx hash / block, then writes:
- `src/contracts/deployment.json` - read by the React app (`utils/chainConnectV2.ts`, `utils/nft.ts`)
- `blockchain/deployments/monadTestnet.json` - your permanent record (tx hashes, block numbers, ABIs)

Raw ABI/bytecode artifacts are in `blockchain/artifacts/contracts/<Name>.sol/<Name>.json`.
Check the addresses on https://testnet.monadexplorer.com.

## 5. Run the frontend
```bash
cd ..            # repo root
npm install
npm start
```
Nothing else changes in the React code: it already imports the address/ABI through `utils/chainConnectV2.ts` and `utils/nft.ts`.

## 6. Smoke test (two browser profiles / two wallets)
1. Vendor wallet: Service Provider sign-up -> mint NFT -> save profile (calls `registerVendor`).
2. Organizer wallet: Organizer sign-up -> mint NFT -> Browse Vendors -> Hire (job amount + 1% sent).
3. Vendor: Start Job (proof URL) -> Complete Job.
4. Organizer: Release Payment. Vendor receives amount - 1%; a Job NFT record is minted.
5. Also try: Approve 15% advance, Refund before start.

## Behaviour to know about
- Escrows are paid in native MON. `createEscrowToken` rejects the zero address, so the UI's non-MON token option
  will revert until a real token address field is added.
- Refund is allowed while `Funded`, or `InProgress` after the deadline. Not after the vendor marks `Completed`.
  The organizer's 1% fee is not refunded.
- With the jury removed there is no dispute path: if an organizer never releases a `Completed` job, funds stay locked.
  Consider adding an auto-release timeout.
- Old escrows on the previous contract (`0xeb5e...6845`) are not migrated.
