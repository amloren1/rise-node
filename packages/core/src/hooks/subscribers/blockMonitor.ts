import { OnDestroyBlock, OnPostApplyBlock } from '@risevision/core-blocks';
import { IPeersModule } from '@risevision/core-p2p';
import {
  ISystemModule,
  SignedAndChainedBlockType,
  Symbols,
} from '@risevision/core-types';
import { decorate, inject, injectable } from 'inversify';
import { WordPressHookSystem, WPHooksSubscriber } from 'mangiafuoco';

const Extendable = WPHooksSubscriber(Object);
decorate(injectable(), Extendable);

@injectable()
export class BlockMonitor extends Extendable {
  @inject(Symbols.generic.hookSystem)
  public hookSystem: WordPressHookSystem;

  @inject(Symbols.modules.peers)
  private peersModule: IPeersModule;
  @inject(Symbols.modules.system)
  private systemModule: ISystemModule;

  @OnPostApplyBlock(1000)
  public async onNewBlock(
    block: SignedAndChainedBlockType,
    broadcast: boolean
  ) {
    await this.systemModule.update(block);
    this.peersModule.updateConsensus();
  }

  @OnDestroyBlock(1000)
  public async onDestroyBlock(
    ignored: SignedAndChainedBlockType,
    newLastBlock: SignedAndChainedBlockType
  ) {
    await this.systemModule.update(newLastBlock);
    this.peersModule.updateConsensus();
  }
}
