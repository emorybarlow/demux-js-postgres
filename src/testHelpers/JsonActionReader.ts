import { AbstractActionReader, Block } from "demux"

/**
 * Reads from an array of `Block` objects, useful for testing.
 */
export class JsonActionReader extends AbstractActionReader {
  constructor(
    public blockchain: Block[],
    public startAtBlock: number = 1,
    protected onlyIrreversible: boolean = false,
    protected maxHistoryLength: number = 600,
  ) {
    super(startAtBlock, onlyIrreversible, maxHistoryLength)
  }

  public async getHeadBlockNumber(): Promise<number> {
    const block = this.blockchain.slice(-1)[0]
    const { blockInfo: { blockNumber } } = block
    if (this.blockchain.length !== blockNumber) {
      throw Error(`Block at position ${this.blockchain.length} indicates position ${blockNumber} incorrectly.`)
    }
    return blockNumber
  }

  public async getBlock(blockNumber: number): Promise<Block> {
    const block = this.blockchain[blockNumber - 1]
    if (!block) {
      throw Error(`Block at position ${blockNumber} does not exist.`)
    }
    if (block.blockInfo.blockNumber !== blockNumber) {
      throw Error(`Block at position ${blockNumber} indicates position ${block.blockInfo.blockNumber} incorrectly.`)
    }
    return block
  }
}
