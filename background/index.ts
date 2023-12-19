import { EoaOwnedAccount } from "~packages/account/eoa"

import { setupWaalletBackgroundProvider } from "./provider"

console.log(
  "Live now; make now always the most precious time. Now will never come again."
)

const provider = setupWaalletBackgroundProvider({
  nodeRpcUrl: process.env.PLASMO_PUBLIC_NODE_RPC_URL,
  bundlerRpcUrl: process.env.PLASMO_PUBLIC_BUNDLER_RPC_URL
})
EoaOwnedAccount.initWithAddress({
  address: process.env.PLASMO_PUBLIC_ACCOUNT,
  ownerPrivateKey: process.env.PLASMO_PUBLIC_ACCOUNT_OWNER_PRIVATE_KEY
}).then((account) => {
  provider.connect(account)
})

export {}
