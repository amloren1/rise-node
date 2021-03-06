import { ModelSymbols } from '@risevision/core-models';
import {
  ForkType,
  IAccountsModel,
  IAccountsModule,
  IBlockLogic,
  IBlockReward,
  IBlocksModel,
  IBlocksModule,
  IForkModule,
  IIdsHandler,
  ILogger,
  ITransactionLogic,
  ITransactionPool,
  ITransactionsModule,
  ITXBytes,
  SignedBlockType,
  Symbols,
} from '@risevision/core-types';
import * as crypto from 'crypto';
import { decorate, inject, injectable, named } from 'inversify';
import {
  OnWPAction,
  WordPressHookSystem,
  WPHooksSubscriber,
} from 'mangiafuoco';
import { BlocksConstantsType } from '../blocksConstants';
import { BlocksSymbols } from '../blocksSymbols';
import { OnPostApplyBlock, VerifyBlock, VerifyReceipt } from '../hooks';
import { BlockBytes } from '../logic/blockBytes';
import { BlocksModuleChain } from './chain';

const Extendable = WPHooksSubscriber(Object);
decorate(injectable(), Extendable);

@injectable()
export class BlocksModuleVerify extends Extendable {
  // Helpers
  @inject(BlocksSymbols.constants)
  private blocksConstants: BlocksConstantsType;
  @inject(Symbols.helpers.logger)
  private logger: ILogger;
  // tslint:disable-next-line
  @inject(Symbols.generic.hookSystem)
  public hookSystem: WordPressHookSystem;

  // Logic
  @inject(Symbols.logic.block)
  private blockLogic: IBlockLogic;
  @inject(Symbols.logic.blockReward)
  private blockRewardLogic: IBlockReward;
  // Modules
  @inject(Symbols.modules.accounts)
  private accountsModule: IAccountsModule;
  @inject(BlocksSymbols.modules.chain)
  private blocksChainModule: BlocksModuleChain;
  @inject(Symbols.modules.blocks)
  private blocksModule: IBlocksModule;
  @inject(Symbols.modules.fork)
  private forkModule: IForkModule;
  @inject(Symbols.modules.transactions)
  private transactionsModule: ITransactionsModule;
  @inject(Symbols.logic.transaction)
  private transactionLogic: ITransactionLogic;
  @inject(Symbols.logic.txpool)
  private txPool: ITransactionPool;
  @inject(Symbols.helpers.idsHandler)
  private idsHandler: IIdsHandler;
  @inject(BlocksSymbols.logic.blockBytes)
  private blockBytes: BlockBytes;
  @inject(Symbols.helpers.txBytes)
  private txBytes: ITXBytes;

  // Models
  @inject(ModelSymbols.model)
  @named(Symbols.models.blocks)
  private BlocksModel: typeof IBlocksModel;

  /**
   * Contains the last N block Ids used to perform validations
   */
  private lastNBlockIds: string[] = [];

  /**
   * Verifies block before fork detection and return all possible errors related to block
   */
  public async verifyReceipt(
    block: SignedBlockType
  ): Promise<{ errors: string[]; verified: boolean }> {
    const lastBlock: SignedBlockType = this.blocksModule.lastBlock;

    block.height = lastBlock.height + 1;
    const errors: string[] = [
      this.verifySignature(block),
      this.verifyPreviousBlock(block),
      this.verifyBlockAgainstLastIds(block),
      this.verifyVersion(block),
      this.verifyReward(block),
      this.verifyId(block),
      this.verifyPayload(block),
    ]
      .reduce((a, b) => a.concat(b))
      .reverse();

    return this.hookSystem.apply_filters(
      VerifyReceipt.name,
      {
        errors,
        verified: errors.length === 0,
      },
      block
    );
  }

  /**
   * Verify block before processing and return all possible errors related to block
   */
  public async verifyBlock(
    block: SignedBlockType
  ): Promise<{ errors: string[]; verified: boolean }> {
    const lastBlock: SignedBlockType = this.blocksModule.lastBlock;

    const errors = [
      this.verifySignature(block),
      this.verifyPreviousBlock(block),
      this.verifyVersion(block),
      this.verifyReward(block),
      this.verifyId(block),
      this.verifyPayload(block),
      await this.verifyForkOne(block, lastBlock),
    ].reduce((a, b) => a.concat(b));

    return this.hookSystem.apply_filters(
      VerifyBlock.name,
      {
        errors,
        verified: errors.length === 0,
      },
      block,
      lastBlock
    );
  }

  @OnWPAction('core/loader/onBlockchainReady')
  public async onBlockchainReady() {
    const blocks = await this.BlocksModel.findAll({
      attributes: ['id'],
      limit: this.blocksConstants.slotWindow,
      order: [['height', 'desc']],
      raw: true,
    });
    this.lastNBlockIds = blocks.map((b) => b.id);
  }

  @OnPostApplyBlock()
  public async onNewBlock(block: SignedBlockType) {
    this.lastNBlockIds.push(block.id);
    if (this.lastNBlockIds.length > this.blocksConstants.slotWindow) {
      this.lastNBlockIds.shift();
    }
  }

