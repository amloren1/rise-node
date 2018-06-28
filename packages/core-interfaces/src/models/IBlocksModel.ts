import { SignedBlockType } from '@risevision/core-types';
import { IBaseModel } from './IBaseModel';
import { ITransactionsModel } from './ITransactionsModel';
import { IBlocksModule } from '../modules';

export class IBlocksModel extends IBaseModel<IBlocksModel> {
  public static classFromPOJO(pojo: SignedBlockType): IBlocksModel {
    throw new Error('Not implemented. Please implement in subclass');
  }

  public static toStringBlockType(b: SignedBlockType,
                                  TxModel: typeof ITransactionsModel,
                                  blocksModule: IBlocksModule): SignedBlockType<string> {
    throw new Error('Not implemented. Please implement in subclass');
  }

  public id: string;
  public rowId: number;
  public version: number;
  public timestamp: number;
  public height: number;
  public previousBlock: string;
  public numberOfTransactions: number;
  public totalAmount: number;
  public totalFee: number;
  public reward: number;
  public payloadLength: number;
  public payloadHash: Buffer;
  public generatorPublicKey: Buffer;
  public blockSignature: Buffer;
  public transactions: ITransactionsModel[];


}
