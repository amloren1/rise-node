import { ModelSymbols } from '@risevision/core-models';
import { p2pSymbols, ProtoBufHelper } from '@risevision/core-p2p';
import {
  DBBulkCreateOp,
  DBOp,
  IAccountLogic,
  IAccountsModel,
  IBaseTransaction,
  IBaseTransactionType,
  ICrypto,
  IIdsHandler,
  ILogger,
  ITimeToEpoch,
  ITransactionLogic,
  ITransactionsModel,
  ITransportTransaction,
  SignedAndChainedBlockType,
  SignedBlockType,
  Symbols,
} from '@risevision/core-types';
import * as crypto from 'crypto';
import { inject, injectable, named } from 'inversify';
import * as _ from 'lodash';
import { WordPressHookSystem } from 'mangiafuoco';
import z_schema from 'z-schema';
import {
  TxLogicStaticCheck,
  TxLogicVerify,
  TxSignatureVerify,
} from './hooks/actions';
import {
  TxApplyFilter,
  TxApplyUnconfirmedFilter,
  TxUndoFilter,
  TxUndoUnconfirmedFilter,
} from './hooks/filters';
import { TXBytes } from './txbytes';
import { TXSymbols } from './txSymbols';

// tslint:disable-next-line no-var-requires
const txSchema = require('../schema/transaction.json');

@injectable()
export class TransactionLogic implements ITransactionLogic {
  @inject(Symbols.logic.account)
  private accountLogic: IAccountLogic;

  @inject(Symbols.generic.genesisBlock)
  private genesisBlock: SignedAndChainedBlockType;

  @inject(Symbols.helpers.logger)
  private logger: ILogger;
  @inject(p2pSymbols.helpers.protoBuf)
  private protoBufHelper: ProtoBufHelper;

  @inject(Symbols.helpers.timeToEpoch)
  private timeToEpoch: ITimeToEpoch;

  @inject(Symbols.generic.zschema)
  private schema: z_schema;

  @inject(TXSymbols.txBytes)
  private txBytes: TXBytes;

  @inject(Symbols.helpers.idsHandler)
  private idsHandler: IIdsHandler;

  @inject(ModelSymbols.model)
  @named(TXSymbols.models.model)
  private TransactionsModel: typeof ITransactionsModel;
  @inject(Symbols.generic.hookSystem)
  private hookSystem: WordPressHookSystem;

  @inject(Symbols.generic.txtypes)
  private types: { [type: number]: IBaseTransactionType<any, any> };

  /**
   * Hash for the transaction
   */
  public getHash(tx: IBaseTransaction<any, bigint>): Buffer {
    return crypto
      .createHash('sha256')
      .update(this.types[tx.type].signableBytes(tx))
      .digest();
  }

  public async ready(
    tx: IBaseTransaction<any>,
    sender: IAccountsModel
  ): Promise<boolean> {
    this.assertKnownTransactionType(tx.type);

    if (!sender) {
      return false;
    }

    return this.types[tx.type].ready(tx, sender);
  }

  public assertKnownTransactionType(type: number) {
    if (!(type in this.types)) {
      throw new Error(`Unknown transaction type ${type}`);
    }
  }

  /**
   * Checks if balanceKey is less than amount for sender
   */
  public assertEnoughBalance(
    amount: bigint,
    balanceKey: 'balance' | 'u_balance',
    tx: IBaseTransaction<any>,
    sender: IAccountsModel
  ) {
    // tslint:disable-next-line
    if (tx['blockId'] !== this.genesisBlock.id && sender[balanceKey] < amount) {
      throw new Error(
        `Account does not have enough currency: ${sender.address} balance: ${
          sender[balanceKey]
        } - ${amount}\``
      );
    }
  }

  public async findConflicts(
    txs: Array<IBaseTransaction<any>>
  ): Promise<Array<IBaseTransaction<any>>> {
    const allConflicts: Array<IBaseTransaction<any>> = [];
    const txsByGroup = _.groupBy(txs, (i) => i.type);
    // tslint:disable-next-line forin
    for (const type in txsByGroup) {
      const loopTXs = txsByGroup[type];
      this.assertKnownTransactionType(loopTXs[0].type);

      const conflictingTransactions = await this.types[
        loopTXs[0].type
      ].findConflicts(loopTXs);
      allConflicts.push(...conflictingTransactions);
    }

    return allConflicts;
  }