  public async checkBlockTransactions(
    block: SignedBlockType,
    accountsMap: { [address: string]: IAccountsModel }
  ) {
    const allIds = [];
    for (const tx of block.transactions) {
      tx.id = this.idsHandler.calcTxIdFromBytes(this.txBytes.fullBytes(tx));
      // Apply block id to the tx
      tx.blockId = block.id;
      allIds.push(tx.id);
    }

    // Check for duplicated transactions now that ids are set.
    allIds.sort();
    let prevId = allIds[0];
    for (let i = 1; i < allIds.length; i++) {
      if (prevId === allIds[i]) {
        throw new Error(
          `Duplicated transaction found in block with id ${prevId}`
        );
      }
      prevId = allIds[i];
    }

    // check that none of the transaction exists in db.
    const confirmedIDs = await this.transactionsModule.filterConfirmedIds(
      allIds
    );
    if (confirmedIDs.length > 0) {
      // Error, some of the included transactions are confirmed
      await this.forkModule.fork(block, ForkType.TX_ALREADY_CONFIRMED);
      for (const confirmedID of confirmedIDs) {
        if (this.txPool.unconfirmed.remove(confirmedID)) {
          await this.transactionsModule.undoUnconfirmed(
            block.transactions.filter((t) => t.id === confirmedID)[0]
          );
        }
      }
      throw new Error(
        `Transactions already confirmed: ${confirmedIDs.join(', ')}`
      );
    }

    const conflicts = await this.transactionLogic.findConflicts(
      block.transactions
    );
    if (conflicts.length > 0) {
      throw new Error(
        'Found conflicting transactions in block. Block is invalid!'
      );
    }

    await Promise.all(
      block.transactions.map((tx) =>
        this.transactionsModule.checkTransaction(tx, accountsMap, block.height)
      )
    );
  }

  /**
   * Verify that given block is not already within last known block ids.
   */
  private verifyBlockAgainstLastIds(block: SignedBlockType): string[] {
    if (this.lastNBlockIds.indexOf(block.id) !== -1) {
      return ['Block Already exists in the chain'];
    }
    return [];
  }
  /**
   * Verifies block signature and returns an array populated with errors.
   * @param {SignedBlockType} block
   * @returns {string[]}
   */
  private verifySignature(block: SignedBlockType): string[] {
    const errors = [];
    let valid = false;
    try {
      valid = this.blockLogic.verifySignature(block);
    } catch (e) {
      errors.push(e.toString());
    }

    if (!valid) {
      errors.push('Failed to verify block signature');
    }
    return errors;
  }

  /**
   * Verifies that block has a previousBlock
   */
  private verifyPreviousBlock(block: SignedBlockType): string[] {
    if (!block.previousBlock && block.height !== 1) {
      return ['Invalid previous block'];
    }
    return [];
  }

  /**
   * Verifies that block has a valid version
   */
  private verifyVersion(block: SignedBlockType): string[] {
    if (this.blocksConstants.validVersions.indexOf(block.version) === -1) {
      return ['Invalid block version'];
    }
    return [];
  }

  private verifyReward(block: SignedBlockType): string[] {
    const expected = this.blockRewardLogic.calcReward(block.height);

    if (block.height !== 1 && expected !== BigInt(block.reward)) {
      return [`Invalid block reward: ${block.reward} expected: ${expected}`];
    }
    return [];
  }

  private verifyId(block: SignedBlockType) {
    const id = this.idsHandler.calcBlockIdFromBytes(
      this.blockBytes.signableBytes(block, true)
    );
    if (block.id !== id) {
      return [`BlockID: Expected ${id} - Received ${block.id}`];
    }
    return [];
  }

  /**
   * Verifies that the calculated payload (txs) matches the data from the block
   * @returns {string[]} array of errors. Empty if no errors.
   */
  private verifyPayload(block: SignedBlockType): string[] {
    const errors: string[] = [];
    if (block.payloadLength > this.blocksConstants.maxPayloadLength) {
      errors.push('Payload length is too long');
    }

    if (block.transactions.length !== block.numberOfTransactions) {
      errors.push(
        'Included transactions do not match block transactions count'
      );
    }

    if (block.transactions.length > this.blocksConstants.maxTxsPerBlock) {
      errors.push('Number of transactions exceeds maximum per block');
    }

    let totalAmount = 0n;
    let totalFee = 0n;
    const payloadHash = crypto.createHash('sha256');

    const appliedTransactions = {};

    for (const tx of block.transactions) {
      let bytes: Buffer;
      try {
        bytes = this.txBytes.fullBytes(tx);
        payloadHash.update(bytes);
      } catch (e) {
        this.logger.warn('TX error while verifying block payload', e);
        errors.push(e.toString());
        continue;
      }

      if (appliedTransactions[tx.id]) {
        errors.push(`Encountered duplicate transaction: ${tx.id}`);
      }

      appliedTransactions[tx.id] = tx;
      totalAmount += tx.amount;
      totalFee += tx.fee;
    }

    if (!payloadHash.digest().equals(block.payloadHash)) {
      errors.push('Invalid payload hash');
    }

    if (totalAmount !== block.totalAmount) {
      errors.push('Invalid total amount');
    }

    if (totalFee !== block.totalFee) {
      errors.push('Invalid total fee');
    }
    return errors;
  }

  /**
   * Verifies if this block is after the previous one or is on another chain (Fork type 1)
   */
  private async verifyForkOne(
    block: SignedBlockType,
    lastBlock: SignedBlockType
  ): Promise<string[]> {
    if (block.previousBlock && block.previousBlock !== lastBlock.id) {
      await this.forkModule.fork(block, ForkType.TYPE_1);
      return [
        `Invalid previous block: ${block.previousBlock} expected ${
          lastBlock.id
        }`,
      ];
    }
    return [];
  }
}
