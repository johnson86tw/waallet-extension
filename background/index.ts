import browser from "webextension-polyfill"

import number from "~packages/util/number"
import {
  getLocalStorage,
  StorageAction,
  UserOperationStatus,
  type UserOperationLog
} from "~storage/local"
import { getSessionStorage } from "~storage/session"

import {
  AccountStorageManager,
  NetworkStorageManager
} from "../storage/local/manager"
import { UserOperationStoragePool } from "./pool"
import { setupWaalletBackgroundProvider } from "./provider"

console.log(
  "Live now; make now always the most precious time. Now will never come again."
)

async function main() {
  const storage = await getLocalStorage()
  storage.subscribe(async (state) => {
    // Avoid "Receiving end does not exist" error due to missing app-side addListener.
    try {
      await browser.runtime.sendMessage(browser.runtime.id, {
        action: StorageAction.Sync,
        state
      })
    } catch (e) {
      console.warn(`An error occurred while receiving end: ${e}`)
    }
  })
  const state = storage.get()
  const network = state.network[state.networkActive]
  if (!network) {
    throw new Error("No available network")
  }
  const networkManager = new NetworkStorageManager(storage)
  const accountManager = new AccountStorageManager(storage, networkManager)
  setupWaalletBackgroundProvider({
    accountManager,
    networkManager,
    userOpPool: new UserOperationStoragePool(storage)
  })

  const sessionStorage = await getSessionStorage()
  // TODO: Handle multiple popup case
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === "app") {
      if (!sessionStorage.get().isPopupOpened) {
        sessionStorage.set((draft) => {
          draft.isPopupOpened = true
        })
      }
      const intervalId = setInterval(() => {
        port.postMessage({ action: "ping" })
      }, 3000)
      port.onDisconnect.addListener(() => {
        if (sessionStorage.get().isPopupOpened) {
          sessionStorage.set((draft) => {
            draft.isPopupOpened = false
          })
        }
        clearInterval(intervalId)
      })
    }
  })

  // @dev: Trigger popup when new pending user op is added into the pool.
  storage.subscribe(
    async (_, patches) => {
      const newPendingUserOpLogs = patches.filter(
        (p) =>
          p.op === "add" &&
          (p.value as UserOperationLog).status === UserOperationStatus.Pending
      )
      if (newPendingUserOpLogs.length === 0) {
        return
      }
      if (sessionStorage.get().isPopupOpened) {
        return
      }
      await browser.windows.create({
        url: browser.runtime.getURL("popup.html"),
        focused: true,
        type: "popup",
        width: 480,
        height: 720
      })
    },
    { userOpPool: {} }
  )

  const fetchUserOpsSent = async () => {
    const timeout = 1500
    console.log(`[background] fetch userOp sent every ${timeout} ms`)

    const s = storage.get()
    const { bundler } = networkManager.getActive()

    const userOps = Object.values(s.userOpPool)
    const sentUserOps = userOps.filter(
      (userOp) => userOp.status === UserOperationStatus.Sent
    )

    sentUserOps.forEach(async (sentUserOp) => {
      const id = sentUserOp.id
      if (!("receipt" in sentUserOp)) {
        return
      }
      const userOpHash = sentUserOp.receipt.userOpHash
      await bundler.wait(userOpHash)

      const userOpReceipt = await bundler.getUserOperationReceipt(userOpHash)

      if (!userOpReceipt) {
        return
      }

      if (userOpReceipt.success) {
        const succeededUserOp: UserOperationLog = {
          ...sentUserOp,
          status: UserOperationStatus.Succeeded,
          receipt: {
            userOpHash: userOpHash,
            transactionHash: userOpReceipt.receipt.transactionHash,
            blockHash: userOpReceipt.receipt.blockHash,
            blockNumber: number.toHex(userOpReceipt.receipt.blockNumber)
          }
        }
        storage.set((state) => {
          state.userOpPool[id] = succeededUserOp
        })
        return
      }

      if (!userOpReceipt.success) {
        const failedUserOp: UserOperationLog = {
          ...sentUserOp,
          status: UserOperationStatus.Failed,
          receipt: {
            userOpHash: userOpHash,
            transactionHash: userOpReceipt.receipt.transactionHash,
            blockHash: userOpReceipt.receipt.blockHash,
            blockNumber: number.toHex(userOpReceipt.receipt.blockNumber),
            errorMessage: userOpReceipt.reason
          }
        }
        storage.set((state) => {
          state.userOpPool[id] = failedUserOp
        })
        return
      }
    })

    setTimeout(fetchUserOpsSent, timeout)
  }

  await fetchUserOpsSent()
}

main()
