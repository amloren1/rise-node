import { ILogger, Symbols } from '@risevision/core-types';
import { IoCSymbol } from '@risevision/core-utils';
import express from 'express';
import { inject, injectable } from 'inversify';
import {
  ExpressErrorMiddlewareInterface,
  Middleware,
} from 'routing-controllers';
import { HTTPError } from '../errors';
import { APISymbols } from '../helpers';

@IoCSymbol(APISymbols.errorHandler)
@Middleware({ type: 'after' })
@injectable()
export class APIErrorHandler implements ExpressErrorMiddlewareInterface {
  @inject(Symbols.helpers.logger)
  private logger: ILogger;

  public error(
    error: any,
    req: express.Request,
    res: express.Response,
    next: (err: any) => any
  ) {
    if (error instanceof HTTPError) {
      res.status(error.statusCode);
    } else {
      res.status(200);
    }
    if (error instanceof Error) {
      error = error.message;
    }

    this.logger.error('API error ' + req.url, error);
    res.send({ success: false, error });
  }
}
