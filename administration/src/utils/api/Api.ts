import { http } from '../../shared/lib/http';

class Api {
  public async login(username: string, password: string) {
    const response = await http.post('/auth/login', { username, password });
    return response.data;
  }

  public async post(url: string, data?: unknown) {
    const response = await http.post(url, data);
    return response.data;
  }

  public async get(url: string) {
    const response = await http.get(url);
    return response.data;
  }

  public async put(url: string, data: unknown) {
    const response = await http.put(url, data);
    return response.data;
  }

  public async delete(url: string) {
    const response = await http.delete(url);
    return response.data;
  }
}

export default new Api();