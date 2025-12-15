import { singleton } from 'tsyringe';

@singleton()
export default class Metrics {
  private incomingHttpRequests: { [method: string]: { [statusCode: number]: number } } = {};
  private outgoingHttpRequests: { [method: string]: { [hostname: string]: { [statusCode: number]: number } } } = {};

  public collectIncomingHttpRequest(method: string, statusCode: number): void {
    if (!this.incomingHttpRequests[method]) {
      if (!/^[A-Z]+$/.test(method)) {
        throw new Error(`Invalid HTTP method: ${method}`);
      }
      this.incomingHttpRequests[method] = {};
    }
    this.incomingHttpRequests[method][statusCode] = (this.incomingHttpRequests[method][statusCode] ?? 0) + 1;
  }

  public collectOutgoingHttpRequest(method: string, url: string, statusCode: number): void {
    if (!this.outgoingHttpRequests[method]) {
      if (!/^[A-Z]+$/.test(method)) {
        throw new Error(`Invalid HTTP method: ${method}`);
      }
      this.outgoingHttpRequests[method] = {};
    }

    const hostnameFromUrl = new URL(url).hostname;
    let hostname = 'miscellaneous';
    if ([
      'api.minecraftservices.com',
      'sessionserver.mojang.com',
      'textures.minecraft.net',
      'mcproxy.dev',
      'crafthead.net',
      'dl.labymod.net',
      's.optifine.net',
    ].includes(hostnameFromUrl)) {
      hostname = hostnameFromUrl;
    }

    if (!this.outgoingHttpRequests[method][hostname]) {
      this.outgoingHttpRequests[method][hostname] = {};
    }
    this.outgoingHttpRequests[method][hostname][statusCode] = (this.outgoingHttpRequests[method][hostname][statusCode] ?? 0) + 1;
  }

  public toPrometheusMetrics(): string {
    let result = '';

    result += `# HELP http_incoming_requests Number of incoming HTTP requests (excluding /metrics, /status, ...)\n`;
    result += `# TYPE http_incoming_requests counter\n`;
    if (Object.keys(this.incomingHttpRequests).length > 0) {
      for (const method in this.incomingHttpRequests) {
        for (const statusCode in this.incomingHttpRequests[method]) {
          const count = this.incomingHttpRequests[method][statusCode];
          result += `http_incoming_requests{method="${method}", status_code="${statusCode}"} ${count}\n`;
        }
      }
    } else {
      result += `http_incoming_requests{method="GET", status_code="200"} 0\n`;
    }

    result += `\n`;

    result += `# HELP http_outgoing_requests Number of outgoing HTTP requests\n`;
    result += `# TYPE http_outgoing_requests counter\n`;
    if (Object.keys(this.outgoingHttpRequests).length > 0) {
      for (const method in this.outgoingHttpRequests) {
        for (const hostname in this.outgoingHttpRequests[method]) {
          for (const statusCode in this.outgoingHttpRequests[method][hostname]) {
            const count = this.outgoingHttpRequests[method][hostname][statusCode];
            result += `http_outgoing_requests{method="${method}", hostname="${hostname}", status_code="${statusCode}"} ${count}\n`;
          }
        }
      }
    } else {
      result += `http_outgoing_requests{method="GET", hostname="miscellaneous", status_code="200"} 0\n`;
    }

    return result;
  }
}
