import browser from "webextension-polyfill"

import {
  UserOperationStatus,
  type UserOperationLog
} from "~background/storage/local"

import { AccountStorageManager, NetworkStorageManager } from "./manager"
import { UserOperationStoragePool } from "./pool"
import { setupWaalletBackgroundProvider } from "./provider"
// TODO: Rename to local storage
import { getStorage } from "./storage/local"
import { getSessionStorage } from "./storage/session"

console.log(
  "Live now; make now always the most precious time. Now will never come again."
)

async function main() {
  const storage = await getStorage()
  const state = storage.get()
  const network = state.network[state.networkActive]
  if (!network) {
    throw new Error("No available network")
  }
  const account = state.account[network.accountActive]
  if (!account) {
    throw new Error("No available account")
  }
  const accountManager = new AccountStorageManager(storage)
  const networkManager = new NetworkStorageManager(storage)
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
    async (state, patches) => {
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
    ["userOpPool"]
  )
}

main()
