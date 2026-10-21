import { ApiClient } from './ApiClient';
import { env } from '../config/env';

export class AuthApi extends ApiClient {
  async login(username = env.adminUsername, password = env.adminPassword) {
    // Backend: POST /login (routes/auth_routes.py)
    return this.post('/login', { username, password });
  }
}
