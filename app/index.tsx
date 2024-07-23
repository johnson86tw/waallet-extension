import { useEffect } from "react"
import browser from "webextension-polyfill"
import { Redirect, Route, Router, Switch } from "wouter"
import { useHashLocation } from "wouter/use-hash-location"
import { useShallow } from "zustand/react/shallow"

import { ProviderContextProvider } from "~app/context/provider"
import { AccountList } from "~app/page/accountList"
import { Home } from "~app/page/home"
import { Receive } from "~app/page/receive"
import { Review } from "~app/page/review/"
import { Send } from "~app/page/send"
import { WebAuthnAuthentication } from "~app/page/webauthn/authentication"
import { WebAuthnDevtool } from "~app/page/webauthn/devtool"
import { WebAuthnRegistration } from "~app/page/webauthn/registration"
import { Path } from "~app/path"
import { useStorage } from "~app/storage"

import "~style.css"

import { Toast } from "./component/toast"
import { ToastProvider } from "./context/toastContext"

export function App() {
  useEffect(() => {
    const port = browser.runtime.connect({
      name: "app"
    })
    port.onMessage.addListener((message: { action: string }) => {
      if (message.action === "ping") {
        port.postMessage({ action: "pong" })
      }
    })
  }, [])

  const isStateInitialized = useStorage(
    useShallow((storage) => storage.state !== null)
  )

  if (!isStateInitialized) {
    return <></>
  }
  return (
    <ProviderContextProvider>
      <ToastProvider>
        {/* Waallet popup script page */}
        <div className="w-[390px] h-[600px] px-[16px] pt-[20px]">
          <Toast />
          <PageRouter />
        </div>
      </ToastProvider>
    </ProviderContextProvider>
  )
}

function PageRouter() {
  const [location, navigate] = useHashLocation()
  // https://github.com/molefrog/wouter/issues/132#issuecomment-704372204
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location])

  const hasPendingTx = useStorage(
    useShallow(({ state }) => Object.keys(state.pendingTransaction).length > 0)
  )
  if (hasPendingTx && !location.startsWith(Path.Review)) {
    navigate(Path.Review)
    return
  }

  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path={Path.AccountList} component={AccountList} />
        <Route path={Path.Home} component={Home} />
        <Route path={Path.Receive} component={Receive} />
        <Route path={Path.Review} component={Review} />
        <Route path={Path.Send} component={Send} />
        {/* To enable the Send page to accept a token address as a parameter */}
        <Route path={`${Path.Send}/:tokenAddress`} component={Send} />
        <Route
          path={Path.WebAuthnAuthentication}
          component={WebAuthnAuthentication}
        />
        <Route path={Path.WebAuthnDevtool} component={WebAuthnDevtool} />
        <Route
          path={Path.WebAuthnRegistration}
          component={WebAuthnRegistration}
        />
        <Route path="*">
          <Redirect to={Path.Home} />
        </Route>
      </Switch>
    </Router>
  )
}
