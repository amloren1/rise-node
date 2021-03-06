import { PeerRequestOptions, Symbols } from '@risevision/core-types';
import { inject, injectable } from 'inversify';
import * as querystring from 'querystring';
import * as z_schema from 'z-schema';
import { p2pSymbols, ProtoBufHelper } from '../helpers';
import { Peer } from '../peer';
import { ITransportMethod, SingleTransportPayload } from './ITransportMethod';

@injectable()
export class BaseTransportMethod<Data, Query, Out>
  implements ITransportMethod<Data, Query, Out> {
  public readonly batchable: boolean = false;
  // AppManager will inject the dependency here
  public readonly method!: 'GET' | 'POST';
  public readonly baseUrl!: string;
  public readonly requestSchema?: any;
  public readonly responseSchema?: any;

  @inject(p2pSymbols.helpers.protoBuf)
  public protoBufHelper: ProtoBufHelper;

  @inject(Symbols.generic.zschema)
  private schema: z_schema;

  public async createRequestOptions(
    req: SingleTransportPayload<Data, Query> = { body: null }
  ): Promise<PeerRequestOptions<Buffer>> {
    const queryString =
      req.query !== null ? `?${querystring.stringify(req.query)}` : '';
    return {
      data: await this.encodeRequest(req.body, req.requester),
      headers: req.headers || {},
      method: this.method,
      url: `${this.baseUrl}${queryString}`,
    };
  }

  /**
   * handles response
   * @param peer the peer to query
   * @param body the buffer containing the response
   */
  public async handleResponse(peer: Peer, body: Buffer): Promise<Out> {
    const decodedResponse = await this.decodeResponse(body, peer);
    await this.assertValidResponse(decodedResponse);
    return decodedResponse;
  }

  /**
   * The handler of the request. It's being called upon a request.
   * @param req the request object
   * NOTE: all errors should be handled here.
   */
  public async handleRequest(
    req: SingleTransportPayload<Buffer, Query>
  ): Promise<Buffer> {
    // Rewrite body so that furthyes
    // er calls can process pojo data.
    const newReq = {
      ...req,
      body: await this.decodeRequest(req),
    };
    await this.assertValidRequest(newReq);
    const response = await this.produceResponse(newReq);
    return this.encodeResponse(response, newReq);
  }

  /**
   * For batchable requests this method could be called to batch different requests together.
   * It will bundle requests together if possible to reduce the amount of requests to perform.
   */
  public mergeRequests(
    reqs: Array<SingleTransportPayload<Data, Query>>
  ): Array<SingleTransportPayload<Data, Query>> {
    return reqs;
  }

  /**
   * Check if such envelope request is expired or not.
   */
  public isRequestExpired(req: SingleTransportPayload<Data, Query>) {
    return Promise.resolve(false);
  }

  /**
   * Given input request it produces a response.
   * @param request input body data object
   * @param query Query object.
   */
  protected produceResponse(
    request: SingleTransportPayload<Data, Query>
  ): Promise<Out> {
    return null;
  }

  /**
   * Encodes request from pojo to buffer
   */
  protected encodeRequest(data: Data | null, peer: Peer): Promise<Buffer> {
    return null;
  }

  /**
   * Decodes requests from buffer to pojo
   */
  protected decodeRequest(
    req: SingleTransportPayload<Buffer, Query>
  ): Promise<Data> {
    return null;
  }

  /**
   * Decodes Response from buffer to Out Pojo
   */
  protected decodeResponse(res: Buffer, peer: Peer): Promise<Out> {
    throw new Error('Implement decoder!');
  }

  /**
   * Encodes response from Out to Buffer
   */
  protected encodeResponse(
    data: Out,
    req: SingleTransportPayload<Data, Query>
  ): Promise<Buffer> {
    throw new Error('Implement encoder');
  }

  /**
   * Validate request is valid (aka formerly valid)
   * should throw if request is invalid
   */
  protected async assertValidRequest(
    request: SingleTransportPayload<Data, Query>
  ): Promise<void> {
    if (this.requestSchema) {
      const res = this.schema.validate(request, this.requestSchema);
      if (!res) {
        throw new Error(
          this.schema
            .getLastErrors()
            .map((e) => `${e.path} - ${e.message}`)
            .join(' - ')
        );
      }
    }
  }

  /**
   * Validate desererialized response is valid (aka formerly valid)
   * should throw if response is invalid
   */
  protected async assertValidResponse(data: Out): Promise<void> {
    if (this.responseSchema) {
      const res = this.schema.validate(data, this.responseSchema);
      if (!res) {
        throw new Error(
          this.schema
            .getLastErrors()
            .map((e) => `${e.path} - ${e.message}`)
            .join(' - ')
        );
      }
    }
  }
}
