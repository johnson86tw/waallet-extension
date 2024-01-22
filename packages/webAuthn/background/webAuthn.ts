import {
  runtime,
  tabs,
  windows,
  type Runtime,
  type Tabs,
  type Windows
} from "webextension-polyfill"

import json from "~packages/util/json"
import { PortName } from "~packages/webAuthn/tabs/port"
import {
  isWebAuthnError,
  type WebAuthnAuthentication,
  type WebAuthnCreation,
  type WebAuthnError,
  type WebAuthnParams,
  type WebAuthnRegistration,
  type WebAuthnRequest
} from "~packages/webAuthn/typing"

export const createWebAuthn = async (
  webAuthnCreation?: WebAuthnCreation
): Promise<WebAuthnRegistration> => {
  const createWebAuthnParams = new URLSearchParams({
    user: webAuthnCreation?.user ? encodeURI(webAuthnCreation.user) : "",
    challengeCreation: webAuthnCreation?.challenge
      ? webAuthnCreation.challenge
      : ""
  })
  const createWindowUrl = `${runtime.getURL(
    "tabs/createWebAuthn.html"
  )}?${createWebAuthnParams.toString()}`

  return (await openWebAuthnUrl(createWindowUrl)) as WebAuthnRegistration
}

export const requestWebAuthn = async (
  webAuthnRequest: WebAuthnRequest
): Promise<WebAuthnAuthentication> => {
  const requestWebAuthnParams = new URLSearchParams({
    credentialId: webAuthnRequest.credentialId
      ? webAuthnRequest.credentialId
      : "",
    challengeRequest: webAuthnRequest.challenge
  })
  const requestWebauthnUrl = `${runtime.getURL(
    "tabs/requestWebauthn.html"
  )}?${requestWebAuthnParams.toString()}`

  return (await openWebAuthnUrl(requestWebauthnUrl)) as WebAuthnAuthentication
}

export const testWebAuthn = async (
  tabId: number,
  { webAuthnCreation, webAuthnRequest }: WebAuthnParams
): Promise<WebAuthnRegistration | WebAuthnAuthentication> => {
  const webAuthnParams = new URLSearchParams({
    tabId: tabId.toString(),
    user: webAuthnCreation?.user ? encodeURI(webAuthnCreation.user) : "",
    challengeCreation: webAuthnCreation?.challenge
      ? webAuthnCreation.challenge
      : "",
    credentialId: webAuthnRequest.credentialId
      ? webAuthnRequest.credentialId
      : "",
    challengeRequest: webAuthnRequest.challenge
  })
  const webAuthnUrl = `${runtime.getURL(
    "tabs/webAuthn.html"
  )}?${webAuthnParams.toString()}`

  return await openWebAuthnUrl(webAuthnUrl)
}

const openWebAuthnUrl = async (
  url: string
): Promise<WebAuthnRegistration | WebAuthnAuthentication> => {
  let webAuthnRegistration: WebAuthnRegistration
  let webAuthnAuthentication: WebAuthnAuthentication
  let webAuthnError: WebAuthnError
  // Define a listener for port communication
  const portListener = (port: Runtime.Port) => {
    if (port.name === PortName.port_createWebAuthn) {
      // Listener for credential messages from the new window
      port.onMessage.addListener(
        (message: WebAuthnRegistration | WebAuthnError) => {
          if (isWebAuthnError(message)) {
            webAuthnRegistration = undefined
            webAuthnAuthentication = undefined
            webAuthnError = message
          } else {
            webAuthnRegistration = message as WebAuthnRegistration
            webAuthnAuthentication = undefined
            webAuthnError = undefined
            console.log(
              `[background][messaging][window] credential: ${json.stringify(
                webAuthnRegistration,
                null,
                2
              )}`
            )
            port.postMessage({ out: "got credential!" })
          }
        }
      )
    }
    if (port.name === PortName.port_requestWebAuthn) {
      // Listener for signature messages from the new window
      port.onMessage.addListener(
        (message: WebAuthnAuthentication | WebAuthnError) => {
          if (isWebAuthnError(message)) {
            webAuthnRegistration = undefined
            webAuthnAuthentication = undefined
            webAuthnError = message
          } else {
            webAuthnAuthentication = message as WebAuthnAuthentication
            webAuthnRegistration = undefined
            webAuthnError = undefined
            console.log(
              `[background][messaging][window] signature: ${json.stringify(
                webAuthnAuthentication,
                null,
                2
              )}`
            )
            port.postMessage({ out: "got signature!" })
          }
        }
      )
    }
    // Remove the port listener on disconnect
    port.onDisconnect.addListener(() => {
      runtime.onConnect.removeListener(portListener)
    })
  }

  // Return custom promise
  return new Promise(async (resolve, reject) => {
    try {
      // Create a new popup window
      const createdWindowOrTab = await windows.create({
        url: url,
        focused: true,
        type: "popup",
        width: 480,
        height: 720
      })
      // Define a listener for window removal
      const removedListener = (removedWindowId: number) => {
        if (removedWindowId === createdWindowOrTab.id) {
          windows.onRemoved.removeListener(removedListener)
          if (webAuthnError) {
            reject(`${webAuthnError.error}`)
            return
          }
          if (webAuthnRegistration) {
            resolve(webAuthnRegistration)
            return
          }
          if (webAuthnAuthentication) {
            resolve(webAuthnAuthentication)
            return
          }
        }
      }
      // Add the window or tab removal listener
      windows.onRemoved.addListener(removedListener)

      // Add the port listener
      runtime.onConnect.addListener(portListener)
    } catch (e) {
      // Reject the Promise if an error occurs
      reject(e)
      return
    }
  })
}
