import { ApiClient } from './ApiClient';

export class CompanyApi extends ApiClient {
  async listLocations() {
    return this.get('/home?tab=company');
  }
}
