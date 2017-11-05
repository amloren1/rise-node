import {cbToPromise} from '../../helpers/promiseToCback';
import {TransactionType} from '../../helpers/transactionTypes';
import {SignedBlockType} from '../block';
import {BaseTransactionType, IBaseTransaction, IConfirmedTransaction} from './baseTransactionType';

export class SendTransaction extends BaseTransactionType<void> {
  public modules: { accounts: any, rounds: any, system: any };

  constructor() {
    super(TransactionType.SEND);
  }

  public bind(accounts: any, rounds: any, system: any) {
    this.modules = { accounts, rounds, system };
  }

  public calculateFee(tx: IBaseTransaction<void>, sender: any, height: number): number {
    return this.modules.system.getFees(height).fees.send;
  }

  public async verify(tx: IBaseTransaction<void>, sender: any): Promise<void> {
    if (!tx.recipientId) {
      throw new Error('Missing recipient');
    }

    if (tx.amount <= 0) {
      throw new Error('Invalid transaction amount');
    }
  }

  public async apply(tx: IConfirmedTransaction<void>, block: SignedBlockType,
                     sender: any): Promise<void> {
    // Create accoutn if does not exist.
    await cbToPromise((cb) => this.modules.accounts.setAccountAndGet({ address: tx.recipientId }, cb));

    return cbToPromise<void>((cb) => this.modules.accounts.mergeAccountAndGet({
      address  : tx.recipientId,
      balance  : tx.amount,
      blockId  : block.id,
      round    : this.modules.rounds.calc(block.height),
      u_balance: tx.amount,
    }, cb));
  }

  public async undo(tx: IConfirmedTransaction<void>, block: SignedBlockType, sender: any): Promise<void> {
    // Create accoutn if does not exist.
    await cbToPromise((cb) => this.modules.accounts.setAccountAndGet({ address: tx.recipientId }, cb));

    return cbToPromise<void>((cb) => this.modules.accounts.mergeAccountAndGet({
      address  : tx.recipientId,
      balance  : -tx.amount,
      blockId  : block.id,
      round    : this.modules.rounds.calc(block.height),
      u_balance: -tx.amount,
    }, cb));
  }

  public objectNormalize(tx: IBaseTransaction<void>): IBaseTransaction<void> {
    return tx;
  }

  public dbRead(raw: any): void {
    return null;
  }

  // tslint:disable-next-line max-line-length
  public dbSave(tx: IConfirmedTransaction<void> & { senderId: string }): { table: string; fields: string[]; values: any } {
    return null;
  }

}
