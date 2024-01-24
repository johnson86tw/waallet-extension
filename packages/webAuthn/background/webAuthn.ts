import { runtime, windows, type Runtime } from "webextension-polyfill"

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

export const createWebAuthn = async (webAuthnCreation?: WebAuthnCreation) => {
  const createWebAuthnParams = new URLSearchParams({
    user: webAuthnCreation?.user ? encodeURI(webAuthnCreation.user) : "",
    challengeCreation: webAuthnCreation?.challenge
      ? webAuthnCreation.challenge
      : ""
  })
  const createWindowUrl = `${runtime.getURL(
    "tabs/createWebAuthn.html"
  )}?${createWebAuthnParams.toString()}`

  const { result, cancel } = await openWebAuthnUrl(createWindowUrl)

  return { result: result as Promise<WebAuthnRegistration>, cancel }
}

export const requestWebAuthn = async (webAuthnRequest: WebAuthnRequest) => {
  const requestWebAuthnParams = new URLSearchParams({
    credentialId: webAuthnRequest.credentialId
      ? webAuthnRequest.credentialId
      : "",
    challengeRequest: webAuthnRequest.challenge
  })
  const requestWebauthnUrl = `${runtime.getURL(
    "tabs/requestWebauthn.html"
  )}?${requestWebAuthnParams.toString()}`

  const { result, cancel } = await openWebAuthnUrl(requestWebauthnUrl)

  return {
    result: result as Promise<WebAuthnAuthentication>,
    cancel
  }
}

export const testWebAuthn = async (
  tabId: number,
  { webAuthnCreation, webAuthnRequest }: WebAuthnParams
) => {
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

  return openWebAuthnUrl(webAuthnUrl)
}

// TODO: Split it due to too many responsibilities.
const openWebAuthnUrl = async (url: string) => {
  let webAuthnRegistration: WebAuthnRegistration
  let webAuthnAuthentication: WebAuthnAuthentication
  let webAuthnError: WebAuthnError
  // Define a listener for port communication
  const portOnConnectHandler = (port: Runtime.Port) => {
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
      runtime.onConnect.removeListener(portOnConnectHandler)
    })
  }

  const w = await windows.create({
    url: url,
    focused: true,
    type: "popup",
    width: 0,
    height: 0
  })

  const result = new Promise<WebAuthnRegistration | WebAuthnAuthentication>(
    async (resolve, reject) => {
      // Define a listener for window removal
      const windowOnRemovedHandler = (removedWindowId: number) => {
        if (removedWindowId !== w.id) {
          return
        }
        windows.onRemoved.removeListener(windowOnRemovedHandler)

        if (webAuthnError) {
          return reject(`${webAuthnError.error}`)
        }
        if (webAuthnRegistration) {
          return resolve(webAuthnRegistration)
        }
        if (webAuthnAuthentication) {
          return resolve(webAuthnAuthentication)
        }
        return reject("Cannot get response from WebAuthn window")
      }
      // Add the window or tab removal listener
      windows.onRemoved.addListener(windowOnRemovedHandler)

      // Add the port listener
      runtime.onConnect.addListener(portOnConnectHandler)
    }
  )

  const cancel = async () => {
    await windows.remove(w.id)
  }

  return { result, cancel }
}
