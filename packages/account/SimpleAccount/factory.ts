import * as ethers from "ethers"

import type { AccountFactory } from "~packages/account/factory"
import type { ContractRunner } from "~packages/node"
import type { BigNumberish, HexString } from "~typing"

export class SimpleAccountFactory implements AccountFactory {
  private factory: ethers.Contract
  private owner: HexString
  private salt: BigNumberish

  public constructor(
    private runner: ContractRunner,
    option: {
      address: string
      owner: HexString
      salt: BigNumberish
    }
  ) {
    this.factory = new ethers.Contract(
      option.address,
      [
        "function getAddress(address owner, uint256 salt) view returns (address)",
        "function createAccount(address owner,uint256 salt)",
        "function accountImplementation() view returns (address)"
      ],
      this.runner
    )
    this.owner = option.owner
    this.salt = option.salt
  }

  public async getAddress() {
    return ethers.zeroPadValue(
      ethers.stripZerosLeft(
        // The name of `getAddress` conflicts with the function on ethers.Contract.
        // So we build call data from interface and directly send through node rpc provider.
        await this.runner.provider.call(
          await this.factory
            .getFunction("getAddress")
            .populateTransaction(this.owner, this.salt)
        )
      ),
      20
    )
  }

  public async getEntryPoint() {
    const accountImpl = new ethers.Contract(
      await this.factory.accountImplementation(),
      ["function entryPoint() view returns (address)"],
      this.runner
    )
    return accountImpl.entryPoint()
  }

  public async getInitCode() {
    const { data } = await this.factory
      .getFunction("createAccount")
      .populateTransaction(this.owner, this.salt)
    return ethers.concat([await this.factory.getAddress(), data])
  }
}
