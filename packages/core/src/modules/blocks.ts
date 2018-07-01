import { Symbols } from '@risevision/core-helpers';
import { IBlocksModel, IBlocksModule, ILogger } from '@risevision/core-interfaces';
import { ConstantsType } from '@risevision/core-types';
import { inject, injectable } from 'inversify';

// TODO Eventually remove this module and use appState instead.
@injectable()
export class BlocksModule implements IBlocksModule {
  public lastBlock: IBlocksModel;
  public lastReceipt: { get: () => number, isStale: () => boolean, update: (time?: number) => void };
  @inject(Symbols.helpers.constants)
  private constants: ConstantsType;
  private internalLastReceipt: number;
  @inject(Symbols.helpers.logger)
  private logger: ILogger;

  constructor() {
    this.lastReceipt = {
      get    : () => this.internalLastReceipt,
      isStale: () => {
        if (!this.internalLastReceipt) {
          return true;
        }
        // Current time in seconds - lastReceipt (seconds)
        const secondsAgo = Math.floor(Date.now() / 1000) - this.internalLastReceipt;
        return (secondsAgo > this.constants.blockReceiptTimeOut);
      },
      update : (time: number = Math.floor(Date.now() / 1000)) => {
        this.internalLastReceipt = time;
      },
    };
  }

  public cleanup() {
    return Promise.resolve();
  }

}