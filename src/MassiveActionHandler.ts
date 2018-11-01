import { AbstractActionHandler, Block, HandlerVersion } from "demux"

/**
 * Connects to a Postgres database using [MassiveJS](https://github.com/dmfay/massive-js). This expects that
 * the database has cyanaudit installed, and has `_index_state` and `_block_number_txid` tables. Use a
 * MigrationRunner instance's `setup` method to bootstrap this process.
 */
export class MassiveActionHandler extends AbstractActionHandler {
  protected schemaInstance: any

  constructor(
    protected handlerVersions: HandlerVersion[],
    protected massiveInstance: any,
    protected dbSchema: string = "public",
  ) {
    super(handlerVersions)
    if (this.dbSchema === "public") {
      this.schemaInstance = this.massiveInstance
    } else {
      this.schemaInstance = this.massiveInstance[this.dbSchema]
    }
  }

  protected async handleWithState(handle: (state: any, context?: any) => void): Promise<void> {
    await this.massiveInstance.withTransaction(async (tx: any) => {
      const txid = (await tx.instance.one("select txid_current()")).txid_current
      const context = { txid }
      let db
      if (this.dbSchema === "public") {
        db = tx
      } else {
        db = tx[this.dbSchema]
      }
      try {
        await handle(db, context)
      } catch (err) {
        throw err // Throw error to trigger ROLLBACK
      }
    }, {
      mode: new this.massiveInstance.pgp.txMode.TransactionMode({
        tiLevel: this.massiveInstance.pgp.txMode.isolationLevel.serializable,
      }),
    })
  }

  protected async updateIndexState(
    state: any,
    block: Block,
    isReplay: boolean,
    handlerVersionName: string,
    context: any,
  ) {
    const { blockInfo } = block
    const fromDb = (await state._index_state.findOne({ id: 1 })) || {}
    const toSave = {
      ...fromDb,
      block_number: blockInfo.blockNumber,
      block_hash: blockInfo.blockHash,
      is_replay: isReplay,
      handler_version_name: handlerVersionName,
    }
    await state._index_state.save(toSave)

    await state._block_number_txid.insert({
      block_number: blockInfo.blockNumber,
      txid: context.txid,
    })
  }

  protected async loadIndexState(): Promise<MigrationIndexState> {
    const defaultIndexState = {
      block_number: 0,
      block_hash: "",
      handler_version_name: "v1",
      is_replay: false,
    }
    const indexState = await this.schemaInstance._index_state.findOne({ id: 1 }) || defaultIndexState
    return {
      blockNumber: indexState.block_number,
      blockHash: indexState.block_hash,
      handlerVersionName: indexState.handler_version_name,
      isReplay: indexState.is_replay,
    }
  }
    }
  }

  protected async rollbackTo(blockNumber: number) {
    const blockNumberTxIds = await this.schemaInstance._block_number_txid.where(
      "block_number > $1",
      [blockNumber],
      {
        order: [{
          field: "block_number",
          direction: "desc",
        }],
      },
    )
    for (const { block_number: rollbackNumber, txid } of blockNumberTxIds) {
      console.info(`ROLLING BACK BLOCK ${rollbackNumber}`)
      await this.massiveInstance.cyanaudit.fn_undo_transaction(txid)
    }
    console.info(`Rollback complete!`)
  }
}
