import type { PlasmoCSConfig } from "plasmo"

import { WaalletProvider } from "~packages/provider/waallet"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  world: "MAIN",
  run_at: "document_start"
}

console.log(
  "You may find that having is not so pleasing a thing as wanting. This is not logical, but it is often true."
)
;(window as any).waallet = new WaalletProvider("", null as any)
