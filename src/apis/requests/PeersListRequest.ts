import { BaseRequest } from './BaseRequest';

export class PeersListRequest extends BaseRequest {
  protected readonly method = 'GET';
  protected readonly supportsProtoBuf = true;

  public getResponseData(res) {
    // TODO Implement me! :)
    return res.body;
  }

  protected getBaseUrl() {
    return this.isProtoBuf() ? '/v2/peer/list' : '/peer/list';
  }
}
