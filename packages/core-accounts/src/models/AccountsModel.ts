// tslint:disable
import { publicKey } from '@risevision/core-types';
import { IAccountsModel } from '@risevision/core-interfaces';
import * as pgp from 'pg-promise';
import * as sequelize from 'sequelize';
import { Op } from 'sequelize';
import {
  Column,
  DataType,
  DefaultScope,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Container } from 'inversify';
import { BaseModel } from '@risevision/core-models';

@DefaultScope({
  attributes: [
    'address',
    'publicKey',
    'balance',
    'blockId',
    'producedblocks',
    'missedblocks',
    'fees',
    'rewards',
    'virgin',
    'u_balance',
  ].sort(),
})
@Table({ tableName: 'mem_accounts' })
export class AccountsModel extends BaseModel<AccountsModel>
  implements IAccountsModel {
  @PrimaryKey
  @Column
  public address: string;

  @Column(DataType.BLOB)
  public publicKey: Buffer;

  @Column
  public balance: bigint;

  @Column
  public blockId: string;

  @Column
  public producedblocks: number;

  @Column
  public missedblocks: number;

  @Column
  public fees: bigint;
  @Column
  public rewards: bigint;
  @Column
  public virgin: 0 | 1;

  @Column
  public u_balance: bigint;

  private _hexPublicKey: publicKey;
  public get hexPublicKey(): publicKey {
    if (typeof this._hexPublicKey === 'undefined') {
      if (this.publicKey === null) {
        this._hexPublicKey = null;
      } else {
        this._hexPublicKey = this.publicKey.toString('hex');
      }
    }
    return this._hexPublicKey;
  }

  public toPOJO() {
    const toRet = this.toJSON();
    Object.keys(toRet).forEach((k) => {
      if (Buffer.isBuffer(toRet[k])) {
        toRet[k] = toRet[k].toString('hex');
      }
    });
    return toRet;
  }

  public applyDiffArray(
    toWhat:
      | 'delegates'
      | 'u_delegates'
      | 'multisignatures'
      | 'u_multisignatures',
    diff: any
  ) {
    this[toWhat] = this[toWhat] || [];
    diff
      .filter((v) => v.startsWith('-'))
      .forEach((v) =>
        this[toWhat].splice(this[toWhat].indexOf(v.substr(1)), 1)
      );
    diff
      .filter((v) => v.startsWith('+'))
      .forEach((v) => this[toWhat].push(v.substr(1)));
  }

  public applyValues(items: Partial<this>) {
    Object.keys(items).forEach((k) => (this[k] = items[k]));
  }

  public static searchDelegate(
    q: string,
    limit: number,
    orderBy: string,
    orderHow: 'ASC' | 'DESC' = 'ASC'
  ) {
    if (['ASC', 'DESC'].indexOf(orderHow.toLocaleUpperCase()) === -1) {
      throw new Error('Invalid ordering mechanism');
    }

    return pgp.as.format(
      `
    WITH
      supply AS (SELECT calcSupply((SELECT height FROM blocks ORDER BY height DESC LIMIT 1))::numeric),
      delegates AS (SELECT row_number() OVER (ORDER BY vote DESC, m."publicKey" ASC)::int AS rank,
        m.username,
        m.address,
        ENCODE(m."publicKey", 'hex') AS "publicKey",
        m.vote,
        m.producedblocks,
        m.missedblocks,
        ROUND(vote / (SELECT * FROM supply) * 100, 2)::float AS approval,
        (CASE WHEN producedblocks + missedblocks = 0 THEN 0.00 ELSE
        ROUND(100 - (missedblocks::numeric / (producedblocks + missedblocks) * 100), 2)
        END)::float AS productivity,
        COALESCE(v.voters_cnt, 0) AS voters_cnt,
        t.timestamp AS register_timestamp
        FROM delegates d
        LEFT JOIN mem_accounts m ON d.username = m.username
        LEFT JOIN trs t ON d."transactionId" = t.id
        LEFT JOIN (SELECT "dependentId", COUNT(1)::int AS voters_cnt from mem_accounts2delegates GROUP BY "dependentId") v ON v."dependentId" = ENCODE(m."publicKey", 'hex')
        WHERE m."isDelegate" = 1
        ORDER BY \${orderBy:name} \${orderHow:raw})
      SELECT * FROM delegates WHERE username LIKE \${q} LIMIT \${limit}
    `,
      {
        q: `%${q}%`,
        limit,
        orderBy,
        orderHow,
      }
    );
  }

  public static restoreUnconfirmedEntries() {
    return Promise.resolve(
      this.update(
        {
          u_isDelegate: sequelize.col('isDelegate'),
          u_balance: sequelize.col('balance'),
          u_secondSignature: sequelize.col('secondSignature'),
          u_username: sequelize.col('username'),
        },
        {
          where: {
            $or: {
              u_isDelegate: { [Op.ne]: sequelize.col('isDelegate') },
              u_balance: { [Op.ne]: sequelize.col('balance') },
              u_secondSignature: { [Op.ne]: sequelize.col('secondSignature') },
              u_username: { [Op.ne]: sequelize.col('username') },
            },
          },
        }
      )
    );
  }

  public static createBulkAccountsSQL(addresses: string[]) {
    if (!addresses) {
      return '';
    }
    addresses = addresses.filter((addr) => addr);
    if (addresses.length === 0) {
      return '';
    }
    return pgp.as.format(
      `
    INSERT into mem_accounts(address)
    SELECT address from (VALUES $1:raw ) i (address)
    LEFT JOIN mem_accounts m1 USING(address)
    WHERE m1.address IS NULL`,
      addresses.map((address) => pgp.as.format('($1)', address)).join(', ')
    );
  }
}
