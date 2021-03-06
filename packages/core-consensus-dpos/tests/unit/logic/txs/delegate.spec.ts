'use strict';
import { createContainer } from '@risevision/core-launchpad/tests/unit/utils/createContainer';
import { ModelSymbols } from '@risevision/core-models';
import { TXSymbols } from '@risevision/core-transactions';
import {
  Address,
  DBUpdateOp,
  IAccountsModule,
  IBaseTransaction,
  ISystemModule,
  Symbols,
  TransactionType,
} from '@risevision/core-types';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { Container } from 'inversify';
import { SinonSandbox, SinonStub } from 'sinon';
import * as sinon from 'sinon';
import { As } from 'type-tagger';
import { dPoSSymbols } from '../../../../src/helpers';
import {
  DelegateAsset,
  RegisterDelegateTransaction,
} from '../../../../src/logic/delegateTransaction';
import { AccountsModelForDPOS, DelegatesModel } from '../../../../src/models';

const expect = chai.expect;
chai.use(chaiAsPromised);

// tslint:disable no-unused-expression no-big-function object-literal-sort-keys no-identical-functions
describe('logic/transactions/delegate', () => {
  let sandbox: SinonSandbox;
  let accountsModuleStub: IAccountsModule;
  let systemModuleStub: ISystemModule;
  let container: Container;
  let instance: RegisterDelegateTransaction;
  let accountsModel: typeof AccountsModelForDPOS;
  let delegatesModel: typeof DelegatesModel;
  let tx: IBaseTransaction<DelegateAsset>;
  let sender: any;
  let block: any;

  let getFeesStub: SinonStub;

  before(async () => {
    container = await createContainer([
      'core-consensus-dpos',
      'core-helpers',
      'core-crypto',
      'core',
    ]);
  });

  beforeEach(async () => {
    sandbox = sinon.createSandbox();

    accountsModel = container.getNamed(
      ModelSymbols.model,
      Symbols.models.accounts
    );
    delegatesModel = container.getNamed(
      ModelSymbols.model,
      dPoSSymbols.models.delegates
    );
    accountsModuleStub = container.get(Symbols.modules.accounts);
    systemModuleStub = container.get(Symbols.modules.system);
    tx = {
      amount: 0n,
      asset: {
        delegate: {
          username: 'topdelegate',
          forgingPK: Buffer.from(
            '6588716f9c941530c74eabdf0b27b1a2bac0a1525e9605a37e6c0b3817e58fe3',
            'hex'
          ) as Buffer & As<'publicKey'>,
        },
      },
      fee: 10n,
      id: '8139741256612355994',
      senderId: '1233456789012345R' as Address,
      recipientId: null,
      senderPubData: Buffer.from(
        '6588716f9c941530c74eabdf0b27b1a2bac0a1525e9605a37e6c0b3817e58fe3',
        'hex'
      ),
      signatures: [
        Buffer.from(
          '0a1525e9605a37e6c6588716f9c9a2bac41530c74e3817e58fe3abdf0b27b10b' +
            'a2bac0a1525e9605a37e6c6588716f9c7b10b3817e58fe3941530c74eabdf0b2',
          'hex'
        ),
      ],
      timestamp: 0,
      type: TransactionType.DELEGATE,
      version: 0,
    };

    sender = {
      address: '1233456789012345R',
      balance: 10000000,
      publicKey: Buffer.from(
        '6588716f9c941530c74eabdf0b27b1a2bac0a1525e9605a37e6c0b3817e58fe3',
        'hex'
      ) as Buffer & As<'publicKey'>,
      isMultisignature() {
        return false;
      },
      applyValues() {
        throw new Error('please stub me :)');
      },
    };

    block = {
      height: 8797,
      id: '13191140260435645922',
    };
    instance = container.getNamed(
      TXSymbols.transaction,
      dPoSSymbols.logic.delegateTransaction
    );
    getFeesStub = sandbox.stub(systemModuleStub, 'getFees').returns({
      fees: { delegate: 2500n },
      fromHeight: 1,
      toHeight: 1000000,
      height: 100,
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('calculateFee', () => {
    it('should call systemModule.getFees', () => {
      instance.calculateMinFee(tx, sender, block.height);
      expect(getFeesStub.calledOnce).to.be.true;
      expect(getFeesStub.firstCall.args[0]).to.be.equal(block.height);
    });
  });

  describe('assetBytes', () => {
    it('should return just the forging key if no username', () => {
      delete tx.asset.delegate.username;
      const retVal = instance.assetBytes(tx);
      expect(retVal).to.be.deep.eq(tx.asset.delegate.forgingPK);
    });
    it('should return the utf8 username if provided', () => {
      const retVal = instance.assetBytes(tx);
      expect(retVal).to.be.deep.eq(
        Buffer.concat([
          tx.asset.delegate.forgingPK,
          Buffer.from(tx.asset.delegate.username, 'utf8'),
        ])
      );
    });
  });

  describe('verify', () => {
    let getAccountStub: SinonStub;
    beforeEach(() => {
      getAccountStub = sandbox
        .stub(accountsModuleStub, 'getAccount')
        .resolves(null);
    });

    it('should throw when tx.recipientId', async () => {
      tx.recipientId = 'recipient' as Address;
      await expect(instance.verify(tx, sender)).to.be.rejectedWith(
        'Invalid recipient'
      );
    });

    it('should throw when amount != 0', async () => {
      tx.amount = 100n;
      await expect(instance.verify(tx, sender)).to.be.rejectedWith(
        'Invalid transaction amount'
      );
    });

    it('should throw when sender is delegate already', async () => {
      sender.isDelegate = true;
      await expect(instance.verify(tx, sender)).to.be.rejectedWith(
        'Account is already a delegate'
      );
    });

    it('should throw when no tx.asset or tx.asset.delegate', async () => {
      delete tx.asset.delegate;
      await expect(instance.verify(tx, sender)).to.be.rejectedWith(
        'Invalid transaction asset'
      );
      delete tx.asset;
      await expect(instance.verify(tx, sender)).to.be.rejectedWith(
        'Invalid transaction asset'
      );
    });

    it('should throw when no forgingPK', async () => {
      delete tx.asset.delegate.forgingPK;
      await expect(instance.verify(tx, sender)).to.be.rejectedWith(
        'ForgingPK is undefined'
      );
    });

    it('should throw when no username and acct is not delegate', async () => {
      delete tx.asset.delegate.username;
      await expect(instance.verify(tx, sender)).to.be.rejectedWith(
        'Account needs to be a delegate'
      );
    });

    it('should NOT throw when no username and acct IS delegate', async () => {
      delete tx.asset.delegate.username;
      sender.isDelegate = 1;
      await expect(instance.verify(tx, sender)).to.not.be.rejected;
    });

    it('should throw when username is not lowercase', async () => {
      tx.asset.delegate.username = 'TopDelegate';
      await expect(instance.verify(tx, sender)).to.be.rejectedWith(
        'Username must be lowercase'
      );
    });

    it('should call String.toLowercase.trim', async () => {
      const toLowercaseSpy = sandbox.spy(String.prototype, 'toLowerCase');
      const trimSpy = sandbox.spy(String.prototype, 'trim');
      await instance.verify(tx, sender);
      expect(toLowercaseSpy.calledTwice).to.be.true;
      expect(trimSpy.calledOnce).to.be.true;
      toLowercaseSpy.restore();
      trimSpy.restore();
    });

    it('should throw when trimmed username is empty string', async () => {
      tx.asset.delegate.username = '    ';
      await expect(instance.verify(tx, sender)).to.be.rejectedWith(
        'Empty username'
      );
    });

    it('should throw when username is more than 20 chars long', async () => {
      tx.asset.delegate.username = 'abcdefghijklmnopqrstuvwxyz';
      await expect(instance.verify(tx, sender)).to.be.rejectedWith(
        'Username is too long. Maximum is 20 characters'
      );
    });

    it('should throw when username is a possible address - given param should be uppercased', async () => {
      // TODO: How to test?
      // tx.asset.delegate.username = '';
      // await expect(instance.verify(tx, sender)).to.be.rejectedWith(
      //   'Username can not be a potential address'
      // );
    });

    it('should throw if zschema does not validate the username', async () => {
      // First call needs false to avoid throwing, second is false to force throwing
      tx.asset.delegate.username = '1r - --òaùàà-ù##';
      await expect(instance.verify(tx, sender)).to.be.rejectedWith(
        'Username can only contain alphanumeric characters with the exception of !@$&_.'
      );
    });

    it('should call accountsModule.getAccount and throw if account is found', async () => {
      getAccountStub.resolves({ the: 'account' });
      await expect(instance.verify(tx, sender)).to.be.rejectedWith(
        /Username already exists:/
      );
      expect(getAccountStub.calledOnce).to.be.true;
      expect(getAccountStub.firstCall.args[0].username).to.be.equal(
        tx.asset.delegate.username
      );
    });
  });

  describe('apply', () => {
    let applyValuesStub: SinonStub;
    beforeEach(() => {
      applyValuesStub = sandbox.stub(sender, 'applyValues');
    });

    it('should call sender.applyValues with proper data', async () => {
      await instance.apply(tx, block, sender);
      expect(applyValuesStub.called).is.true;
      expect(applyValuesStub.firstCall.args[0]).deep.eq({
        u_isDelegate: 1,
        isDelegate: 1,
        username: 'topdelegate',
        u_username: 'topdelegate',
        forgingPK: tx.asset.delegate.forgingPK,
        vote: 0n,
      });
    });

    it('should return a DBUpdateOp', async () => {
      const retVal = await instance.apply(tx, block, sender);
      expect(retVal.length).is.eq(1);
      const op: DBUpdateOp<any> = retVal[0] as any;
      expect(op.type).is.eq('update');
      expect(op.model).is.deep.eq(accountsModel);
      expect(op.values).is.deep.eq({
        isDelegate: 1,
        u_isDelegate: 1,
        vote: 0n,
        forgingPK: tx.asset.delegate.forgingPK,
        username: tx.asset.delegate.username,
        u_username: tx.asset.delegate.username,
      });
      expect(op.options).to.be.deep.eq({
        where: {
          address: sender.address,
        },
      });
    });

    it('should throw an error', async () => {
      sender.isDelegate = 1;
      expect(instance.apply(tx, block, sender)).to.be.rejectedWith(
        'Account is already a delegate'
      );
    });
  });

  describe('undo', () => {
    let applyValuesStub: SinonStub;
    beforeEach(() => {
      applyValuesStub = sandbox.stub(sender, 'applyValues');
    });
    it('should call sender.applyValues with proper data', async () => {
      await instance.undo(tx, block, sender);
      expect(applyValuesStub.called).is.true;
      expect(applyValuesStub.firstCall.args[0]).deep.eq({
        forgingPK: null,
        u_isDelegate: 1,
        isDelegate: 0,
        username: null,
        u_username: 'topdelegate',
        vote: 0n,
      });
    });
    it('should return a DBUpdateOp', async () => {
      const retVal = await instance.undo(tx, block, sender);
      expect(retVal.length).is.eq(1);
      const op: DBUpdateOp<any> = retVal[0] as any;
      expect(op.type).is.eq('update');
      expect(op.model).is.deep.eq(accountsModel);
      expect(op.values).is.deep.eq({
        forgingPK: null,
        isDelegate: 0,
        u_isDelegate: 1,
        vote: 0n,
        username: null,
        u_username: tx.asset.delegate.username,
      });

      expect(op.options).to.be.deep.eq({
        where: {
          address: sender.address,
        },
      });
    });

    it('should properly rollback to previous forgingPK when any');
  });

  describe('applyUnconfirmed', () => {
    let applyValuesStub: SinonStub;
    beforeEach(() => {
      applyValuesStub = sandbox.stub(sender, 'applyValues');
    });
    it('should call sender.applyValues with proper data', async () => {
      await instance.applyUnconfirmed(tx, sender);
      expect(applyValuesStub.called).is.true;
      expect(applyValuesStub.firstCall.args[0]).deep.eq({
        isDelegate: 0,
        u_isDelegate: 1,
        u_username: 'topdelegate',
        username: null,
      });
    });

    it('should return a DBUpdateOp', async () => {
      const retVal = await instance.applyUnconfirmed(tx, sender);
      expect(retVal.length).is.eq(1);
      const op: DBUpdateOp<any> = retVal[0] as any;
      expect(op.type).is.eq('update');
      expect(op.model).is.deep.eq(accountsModel);
      expect(op.values).is.deep.eq({
        isDelegate: 0,
        u_isDelegate: 1,
        u_username: tx.asset.delegate.username,
        username: null,
      });

      expect(op.options).to.be.deep.eq({
        where: {
          address: sender.address,
        },
      });
    });

    it('should throw an error', async () => {
      sender.u_isDelegate = 1;
      await expect(instance.applyUnconfirmed(tx, sender)).to.rejectedWith(
        'Account is already trying to be a delegate'
      );
    });
  });

  describe('undoUnconfirmed', () => {
    let applyValuesStub: SinonStub;
    beforeEach(() => {
      applyValuesStub = sandbox.stub(sender, 'applyValues');
    });
    it('should call sender.applyValues with proper data', async () => {
      await instance.undoUnconfirmed(tx, sender);
      expect(applyValuesStub.called).is.true;
      expect(applyValuesStub.firstCall.args[0]).deep.eq({
        isDelegate: 0,
        u_isDelegate: 0,
        u_username: null,
        username: null,
      });
    });

    it('should return a DBUpdateOp', async () => {
      const retVal = await instance.undoUnconfirmed(tx, sender);
      expect(retVal.length).is.eq(1);
      const op: DBUpdateOp<any> = retVal[0] as any;
      expect(op.type).is.eq('update');
      expect(op.model).is.deep.eq(accountsModel);
      expect(op.values).is.deep.eq({
        isDelegate: 0,
        u_isDelegate: 0,
        u_username: null,
        username: null,
      });

      expect(op.options).to.be.deep.eq({
        where: {
          address: sender.address,
        },
      });
    });
  });

  describe('objectNormalize', () => {
    it('should remove empty keys from asset', () => {
      const oldAsset = { ...tx.asset };
      (tx.asset.delegate as any).meow = null;
      (tx.asset.delegate as any).haha = '';
      instance.objectNormalize(tx);
      expect(tx.asset).deep.eq(oldAsset);
    });

    it('should throw if validation fails', () => {
      tx.asset.delegate.username = '###';
      expect(() => {
        instance.objectNormalize(tx);
      }).to.throw(/Failed to validate delegate schema/);
    });
  });

  describe('dbSave', () => {
    it('should return the Createop object', async () => {
      const createOp = await instance.dbSave(tx);
      expect(createOp.type).is.eq('create');
      expect(createOp.model).is.deep.eq(delegatesModel);
      expect(createOp.values).is.deep.eq({
        transactionId: tx.id,
        username: tx.asset.delegate.username,
        forgingPK: tx.senderPubData,
      });
    });
  });

  describe('attachAssets', () => {
    let modelFindAllStub: SinonStub;
    beforeEach(() => {
      modelFindAllStub = sandbox.stub(delegatesModel, 'findAll');
    });
    it('should do do nothing if result is empty', async () => {
      modelFindAllStub.resolves([]);
      await instance.attachAssets([]);
    });
    it('should throw if a tx was provided but not returned by model.findAll', async () => {
      modelFindAllStub.resolves([]);
      await expect(instance.attachAssets([{ id: 'ciao' }] as any)).rejectedWith(
        "Couldn't restore asset for Delegate tx: ciao"
      );
    });
    it('should use model result and modify original arr', async () => {
      modelFindAllStub.resolves([
        {
          transactionId: 2,
          username: 'second',
          forgingPK: Buffer.alloc(1).fill(2),
        },
        {
          transactionId: 1,
          username: 'first',
          forgingPK: Buffer.alloc(1).fill(1),
        },
      ]);
      const txs: any = [{ id: 1 }, { id: 2 }];

      await instance.attachAssets(txs);

      expect(txs[0]).deep.eq({
        id: 1,
        asset: {
          delegate: {
            username: 'first',
            forgingPK: Buffer.from('01', 'hex'),
          },
        },
      });
      expect(txs[1]).deep.eq({
        id: 2,
        asset: {
          delegate: {
            username: 'second',
            forgingPK: Buffer.from('02', 'hex'),
          },
        },
      });
    });
  });
});
