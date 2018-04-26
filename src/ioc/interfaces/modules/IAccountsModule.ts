import { AccountFilterData, MemAccountsData, OptionalsMemAccounts } from '../../../logic';
import { AccountsModel } from '../../../models/';
import { publicKey } from '../../../types/sanityTypes';
import { FieldsInModel } from '../../../types/utils';
import { IModule } from './IModule';

export interface IAccountsModule extends IModule {
  getAccount(filter: AccountFilterData, fields?: Array<FieldsInModel<AccountsModel>>): Promise<AccountsModel>;

  getAccounts(filter: AccountFilterData, fields: Array<FieldsInModel<AccountsModel>>): Promise<AccountsModel[]>;

  /**
   * Sets some data to specific account
   */
  // tslint:disable-next-line max-line-length
  setAccountAndGet(data: Partial<AccountsModel>  & ({ publicKey: Buffer } | { address: string })): Promise<AccountsModel>;

  mergeAccountAndGetSQL(diff: any): string;

  mergeAccountAndGet(diff: any): Promise<MemAccountsData>;

  /**
   * @deprecated
   */
  generateAddressByPublicKey(pk: publicKey): string;
}
