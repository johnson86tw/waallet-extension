import type { HexString } from "~typings"

export interface Account {
  getAddress(): Promise<HexString>
  signMessage(message: string | Uint8Array): Promise<string>
}
