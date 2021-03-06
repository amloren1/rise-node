import { SystemModule } from '@risevision/core';
import { createContainer } from '@risevision/core-launchpad/tests/unit/utils/createContainer';
import { ModelSymbols } from '@risevision/core-models';
import {
  BasePeerType,
  ISystemModule,
  PeerState,
  Symbols,
} from '@risevision/core-types';
import { LoggerStub } from '@risevision/core-utils/tests/unit/stubs';
import { expect } from 'chai';
import 'chai-as-promised';
import { Container } from 'inversify';
import 'reflect-metadata';
import { SinonSandbox, SinonStub } from 'sinon';
import * as sinon from 'sinon';
import { Peer, PeersLogic, PeersModule } from '../../src';
import { p2pSymbols } from '../../src/helpers';
import { createFakePeer, createFakePeers } from './utils/fakePeersFactory';

// tslint:disable no-unused-expression object-literal-sort-keys no-identical-functions no-big-function
describe('modules/peers', () => {
  let inst: PeersModule;
  let container: Container;
  let peersLogicStub: PeersLogic;
  const appConfig = {
    peers: {
      list: [{ ip: '1.2.3.4', port: 1111 }, { ip: '5.6.7.8', port: 2222 }],
    },
  };
  let sandbox: SinonSandbox;
  before(async () => {
    container = await createContainer([
      'core-p2p',
      'core-helpers',
      'core-crypto',
      'core-blocks',
      'core-transactions',
      'core',
      'core-accounts',
    ]);
  });
  beforeEach(async () => {
    sandbox = sinon.createSandbox();
    container.rebind(Symbols.generic.appConfig).toConstantValue(appConfig);
    container.rebind(p2pSymbols.modules.peers).to(PeersModule);
    inst = container.get(Symbols.modules.peers);
    peersLogicStub = container.get(Symbols.logic.peers);
  });
  afterEach(() => {
    sandbox.restore();
  });
  describe('.update', () => {
    let upsertStub: SinonStub;
    beforeEach(() => {
      upsertStub = sandbox.stub(peersLogicStub, 'upsert').returns(false);
    });
    it('should update peer.state to CONNECTED', () => {
      const p: Peer = {} as any;
      inst.update(p);
      expect(p.state).to.be.eq(PeerState.CONNECTED);
    });
    it('should call peersLogic.upsert with false as insertOnlyParam and updated peer', () => {
      inst.update({} as any);
      expect(upsertStub.called).is.true;
    });
    it('should return boolean from peersLogic.upsert', () => {
      expect(inst.update({} as any)).to.be.false;
    });
  });

  describe('.remove', () => {
    let removeStub: SinonStub;
    beforeEach(() => {
      removeStub = sandbox.stub(peersLogicStub, 'remove').returns(false);
    });
    it('should remove peer evene if from config and return true', () => {
      expect(
        inst.remove(appConfig.peers.list[0].ip, appConfig.peers.list[0].port)
      ).is.false;
      expect(removeStub.called).is.true;
    });
    it('should call peersLogic.remove with peerIP and port.', () => {
      inst.remove('ip', 1111);
      expect(removeStub.firstCall.args[0]).to.be.deep.eq({
        ip: 'ip',
        port: 1111,
      });
    });
    it('should return boolean', () => {
      expect(inst.remove('ip', 1111)).is.false;
    });
  });

  describe('.getByFilter', () => {
    let listStub: SinonStub;
    beforeEach(() => {
      listStub = sandbox.stub(peersLogicStub, 'list');
    });
    const fields = [
      'ip',
      'port',
      'state',
      'os',
      'version',
      'broadhash',
      'height',
      'nonce',
    ];

    it('should call peersLogic.list with false', () => {
      listStub.returns([]);
      inst.getByFilter({});
      expect(listStub.called).is.true;
      expect(listStub.firstCall.args[0]).is.false;
    });

    for (const f of fields) {
      it(`should filter out peer if ${f} is undefined`, () => {
        const p = createFakePeer();
        p[f] = undefined;
        listStub.returns([p]);

        const filter = {};
        filter[f] = undefined;
        const res = inst.getByFilter(filter);
        expect(res).to.be.empty;
      });
      it(`should filter out peer if ${f} is != 'value'`, () => {
        const p = createFakePeer();
        listStub.returns([p]);
        const filter = {};
        filter[f] = p[f] + 1;
        const res = inst.getByFilter(filter);
        expect(res).to.be.empty;
      });
    }

    describe('ordering', () => {
      it('should order peers by height asc', () => {
        const p1 = createFakePeer({ height: 2 });
        const p2 = createFakePeer({ height: 1 });
        listStub.returns([p1, p2]);
        const res = inst.getByFilter({ orderBy: 'height:asc' });
        expect(res).to.be.deep.eq([p2, p1]);
      });
      it('should order peers by height desc', () => {
        const p1 = createFakePeer({ height: 2 });
        const p2 = createFakePeer({ height: 1 });
        listStub.returns([p1, p2]);
        const res = inst.getByFilter({ orderBy: 'height:desc' });
        expect(res).to.be.deep.eq([p1, p2]);
      });
      it('should order peers by height asc if not provided sorting mechanism', () => {
        const p1 = createFakePeer({ height: 2 });
        const p2 = createFakePeer({ height: 1 });
        listStub.returns([p1, p2]);
        const res = inst.getByFilter({ orderBy: 'height' });
        expect(res).to.be.deep.eq([p2, p1]);
      });

      it('should order peers by version asc', () => {
        const p1 = createFakePeer({ version: '0.1.1' });
        const p2 = createFakePeer({ version: '0.1.0' });
        listStub.returns([p1, p2]);
        const res = inst.getByFilter({ orderBy: 'version:asc' });
        expect(res).to.be.deep.eq([p2, p1]);
      });
      it('should order peers by version desc', () => {
        const p1 = createFakePeer({ version: '0.1.1' });
        const p2 = createFakePeer({ version: '0.1.0' });
        listStub.returns([p1, p2]);
        const res = inst.getByFilter({ orderBy: 'version:desc' });
        expect(res).to.be.deep.eq([p1, p2]);
      });
      it('should order peers by version asc if not provided sorting mechanism', () => {
        const p1 = createFakePeer({ version: '0.1.1' });
        const p2 = createFakePeer({ version: '0.1.0' });
        listStub.returns([p1, p2]);
        const res = inst.getByFilter({ orderBy: 'version' });
        expect(res).to.be.deep.eq([p2, p1]);
      });

      it('should order peers random if not provided', () => {
        const peers = Array.apply(null, new Array(20)).map((id, idx) =>
          createFakePeer({ height: idx })
        );
        listStub.returns(peers);
        expect(inst.getByFilter({})).to.not.be.deep.eq(peers);
      });
    });

    it('should trim results by using limits param', () => {
      const peers = Array.apply(null, new Array(20)).map((id, idx) =>
        createFakePeer({ height: idx })
      );
      listStub.returns(peers);
      const res = inst.getByFilter({ limit: 10 });
      expect(res.length).to.be.eq(10);
    });
    it('should offset results by using offset param', () => {
      const peers = Array.apply(null, new Array(20)).map((id, idx) =>
        createFakePeer({ height: idx })
      );
      listStub.returns(peers);
      const res = inst.getByFilter({ offset: 5, orderBy: 'height:asc' });
      expect(res[0].height).to.be.eq(5);
    });
    it('should offset & trim results by using offset & limit params', () => {
      const peers = Array.apply(null, new Array(20)).map((id, idx) =>
        createFakePeer({ height: idx })
      );
      listStub.returns(peers);
      const res = inst.getByFilter({
        limit: 10,
        offset: 5,
        orderBy: 'height:asc',
      });
      expect(res[0].height).to.be.eq(5);
      expect(res.length).to.be.eq(10);
    });
  });

  describe('.getPeers', () => {
    let getByFilterStub: SinonStub;
    let firstPeers: BasePeerType[];
    let secondPeers: BasePeerType[];
    let listStub: SinonStub;
    let acceptableStub: SinonStub;
    beforeEach(() => {
      listStub = sandbox.stub(peersLogicStub, 'list');
      acceptableStub = sandbox.stub(peersLogicStub, 'acceptable');
      const system = container.get<ISystemModule>(Symbols.modules.system);
      system.update({ height: 100 } as any);
      getByFilterStub = sandbox.stub(inst, 'getByFilter');
      getByFilterStub.onFirstCall().callsFake(() => firstPeers);
      getByFilterStub.onSecondCall().callsFake(() => secondPeers);
    });

    it('should return peers array', () => {
      firstPeers = [createFakePeer()];
      secondPeers = [];
      acceptableStub.returns(firstPeers);
      acceptableStub.onSecondCall().returns(secondPeers);
      const peers = inst.getPeers({});
      expect(peers).to.be.an('array');
    });
    it('should not concat unmatchedbroadhash if limit is matching the matching peers length', () => {
      firstPeers = createFakePeers(10);
      secondPeers = [createFakePeer()];
      acceptableStub.returns(firstPeers);
      const peers = inst.getPeers({ limit: 10 });
      expect(peers.length).to.be.eq(10);
      expect(peers).to.be.deep.eq(firstPeers);
      expect(acceptableStub.calledOnce).is.true;
    });
    it('should call getByFilter with broadhash filter', () => {
      const systemModule = container.get<SystemModule>(Symbols.modules.system);
      systemModule.headers.broadhash = 'broadhashhh';
      firstPeers = [createFakePeer()];
      secondPeers = [];
      acceptableStub.returns(firstPeers);
      acceptableStub.onSecondCall().returns(secondPeers);
      inst.getPeers({});
      expect(getByFilterStub.called).is.true;
      expect(getByFilterStub.firstCall.args[0]).to.haveOwnProperty('broadhash');
      expect(getByFilterStub.firstCall.args[0].broadhash).to.be.eq(
        systemModule.broadhash
      );
    });
    it('should return only acceptable peers by calling peersLogic.acceptable.', () => {
      firstPeers = [createFakePeer()];
      secondPeers = [createFakePeer()];
      acceptableStub.returns([]);
      const peers = inst.getPeers({});
      expect(peers).to.be.empty;
    });
    it('should concat unmatched broadhash peers and truncate with limit.', () => {
      firstPeers = createFakePeers(5);
      secondPeers = createFakePeers(10).map((item) => {
        item.broadhash = 'unmatched';
        return item;
      });
      acceptableStub.callsFake((w) => w);

      const peers = inst.getPeers({ limit: 10 });
      expect(peers.length).to.be.eq(10);
      expect(peers.slice(5, 10)).to.be.deep.eq(secondPeers.slice(0, 5));
      expect(peers.slice(0, 5)).to.be.deep.eq(firstPeers);
    });
  });

  describe('.determineConsensus', () => {
    let fakePeers: BasePeerType[];
    let listStub: SinonStub;
    let acceptableStub: SinonStub;
    beforeEach(() => {
      listStub = sandbox.stub(peersLogicStub, 'list');
      listStub.onFirstCall().callsFake(() => fakePeers);
      acceptableStub = sandbox.stub(peersLogicStub, 'acceptable');
      const system = container.get<ISystemModule>(Symbols.modules.system);
      system.update({ height: 100 } as any);
    });

    it('should return consensus number', async () => {
      fakePeers = [createFakePeer()];
      acceptableStub.returns(fakePeers);
      const target = await inst.determineConsensus('aa');
      expect(target).to.haveOwnProperty('consensus');
      expect(target.consensus).to.be.a('number');
      expect(target.consensus).to.be.deep.eq(100);
    });
    it('should return 0 if no acceptable peers', async () => {
      fakePeers = createFakePeers(20);
      acceptableStub.returns([]);
      const res = await inst.determineConsensus('aa');
      expect(res.consensus).to.be.eq(0);
    });
    it('should return 0 if no connected peers', async () => {
      fakePeers = createFakePeers(20, { state: PeerState.DISCONNECTED });
      acceptableStub.callsFake((w) => w);
      const res = await inst.determineConsensus('aa');
      expect(res.consensus).to.be.eq(0);
    });
    it('should return 100 if all matching broadhash', async () => {
      fakePeers = createFakePeers(20);
      acceptableStub.callsFake((w) => w);
      const res = await inst.determineConsensus('aa');
      expect(res.consensus).to.be.eq(100);
    });
    it('should return 25 if 100 matched and 300 did not', async () => {
      fakePeers = [].concat(
        createFakePeers(100),
        createFakePeers(300, { broadhash: 'bb' })
      );
      acceptableStub.callsFake((w) => w);
      const res = await inst.determineConsensus('aa');
      expect(res.consensus).to.be.eq(25);
    });
  });

  // NON interface tests

  describe('.cleanup', () => {
    let truncateStub: SinonStub;
    let bulkCreateStub: SinonStub;
    let txStub: SinonStub;
    let listStub: SinonStub;
    beforeEach(() => {
      const peersModel = container.getNamed<any>(
        ModelSymbols.model,
        Symbols.models.peers
      );
      truncateStub = sandbox.stub(peersModel, 'truncate');
      bulkCreateStub = sandbox.stub(peersModel, 'bulkCreate');
      txStub = sandbox
        .stub(peersModel.sequelize, 'transaction')
        .callsFake((t: any) => t('tx'));
      listStub = sandbox.stub(peersLogicStub, 'list');
    });
    it('should not save anything if no peers known', async () => {
      listStub.returns([]);
      await inst.cleanup();
      expect(bulkCreateStub.called).is.false;
      expect(truncateStub.called).is.false;
    });
    it('should save peers to database with single tx after cleaning peers table', async () => {
      const loggerStub = container.get<LoggerStub>(Symbols.helpers.logger);
      const fakePeers = [createFakePeer(), createFakePeer()];
      listStub.returns(fakePeers);
      await inst.cleanup();
      expect(truncateStub.called).is.true;
      expect(bulkCreateStub.called).is.true;
      expect(truncateStub.calledBefore(bulkCreateStub)).is.true;
      expect(bulkCreateStub.firstCall.args[0]).to.be.deep.eq(fakePeers);
      expect(loggerStub.stubs.info.calledOnce).to.be.true;
      expect(loggerStub.stubs.info.firstCall.args.length).to.be.equal(1);
      expect(loggerStub.stubs.info.firstCall.args[0]).to.be.equal(
        'Peers exported to database'
      );
    });
    it('should NOT throw error if db query was rejected', async () => {
      const loggerStub = container.get<LoggerStub>(Symbols.helpers.logger);
      bulkCreateStub.rejects(new Error('error'));
      listStub.returns([createFakePeer()]);
      await inst.cleanup();
      expect(loggerStub.stubs.error.calledOnce).to.be.true;
      expect(loggerStub.stubs.error.firstCall.args.length).to.be.equal(2);
      expect(loggerStub.stubs.error.firstCall.args[0]).to.be.equal(
        'Export peers to database failed'
      );
      expect(loggerStub.stubs.error.firstCall.args[1]).to.be.deep.equal({
        error: 'error',
      });
    });
  });

  // describe('.onBlockchainReady', () => {
  //   let pingStub: SinonStub;
  //   let loggerStub: LoggerStub;
  //   let oldEnv: string;
  //   let peersModel: typeof PeersModel;
  //   let findAllStub: SinonStub;
  //   beforeEach(() => {
  //     oldEnv = process.env.NODE_ENV;
  //     process.env.NODE_ENV = 't';
  //     pingStub = sinon.stub().returns(Promise.resolve());
  //     peersLogicStub.enqueueResponse('create', {pingAndUpdate: pingStub});
  //     peersLogicStub.enqueueResponse('create', {pingAndUpdate: pingStub});
  //     peersLogicStub.enqueueResponse('create', {pingAndUpdate: pingStub});
  //     peersLogicStub.enqueueResponse('exists', false);
  //
  //     loggerStub = container.get<LoggerStub>(Symbols.helpers.logger);
  //     busStub = container.get<BusStub>(Symbols.helpers.bus);
  //     peersModel = container.get(Symbols.models.peers);
  //     findAllStub = sandbox.stub(peersModel, 'findAll').resolves(['fromDb'])
  //     busStub.enqueueResponse('message', '');
  //   });
  //   afterEach(() => {
  //     process.env.NODE_ENV = oldEnv;
  //   });
  //
  //   it('should load peers from db and config and call pingUpdate on all of them', async () => {
  //     await instR.onBlockchainReady();
  //     expect(pingStub.callCount).to.be.eq(3);
  //     expect(peersLogicStub.stubs.create.callCount).to.be.eq(3);
  //   });
  //   it('should call broadcast peersReady', async () => {
  //     await instR.onBlockchainReady();
  //     expect(busStub.stubs.message.called).is.true;
  //     expect(busStub.stubs.message.firstCall.args[0]).to.be.eq('peersReady');
  //   });
  //   it('should call logger.trace', async () => {
  //     await instR.onBlockchainReady();
  //     expect(loggerStub.stubs.trace.callCount).to.be.equal(5);
  //     expect(loggerStub.stubs.trace.lastCall.args.length).to.be.equal(2);
  //     expect(loggerStub.stubs.trace.lastCall.args[0]).to.be.equal('Peers->dbLoad Peers discovered');
  //     expect(loggerStub.stubs.trace.lastCall.args[1]).to.be.deep.equal({
  //       total: 1,
  //       updated: 1,
  //     });
  //   });
  //   it('should call logger.error if db query was throw error', async () => {
  //     const error = new Error('errors');
  //     findAllStub.rejects(error);
  //     await instR.onBlockchainReady();
  //     expect(loggerStub.stubs.error.calledOnce).to.be.true;
  //     expect(loggerStub.stubs.error.firstCall.args.length).to.be.equal(2);
  //     expect(loggerStub.stubs.error.firstCall.args[0]).to.be.equal('Import peers from database failed');
  //     expect(loggerStub.stubs.error.firstCall.args[1]).to.be.deep.equal({error: error.message});
  //   });
  //   it('should not call broadcast peersReady if process.env.NODE_ENV === test', async () => {
  //     process.env.NODE_ENV = 'test';
  //     await instR.onBlockchainReady();
  //     expect(busStub.stubs.message.called).is.false;
  //   });
  //   it('should not increase updated if peer fails', async () => {
  //     peersLogicStub.reset();
  //     peersLogicStub.enqueueResponse('create', {pingAndUpdate: pingStub});
  //     peersLogicStub.enqueueResponse('create', {pingAndUpdate: pingStub});
  //     peersLogicStub.enqueueResponse('create', {pingAndUpdate: () => Promise.reject('booo')});
  //     peersLogicStub.enqueueResponse('exists', false);
  //     await instR.onBlockchainReady();
  //     expect(loggerStub.stubs.info.callCount).to.be.equal(2);
  //     expect(loggerStub.stubs.info.args[0][0]).to.contains('Peers->insertSeeds - Peers discovered');
  //     expect(loggerStub.stubs.info.args[1][0]).to.contains('unresponsive');
  //     expect(loggerStub.stubs.info.callCount).to.be.equal(2);
  //     expect(loggerStub.stubs.trace.callCount).to.be.equal(5);
  //     expect(loggerStub.stubs.trace.lastCall.args.length).to.be.equal(2);
  //     expect(loggerStub.stubs.trace.lastCall.args[0]).to.be.equal('Peers->dbLoad Peers discovered');
  //     expect(loggerStub.stubs.trace.lastCall.args[1]).to.be.deep.equal({
  //       total: 1,
  //       updated: 0,
  //     });
  //   });
  //
  // });
});
