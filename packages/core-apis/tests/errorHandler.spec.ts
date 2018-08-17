import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { Container } from 'inversify';
import * as sinon from 'sinon';
import { SinonSandbox } from 'sinon';
import { DeprecatedAPIError } from '../src/errors';
import { APIErrorHandler } from '../src/utils';
import { LoggerStub } from '../../core-utils/test/stubs';
import { createContainer } from '../../core-launchpad/tests/utils/createContainer';
import { APISymbols } from '../src/helpers';
import { p2pSymbols } from '../../core-p2p/src/helpers';
import { Symbols } from '../../core-interfaces/src';
import { HTTPError } from '@risevision/core-utils';


// tslint:disable-next-line no-var-requires
const assertArrays = require('chai-arrays');
const expect       = chai.expect;
chai.use(chaiAsPromised);
chai.use(assertArrays);

// tslint:disable no-unused-expression
describe('apis/utils/errorHandler', () => {
  let sandbox: SinonSandbox;
  let instance: APIErrorHandler;
  let request: any;
  let response: any;
  let responseStatusSpy: any;
  let next: any;
  let container: Container;
  let requestStub: any;
  let loggerStub: LoggerStub;
  let sendSpy: any;

  beforeEach(async () => {
    container = await createContainer(['core-apis', 'core', 'core-accounts', 'core-helpers']);
    instance = container.getNamed(p2pSymbols.middleware, APISymbols.errorHandler);

    sandbox           = sinon.createSandbox();
    sendSpy           = { send: sandbox.spy() };
    response          = { status: () => sendSpy, send: sendSpy.send };
    responseStatusSpy = sandbox.spy(response, 'status');
    request           = { url: { startsWith: () => true } };
    requestStub       = sandbox.stub(request.url, 'startsWith');
    next              = sandbox.spy();
    loggerStub        = container.get(Symbols.helpers.logger);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('error()', () => {
    it('If url starts with /peer', () => {
      requestStub.returns(true);
      instance.error(new Error('Fake error'), request, response, next);
      expect(loggerStub.stubs.error.called).to.be.false;
      expect(loggerStub.stubs.warn.calledOnce).to.be.true;
      expect(loggerStub.stubs.warn.args[0][0]).to.contains('Transport error');
      expect(loggerStub.stubs.warn.args[0][1]).to.equal('Fake error');
      expect(responseStatusSpy.calledOnce).to.be.true;
      expect(responseStatusSpy.args[0][0]).to.equal(200);
      expect(sendSpy.send.calledOnce).to.be.true;
      expect(sendSpy.send.args[0][0]).to.deep.equal({ success: false, error: 'Fake error' });
      // expect(next.calledOnce).to.be.true;
      // expect(next.args[0][0]).to.deep.equal({success: false, error: 'Fake error'});
    });

    it('If url NOT starts with /peer', () => {
      requestStub.returns(false);
      instance.error('Another fake error', request, response, next);
      expect(loggerStub.stubs.warn.called).to.be.false;
      expect(loggerStub.stubs.error.calledOnce).to.be.true;
      expect(loggerStub.stubs.error.args[0][0]).to.contains('API error');
      expect(loggerStub.stubs.error.args[0][1]).to.equal('Another fake error');
      expect(responseStatusSpy.calledOnce).to.be.true;
      expect(responseStatusSpy.args[0][0]).to.equal(200);
      expect(sendSpy.send.calledOnce).to.be.true;
      expect(sendSpy.send.args[0][0]).to.deep.equal({ success: false, error: 'Another fake error' });
      // expect(next.calledOnce).to.be.true;
      // expect(next.args[0][0]).to.deep.equal({success: false, error: 'Another fake error'});
    });
  });

  describe('APIError', () => {
    it('should honorate statusCode of APIError', () => {
      requestStub.returns(false);
      instance.error(new HTTPError('Another fake error', 500), request, response, next);
      expect(responseStatusSpy.args[0][0]).to.equal(500);
      expect(sendSpy.send.args[0][0]).to.deep.equal({ success: false, error: 'Another fake error' });
    });
    it('should honorate Deprecated API Error (which is child of APIError)', () => {
      requestStub.returns(false);
      instance.error(new DeprecatedAPIError(), request, response, next);
      expect(responseStatusSpy.args[0][0]).to.equal(500);
      expect(sendSpy.send.args[0][0]).to.deep.equal({ success: false, error: 'Method is deprecated' });
    });
  });
});