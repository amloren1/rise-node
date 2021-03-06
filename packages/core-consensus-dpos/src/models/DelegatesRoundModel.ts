import { BaseModel } from '@risevision/core-models';
import { Column, DataType, PrimaryKey, Table } from 'sequelize-typescript';

/**
 * Table used to store the result of generateDelegateList for indefinite rounds rollback.
 */
@Table({ tableName: 'delegatesround' })
export class DelegatesRoundModel extends BaseModel<DelegatesRoundModel> {
  @PrimaryKey
  @Column
  public round: number;

  @Column(DataType.ARRAY(DataType.BLOB))
  public list: Buffer[];
}
