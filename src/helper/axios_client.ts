import axios, { AxiosInstance, isAxiosError } from "axios";
import qs from "qs";

interface Cookie {
  key: string;
  value: string;
}

export class AxiosClient {
  client: AxiosInstance;
  cookies: Cookie[];

  constructor(defaultCookies: Cookie[]) {
    this.client = axios.create();
    this.cookies = defaultCookies;
  }

  updateCookies(replyCookies?: string[]) {
    replyCookies?.forEach((item) => {
      const content = item.split(";")[0];
      const [key, value] = content.split("=");
      const idx = this.cookies.findIndex((cookie) => cookie.key === key);
      if (idx !== -1) {
        this.cookies[idx].value = value;
      } else {
        this.cookies.push({ key, value });
      }
    });
  }

  async get(url: string) {
    try {
      const handler = new AbortController();
      const timeout = setTimeout(() => handler.abort(), 5000);
      const res = await this.client.get(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
          cookie: this.cookies.map((cookie) => `${cookie.key}=${cookie.value}`).join(";"),
        },
        maxRedirects: 0,
        timeout: 5000,
        signal: handler.signal,
      });

      clearTimeout(timeout);

      // update cookie
      this.updateCookies(res.headers["set-cookie"]);

      return res;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        // in case of axios error, we need to update cookie
        this.updateCookies(err.response?.headers["set-cookie"]);
      }
      throw err;
    }
  }

  async post(url: string, data: any, csrf_token?: string) {
    try {
      // logger.debug(`Post to ${url} with data: ${JSON.stringify(data)}, token=${csrf_token}`);
      // logger.debug(`Payload: ${qs.stringify(data)}`);

      const headers = csrf_token
        ? {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
            cookie: this.cookies.map((cookie) => `${cookie.key}=${cookie.value}`).join(";"),
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            "x-csrf-token": csrf_token,
          }
        : {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
            cookie: this.cookies.map((cookie) => `${cookie.key}=${cookie.value}`).join(";"),
            "Content-Type": "application/x-www-form-urlencoded",
          };

      const handler = new AbortController();
      const timeout = setTimeout(() => handler.abort(), 5000);
      const res = await this.client.post(url, qs.stringify(data), {
        headers,
        maxRedirects: 0,
        timeout: 5000,
        signal: handler.signal,
      });
      clearTimeout(timeout);

      // update cookie
      this.updateCookies(res.headers["set-cookie"]);

      return res;
    } catch (err) {
      if (isAxiosError(err)) {
        // in case of axios error, we need to update cookie
        this.updateCookies(err.response?.headers["set-cookie"]);
      }
      // logger.debug("Err at post method", err);
      throw err;
    }
  }
}
