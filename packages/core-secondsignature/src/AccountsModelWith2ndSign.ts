import 'reflect-metadata';

import { IAccountsModel } from '@risevision/core-types';
import {
  Column,
  DataType,
  DefaultScope,
  IBuildOptions,
} from 'sequelize-typescript';
import { FilteredModelAttributes } from 'sequelize-typescript/lib/models/Model';

@DefaultScope({
  attributes: ['secondSignature', 'secondPublicKey', 'u_secondSignature'],
})
export class AccountsModelWith2ndSign extends IAccountsModel {
  @Column
  public secondSignature: 0 | 1;
  @Column(DataType.BLOB)
  public secondPublicKey: Buffer;
  @Column
  // tslint:disable-next-line variable-name
  public u_secondSignature: 0 | 1;

  constructor(
    values?: FilteredModelAttributes<AccountsModelWith2ndSign>,
    options?: IBuildOptions
  ) {
    super(values, options);
  }
}
