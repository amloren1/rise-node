import { BasePeerType, ISystemModule, Symbols } from '@risevision/core-types';
import {
  castFieldsToNumberUsingSchema,
  IoCSymbol,
} from '@risevision/core-utils';
import * as express from 'express';
import { inject, injectable } from 'inversify';
import * as z_schema from 'z-schema';
import { PeersLogic, PeersModule } from '../../';
import { p2pSymbols } from '../../helpers';
import { ITransportMiddleware } from '../../interfaces/ITransportMiddleware';

// tslint:disable-next-line no-var-requires
const transportSchema = require('../../../schema/transport.json');

@injectable()
@IoCSymbol(p2pSymbols.transportMiddlewares.validatePeer)
export class ValidatePeerHeaders implements ITransportMiddleware {
  public when: 'before' = 'before';

  @inject(Symbols.logic.peers)
  private peersLogic: PeersLogic;
  @inject(Symbols.modules.peers)
  private peersModule: PeersModule;
  @inject(Symbols.generic.zschema)
  private schema: z_schema;
  @inject(Symbols.modules.system)
  private systemModule: ISystemModule;

  public use(
    request: express.Request,
    response: any,
    next: (err?: any) => any
  ) {
    castFieldsToNumberUsingSchema(transportSchema.headers, request.headers);
    if (!this.schema.validate(request.headers, transportSchema.headers)) {
      this.removePeer(request);
      return next(
        new Error(
          `${this.schema.getLastError().details[0].path} - ${
            this.schema.getLastErrors()[0].message
          }`
        )
      );
    }
    if (
      !this.systemModule.networkCompatible(request.headers.nethash as string)
    ) {
      this.removePeer(request);
      // TODO: convert this into an error.
      return next({
        expected: this.systemModule.getNethash(),
        message: 'Request is made on the wrong network',
        received: request.headers.nethash,
      });
    }

    if (!this.systemModule.versionCompatible(request.headers.version)) {
      this.removePeer(request);
      // TODO: Convert this into an error
      return next({
        expected: this.systemModule.getMinVersion(),
        message: 'Request is made from incompatible version',
        received: request.headers.version,
      });
    }

    // Add peer only if not firewalled
    const p = this.peersLogic.create(this.computeBasePeerType(request));
    p.applyHeaders(request.headers as any);
    if (
      typeof request.headers.firewalled === 'undefined' ||
      request.headers.firewalled === 'false'
    ) {
      this.peersModule.update(p);
    }
    (request as any).peer = p;
    next();
  }

  private removePeer(request: express.Request) {
    const peer = this.computeBasePeerType(request);
    this.peersModule.remove(peer.ip, peer.port);
  }

  private computeBasePeerType(request: express.Request): BasePeerType {
    return {
      ip: request.ip,
      port: parseInt(request.headers.port as string, 10),
    };
  }
}
