import { v4 as uuidv4 } from "uuid"
import browser from "webextension-polyfill"

import { sendToBackground, type MessageName } from "@plasmohq/messaging"

import { config } from "~config"
import { AccountType } from "~packages/account"
import type { UserOperationData } from "~packages/bundler"
import { ObservableStorage } from "~packages/storage/observable"
import type { B64UrlString, HexString, RecursivePartial } from "~typing"

let storage: ObservableStorage<State>

export async function getStorage() {
  if (!storage) {
    // TODO: Check browser.runtime.lastError
    const state = await browser.storage.local.get(null)
    storage = new ObservableStorage<State>(state as State)
    storage.subscribe(async (state) => {
      console.log("[background] Write state into storage")
      await browser.storage.local.set(state)
    })
    const account = {
      ...(config.simpleAccountAddress && {
        [uuidv4()]: {
          type: AccountType.SimpleAccount,
          chainId: config.chainId,
          address: config.simpleAccountAddress,
          ownerPrivateKey: config.simpleAccountOwnerPrivateKey
        }
      }),
      ...(config.passkeyAccountAddress && {
        [uuidv4()]: {
          type: AccountType.PasskeyAccount,
          chainId: config.chainId,
          address: config.passkeyAccountAddress,
          credentialId: config.passkeyAccountCredentialId
        }
      })
    }
    const paymaster = {
      ...(config.verifyingPaymasterAddress && {
        [uuidv4()]: {
          type: PaymasterType.VerifyingPaymaster,
          chainId: config.chainId,
          address: config.verifyingPaymasterAddress,
          ownerPrivateKey: config.verifyingPaymasterOwnerPrivateKey
        }
      })
    }
    const network = {
      [uuidv4()]: {
        chainId: config.chainId,
        nodeRpcUrl: config.nodeRpcUrl,
        bundlerRpcUrl: config.bundlerRpcUrl,
        accountActive: Object.keys(account)[0]
      }
    }
    // TODO: Only for development at this moment. Remove following when getting to production.
    // Enable only network specified in env
    storage.set(
      {
        networkActive: Object.keys(network)[0],
        network,
        account,
        paymaster,
        userOpPool: {}
      },
      { override: true }
    )
    storage.subscribe(async (state) => {
      console.log(
        "[background] Sync state to app/storage/index.ts (in tabs/index.html)"
      )
      // Avoid "Receiving end does not exist" error due to missing app-side addListener.
      try {
        await browser.runtime.sendMessage(browser.runtime.id, {
          action: StorageAction.Sync,
          state
        })
      } catch (e) {
        if (
          e instanceof Error &&
          e.message.includes(
            `Could not establish connection. Receiving end does not exist.`
          )
        ) {
          console.warn(`An error occurred while receiving end: ${e}`)
        } else {
          console.error(
            `An unexpected error occurred while receiving end: ${e}`
          )
        }
      }
    })
  }
  return storage
}

/* Storage Action */

export enum StorageAction {
  Get = "GetStorage",
  Set = "SetStorage",
  Sync = "SyncStorage"
}

export class StorageMessenger {
  public get(): Promise<State> {
    return this.send({
      action: StorageAction.Get
    })
  }

  public set(
    updates: RecursivePartial<State>,
    option: { override?: boolean } = {}
  ) {
    return this.send({
      action: StorageAction.Set,
      updates,
      option
    })
  }

  private send(body: any) {
    return sendToBackground({
      name: "storage" as MessageName,
      body
    })
  }
}

/* State */

export type State = {
  networkActive: string
  network: {
    [id: string]: Network
  }
  account: {
    [id: string]: Account
  }
  paymaster: {
    [id: string]: Paymaster
  }
  userOpPool: {
    [userOpId: string]: UserOperationStatement
  }
}

/* Netowork */

export type Network = {
  chainId: number
  nodeRpcUrl: string
  bundlerRpcUrl: string
  accountActive: HexString
}

/* Account */

export type Account = SimpleAccount | PasskeyAccount

export type SimpleAccount = {
  type: AccountType.SimpleAccount
  chainId: number
  address: HexString
  ownerPrivateKey: HexString
}

export type PasskeyAccount = {
  type: AccountType.PasskeyAccount
  chainId: number
  address: HexString
  credentialId: B64UrlString
}

/* Paymaster */

export enum PaymasterType {
  VerifyingPaymaster = "VerifyingPaymaster"
}

export type Paymaster = VerifyingPaymaster

export type VerifyingPaymaster = {
  type: PaymasterType
  chainId: number
  address: HexString
  ownerPrivateKey: HexString
}

/* User Operation Pool */

export enum UserOperationStatus {
  Pending = "Pending",
  Sent = "Sent",
  Succeeded = "Succeeded",
  Failed = "Failed"
}

export type UserOperationStatement = {
  id: string
  userOp: UserOperationData
  senderId: string
  networkId: string
  entryPointAddress: string
} & (
  | {
      status: UserOperationStatus.Pending | UserOperationStatus.Sent
    }
  | {
      status: UserOperationStatus.Succeeded
      receipt: {
        userOpHash: HexString
        transactionHash: HexString
        blockHash: HexString
        blockNumber: HexString
      }
    }
  | {
      status: UserOperationStatus.Failed
      receipt: {
        userOpHash: HexString
        transactionHash: HexString
        blockHash: HexString
        blockNumber: HexString
        errorMessage: string
      }
    }
)