  public async verify(
    tx: IBaseTransaction<any, bigint>,
    sender: IAccountsModel,
    height: number
  ) {
    this.assertKnownTransactionType(tx.type);
    if (!sender) {
      throw new Error('Missing sender');
    }

    await this.hookSystem.do_action(
      TxLogicStaticCheck.name,
      tx,
      sender,
      height
    );

    if (this.timeToEpoch.getTime() < tx.timestamp) {
      throw new Error(
        'Invalid transaction timestamp. Timestamp is in the future'
      );
    }

    const txID = this.idsHandler.calcTxIdFromBytes(
      this.types[tx.type].fullBytes(tx)
    );
    if (txID !== tx.id) {
      throw new Error(
        `Invalid transaction id - Expected ${txID}, Received ${tx.id}`
      );
    }

    const calcAddress = this.idsHandler.addressFromPubData(tx.senderPubData);
    if (calcAddress !== sender.address || tx.senderId !== calcAddress) {
      throw new Error('Invalid sender address');
    }
    // // Check sender public key
    // if (sender.publicKey && !sender.publicKey.equals(tx.senderPublicKey)) {
    //   // tslint:disable-next-line
    //   throw new Error(
    //     `Invalid sender public key: ${tx.senderPublicKey.toString(
    //       'hex'
    //     )} expected ${sender.publicKey.toString('hex')}`
    //   );
    // }

    // Check sender is not genesis account unless block id equals genesis
    // if (
    //   this.genesisBlock.generatorPublicKey.equals(sender.publicKey) &&
    //   (tx as IBaseTransaction<any>).blockId !== this.genesisBlock.id
    // ) {
    //   throw new Error('Invalid sender. Can not send from genesis account');
    // }

    // Check fee
    const fee = this.types[tx.type].calculateMinFee(tx, sender, height);
    if (fee > tx.fee) {
      throw new Error(`Invalid transaction fee. Min fee is ${fee}`);
    }

    this.assertValidAmounts(tx);

    // Check confirmed sender balance
    this.assertEnoughBalance(tx.amount + tx.fee, 'balance', tx, sender);

    if (!(await this.verifyTxSignature(tx, sender, height))) {
      throw new Error(`Transaction ${tx.id} signature is not valid`);
    }

    await this.hookSystem.do_action(TxLogicVerify.name, tx, sender, height);

    await this.types[tx.type].verify(tx, sender);
  }

