import type {
  NetworkPolicyPort,
  NetworkRequest,
} from '../../ports/translating';

export class NetworkPolicyService {
  constructor(private readonly networkPolicyPort: NetworkPolicyPort) {}

  async request(request: NetworkRequest): Promise<Response> {
    return this.networkPolicyPort.request(request);
  }
}
