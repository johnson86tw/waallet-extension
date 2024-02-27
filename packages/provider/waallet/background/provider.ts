import * as ethers from "ethers"

import { type Account } from "~packages/account"
import { type Paymaster } from "~packages/paymaster"
import { NullPaymaster } from "~packages/paymaster/NullPaymaster"
import { BundlerProvider } from "~packages/provider/bundler/provider"
import { getUserOpHash } from "~packages/provider/bundler/util"
import { JsonRpcProvider } from "~packages/provider/jsonrpc/provider"
import number from "~packages/util/number"
import type { BigNumberish, HexString } from "~typing"

import {
  WaalletRpcMethod,
  type EthEstimateGasArguments,
  type EthEstimateUserOperationGasArguments,
  type EthSendTransactionArguments,
  type WaalletRequestArguments
} from "../rpc"
import { type UserOperationAuthorizer } from "./authorizer/userOperation"

export type WaalletBackgroundProviderOption = {
  userOperationAuthorizer?: UserOperationAuthorizer
  paymaster?: Paymaster
}

export class WaalletBackgroundProvider {
  public account: Account

  private node: ethers.JsonRpcProvider

  public constructor(
    private nodeRpcUrl: string,
    private bundler: BundlerProvider,
    private userOperationAuthorizer: UserOperationAuthorizer,
    private paymaster: Paymaster = new NullPaymaster()
  ) {
    // TODO: Refactor node provider
    this.node = new ethers.JsonRpcProvider(nodeRpcUrl)
  }

  public clone(option?: WaalletBackgroundProviderOption) {
    const provider = new WaalletBackgroundProvider(
      this.nodeRpcUrl,
      this.bundler,
      option?.userOperationAuthorizer ?? this.userOperationAuthorizer,
      option?.paymaster ?? this.paymaster
    )
    if (this.account) {
      provider.connect(this.account)
    }
    return provider
  }

  public connect(account: Account) {
    this.account = account
  }

  public async request<T>(args: WaalletRequestArguments): Promise<T> {
    console.log(args)
    switch (args.method) {
      case WaalletRpcMethod.eth_accounts:
      case WaalletRpcMethod.eth_requestAccounts:
        return [await this.account.getAddress()] as T
      case WaalletRpcMethod.eth_chainId:
        return this.bundler.getChainId() as T
      case WaalletRpcMethod.eth_estimateGas:
        return this.handleEstimateGas(args.params) as T
      case WaalletRpcMethod.eth_estimateUserOperationGas:
        return this.handleEstimateUserOperationGas(args.params) as T
      case WaalletRpcMethod.eth_sendTransaction:
        return this.handleSendTransaction(args.params) as T
      default:
        return new JsonRpcProvider(this.nodeRpcUrl).send(args)
    }
  }

  private async handleEstimateGas(
    params: EthEstimateGasArguments["params"]
  ): Promise<HexString> {
    const [tx] = params
    if (!tx.to) {
      // TODO: When `to` is empty, it should estimate gas for contract creation
      return
    }
    if (
      tx.from &&
      ethers.getAddress(tx.from) !== (await this.account.getAddress())
    ) {
      throw new Error("Address `from` doesn't match connected account")
    }
    // TODO: Use account's entry point
    const [entryPointAddress] = await this.bundler.getSupportedEntryPoints()
    const userOpCall = await this.account.createUserOperationCall({
      to: ethers.getAddress(tx.to),
      value: tx.value,
      data: tx.data
    })
    const paymasterAndData = await this.paymaster.requestPaymasterAndData(
      userOpCall,
      { isGasEstimation: true }
    )
    const { callGasLimit } = await this.bundler.estimateUserOperationGas(
      {
        ...userOpCall,
        ...(tx.gas && {
          callGasLimit: tx.gas
        }),
        paymasterAndData
      },
      entryPointAddress
    )
    return number.toHex(callGasLimit)
  }

  private async handleEstimateUserOperationGas(
    params: EthEstimateUserOperationGasArguments["params"]
  ): Promise<{
    preVerificationGas: HexString
    verificationGasLimit: HexString
    callGasLimit: HexString
  }> {
    const [userOp] = params
    const [entryPointAddress] = await this.bundler.getSupportedEntryPoints()
    const { callGasLimit, verificationGasLimit, preVerificationGas } =
      await this.bundler.estimateUserOperationGas(userOp, entryPointAddress)
    return {
      callGasLimit: number.toHex(callGasLimit),
      verificationGasLimit: number.toHex(verificationGasLimit),
      preVerificationGas: number.toHex(preVerificationGas)
    }
  }

  private async handleSendTransaction(
    params: EthSendTransactionArguments["params"]
  ): Promise<HexString> {
    const [tx] = params
    // TODO: Check tx from is same as account
    if (!tx.to) {
      // TODO: When `to` is empty, it should create contract
      return
    }
    if (
      tx.from &&
      ethers.getAddress(tx.from) !== (await this.account.getAddress())
    ) {
      throw new Error("Address `from` doesn't match connected account")
    }
    // TODO: Use account's entry point
    const [entryPointAddress] = await this.bundler.getSupportedEntryPoints()
    // TODO: Integrate paymaster
    const userOpCall = await this.account.createUserOperationCall({
      to: ethers.getAddress(tx.to),
      value: tx.value,
      data: tx.data,
      nonce: tx.nonce
    })
    const userOpGasFee = await this.estimateGasFee(tx.gasPrice)
    const paymasterAndData = await this.paymaster.requestPaymasterAndData(
      userOpCall,
      { isGasEstimation: true }
    )
    const userOpGasLimit = await this.bundler.estimateUserOperationGas(
      {
        ...userOpCall,
        ...(tx.gas && {
          callGasLimit: tx.gas
        }),
        paymasterAndData
      },
      entryPointAddress
    )
    const userOp = {
      ...userOpCall,
      ...userOpGasLimit,
      ...userOpGasFee,
      paymasterAndData
    }
    const userOpAuthorized = await this.userOperationAuthorizer.authorize(
      userOp,
      {
        onApproved: async (userOpAuthorized, metadata) => {
          const userOpAuthorizedHash = await getUserOpHash(
            userOpAuthorized,
            entryPointAddress,
            await this.bundler.getChainId()
          )
          userOpAuthorized.signature = await this.account.sign(
            userOpAuthorizedHash,
            metadata
          )
          return userOpAuthorized
        }
      }
    )
    const userOpAuthorizedHash = await this.bundler.sendUserOperation(
      userOpAuthorized,
      entryPointAddress
    )
    if (!userOpAuthorizedHash) {
      throw new Error("Send user operation fail")
    }
    const txHash = await this.bundler.wait(userOpAuthorizedHash)

    return txHash
  }

  private async estimateGasFee(gasPrice?: BigNumberish): Promise<{
    maxFeePerGas: BigNumberish
    maxPriorityFeePerGas: BigNumberish
  }> {
    if (gasPrice) {
      return {
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: gasPrice
      }
    }
    const fee = await this.node.getFeeData()
    const gasPriceWithBuffer = (fee.gasPrice * 120n) / 100n
    // TODO: maxFeePerGas and maxPriorityFeePerGas too low error
    return {
      maxFeePerGas: gasPriceWithBuffer,
      maxPriorityFeePerGas: gasPriceWithBuffer
    }
  }
}