  public async verifyTxSignature(
    tx: IBaseTransaction<any, bigint>,
    sender: IAccountsModel,
    height: number
  ) {
    try {
      await this.hookSystem.do_action(
        TxSignatureVerify.name,
        tx,
        this.getHash(tx),
        sender,
        height
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  public async apply(
    tx: IBaseTransaction<any>,
    block: SignedBlockType,
    sender: IAccountsModel
  ): Promise<Array<DBOp<any>>> {
    if (!(await this.ready(tx, sender))) {
      throw new Error('Transaction is not ready');
    }

    const amount = tx.amount + tx.fee;
    this.assertEnoughBalance(tx.amount + tx.fee, 'balance', tx, sender);

    sender.balance -= amount;
    this.logger.trace('Logic/Transaction->apply', {
      balance: -amount,
      // round  : this.roundsLogic.calcRound(block.height),
      sender: sender.address,
    });
    const ops = this.accountLogic.mergeBalanceDiff(sender.address, {
      balance: -amount,
    });
    ops.push(...(await this.types[tx.type].apply(tx, block, sender)));
    return await this.hookSystem.apply_filters(
      TxApplyFilter.name,
      ops,
      tx,
      block,
      sender
    );
  }

  /**
   * Merges account into sender address and calls undo to txtype
   * @returns {Promise<void>}
   */
  public async undo(
    tx: IBaseTransaction<any>,
    block: SignedBlockType,
    sender: IAccountsModel
  ): Promise<Array<DBOp<any>>> {
    const amount = BigInt(tx.amount) + BigInt(tx.fee);

    sender.balance += amount;
    this.logger.trace('Logic/Transaction->undo', {
      balance: amount,
      // round  : this.roundsLogic.calcRound(block.height),
      sender: sender.address,
    });
    const ops = this.accountLogic.mergeBalanceDiff(sender.address, {
      balance: amount,
    });
    ops.push(...(await this.types[tx.type].undo(tx, block, sender)));
    return await this.hookSystem.apply_filters(
      TxUndoFilter.name,
      ops,
      tx,
      block,
      sender
    );
  }

  // tslint:disable-next-line max-line-length
  public async applyUnconfirmed(
    tx: IBaseTransaction<any>,
    sender: IAccountsModel,
    requester?: IAccountsModel
  ): Promise<Array<DBOp<any>>> {
    const amount = tx.amount + tx.fee;
    this.assertEnoughBalance(amount, 'u_balance', tx, sender);

    sender.u_balance -= amount;

    const ops = this.accountLogic.mergeBalanceDiff(sender.address, {
      u_balance: -amount,
    });
    ops.push(...(await this.types[tx.type].applyUnconfirmed(tx, sender)));
    return await this.hookSystem.apply_filters(
      TxApplyUnconfirmedFilter.name,
      ops,
      tx,
      sender
    );
  }

  /**
   * Merges account into sender address with unconfirmed balance tx amount
   * Then calls undoUnconfirmed to the txType.
   */
  public async undoUnconfirmed(
    tx: IBaseTransaction<any>,
    sender: IAccountsModel
  ): Promise<Array<DBOp<any>>> {
    const amount = BigInt(tx.amount) + BigInt(tx.fee);

    sender.u_balance += amount;

    const ops = this.accountLogic.mergeBalanceDiff(sender.address, {
      u_balance: amount,
    });
    ops.push(...(await this.types[tx.type].undoUnconfirmed(tx, sender)));
    return await this.hookSystem.apply_filters(
      TxUndoUnconfirmedFilter.name,
      ops,
      tx,
      sender
    );
  }

  public dbSave(
    txs: Array<IBaseTransaction<any> & { senderId: string }>,
    blockId: string,
    height: number
  ): Array<DBOp<any>> {
    if (txs.length === 0) {
      return [];
    }
    const bulkCreate: DBBulkCreateOp<ITransactionsModel> = {
      model: this.TransactionsModel,
      type: 'bulkCreate',
      values: txs.map((tx) => {
        this.assertKnownTransactionType(tx.type);
        const senderPubData = tx.senderPubData;
        return {
          // tslint:disable object-literal-sort-keys
          id: tx.id,
          blockId,
          height,
          type: tx.type,
          timestamp: tx.timestamp,
          senderPubData,
          senderId: tx.senderId,
          recipientId: tx.recipientId || null,
          amount: BigInt(tx.amount),
          fee: BigInt(tx.fee),
          version: tx.version || 0,
          signatures: tx.signatures,
          // tslint:enable object-literal-sort-keys
        };
      }),
    };
    const subOps: Array<DBOp<any>> = txs
      .map((tx) => this.types[tx.type].dbSave(tx, blockId, height))
      .filter((op) => op);

    return [bulkCreate, ...subOps];
  }

  public async afterSave(tx: IBaseTransaction<any>): Promise<void> {
    this.assertKnownTransactionType(tx.type);
    return this.types[tx.type].afterSave(tx);
  }

  /**
   * Epurates the tx object by removing null and undefined fields
   * Pass it through schema validation and then calls subtype objectNormalize.
   */
  public objectNormalize(
    tx2:
      | IBaseTransaction<any, string | number | bigint>
      | ITransportTransaction<any>
  ): IBaseTransaction<any, bigint> {
    const tx = _.merge({}, tx2);
    this.assertKnownTransactionType(tx.type);
    for (const key in tx) {
      if (tx[key] === null || typeof tx[key] === 'undefined') {
        delete tx[key];
      }
    }
    // Convert hex encoded fields to Buffers (if they're not already buffers)
    if (typeof tx.senderPubData === 'string') {
      tx.senderPubData = Buffer.from(tx.senderPubData, 'hex');
    }
    tx.signatures = (tx.signatures as any[]).map<Buffer>((s) => {
      if (typeof s === 'string') {
        return Buffer.from(s, 'hex');
      }
      return s;
    });

    tx.amount = BigInt(tx.amount);
    tx.fee = BigInt(tx.fee);
    this.assertValidAmounts(tx as IBaseTransaction<any, bigint>);

    const report = this.schema.validate(tx, txSchema);
    if (!report) {
      throw new Error(
        `Failed to validate transaction schema: ${this.schema
          .getLastErrors()
          .map((e) => e.message)
          .join(', ')}`
      );
    }

    // After processing the tx object becomes a IBaseTransaction<any>
    return this.types[tx.type].objectNormalize(tx as IBaseTransaction<
      any,
      bigint
    >);
  }

  public async attachAssets(txs: Array<IBaseTransaction<any>>): Promise<void> {
    if (txs === null) {
      return;
    }
    const txsByGroup = _.groupBy(txs, (i) => i.type);
    // tslint:disable-next-line forin
    for (const type in txsByGroup) {
      const loopTXs = txsByGroup[type];
      this.assertKnownTransactionType(loopTXs[0].type);
      await this.types[loopTXs[0].type].attachAssets(loopTXs);
    }
  }

  public getMaxBytesSize(): number {
    let max = 0;
    Object.keys(this.types).forEach((type) => {
      max = Math.max(max, this.types[type].getMaxBytesSize());
    });
    return max;
  }

  private assertValidAmounts(tx: IBaseTransaction<any, bigint>) {
    // Check amount
    const amountFields = ['fee', 'amount'];
    amountFields.forEach((k) => {
      const v: bigint = tx[k];
      if (typeof v !== 'bigint') {
        throw new Error(`${k} is not a bigint`);
      }
      if (v < 0n) {
        throw new Error(
          `tx.${k} is either negative or greater than totalAmount`
        );
      }
    });
  }
}
