import config from "~config/test"
import { describeWaalletSuite } from "~packages/util/testing/suite/waallet"
import { UserOperationSender } from "~packages/waallet/background/pool/userOperation/sender"
import { WaalletRpcMethod } from "~packages/waallet/rpc"

import { VerifyingPaymaster } from "./index"

describeWaalletSuite("Verifying Paymaster", (ctx) => {
  const { node } = config.networkManager.getActive()

  const verifyingPaymaster = new VerifyingPaymaster(node, {
    address: config.address.VerifyingPaymaster,
    ownerPrivateKey: config.account.operator.privateKey,
    expirationSecs: 300
  })

  beforeAll(() => {
    ctx.provider = ctx.provider.clone({
      userOperationPool: new UserOperationSender(
        ctx.provider.accountManager,
        ctx.provider.networkManager,
        {
          beforeGasEstimation: async (userOp) => {
            userOp.setPaymasterAndData(
              await verifyingPaymaster.requestPaymasterAndData(userOp, true)
            )
          },
          afterGasEstimation: async (userOp) => {
            userOp.setPaymasterAndData(
              await verifyingPaymaster.requestPaymasterAndData(userOp)
            )
          }
        }
      )
    })
  })

  it("should pay for account", async () => {
    const accountBalanceBefore = await node.getBalance(
      await ctx.account.getAddress()
    )
    const paymasterDepositBalanceBefore =
      await config.contract.entryPoint.balanceOf(
        config.address.VerifyingPaymaster
      )

    await ctx.provider.request({
      method: WaalletRpcMethod.eth_sendTransaction,
      params: [
        {
          to: await ctx.account.getAddress(),
          value: 0
        }
      ]
    })

    const accountBalanceAfter = await node.getBalance(
      await ctx.account.getAddress()
    )
    expect(accountBalanceBefore).toBe(accountBalanceAfter)

    const paymasterDepositBalanceAfter =
      await config.contract.entryPoint.balanceOf(
        config.address.VerifyingPaymaster
      )
    expect(paymasterDepositBalanceBefore).toBeGreaterThan(
      paymasterDepositBalanceAfter
    )
  })
})
