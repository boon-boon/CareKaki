import { Injectable, signal, computed } from '@angular/core';
import {
  McpSearchOptions,
  McpValidationResult,
  McpSearchResult,
  McpDiagnostic,
} from '../models';

export interface McpCallLog {
  id: number;
  timestamp: string;
  tool: string;
  args: any;
  result: any;
  status: 'success' | 'error';
  durationMs: number;
}

@Injectable({ providedIn: 'root' })
export class CareKakiMcpService {
  // Use relative endpoint if running via dev-server proxy, fallback to direct port 3000
  readonly serverUrl = signal<string>(
    typeof window !== 'undefined' && window.location && window.location.port === '4200'
      ? '/mcp'
      : 'http://127.0.0.1:3000/mcp'
  );
  readonly status = signal<'online' | 'offline' | 'checking'>('checking');
  readonly serverInfo = signal<{ name: string; version: string; tools: string[] } | null>(null);
  readonly callLogs = signal<McpCallLog[]>([]);
  readonly isOnline = computed(() => this.status() === 'online');

  private nextRpcId = 1;

  constructor() {
    this.checkHealth();
  }

  /**
   * Health and capability handshake with the CareKaki MCP server
   */
  async checkHealth(): Promise<boolean> {
    this.status.set('checking');
    try {
      // 1. Try health check endpoint
      const healthUrl = this.serverUrl().replace('/mcp', '/health');
      const healthRes = await fetch(healthUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000),
      }).catch(() => null);

      // 2. Perform MCP initialize handshake
      const initResult = await this.rpc('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'carekaki-angular-ux', version: '1.0.0' },
      });

      // 3. Discover registered tools
      const toolsResult = await this.rpc('tools/list', {});
      const toolNames = (toolsResult?.tools || []).map((t: any) => t.name);

      this.serverInfo.set({
        name: initResult?.serverInfo?.name || 'carekaki',
        version: initResult?.serverInfo?.version || '1.0.0',
        tools: toolNames,
      });

      this.status.set('online');
      return true;
    } catch (err) {
      console.warn('CareKaki MCP server offline or unreachable, falling back to mock mode:', err);
      this.status.set('offline');
      return false;
    }
  }

  /**
   * Raw JSON-RPC 2.0 call over Streamable HTTP transport
   */
  async rpc(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = this.nextRpcId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const res = await fetch(this.serverUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-03-26',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`MCP HTTP Error: ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    let jsonResponse: any;
    if (contentType.includes('text/event-stream')) {
      const dataLine = text.split(/\r?\n/).find(line => line.startsWith('data: '));
      if (!dataLine) throw new Error('Invalid SSE response from MCP server: missing data line');
      jsonResponse = JSON.parse(dataLine.slice(6));
    } else {
      jsonResponse = JSON.parse(text);
    }

    if (jsonResponse.error) {
      throw new Error(`MCP Error [${jsonResponse.error.code}]: ${jsonResponse.error.message}`);
    }

    return jsonResponse.result;
  }

  /**
   * Call an MCP tool by name with arguments
   */
  async callTool<T = any>(name: string, args: Record<string, any> = {}): Promise<T> {
    const start = performance.now();
    try {
      const rpcResult = await this.rpc('tools/call', {
        name,
        arguments: args,
      });

      if (rpcResult.isError) {
        const errorMsg = rpcResult.content?.[0]?.text || 'Tool returned an error';
        throw new Error(errorMsg);
      }

      // MCP v2 structuredContent or parsed text content
      const data = rpcResult.structuredContent ?? JSON.parse(rpcResult.content?.[0]?.text || '{}');

      const durationMs = Math.round(performance.now() - start);
      this.addLog({
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        tool: name,
        args,
        result: data,
        status: 'success',
        durationMs,
      });

      return data as T;
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      this.addLog({
        id: Date.now(),
        timestamp: new Date().toLocaleTimeString(),
        tool: name,
        args,
        result: { error: err.message },
        status: 'error',
        durationMs,
      });
      throw err;
    }
  }

  // ============================================================
  // Specialized High-Level MCP Tool Methods
  // ============================================================

  /**
   * Tool 1: carekaki_get_search_options
   * Discovers exact Malaysian cities, service codes, dates, and presets
   */
  async getSearchOptions(): Promise<McpSearchOptions> {
    return this.callTool<McpSearchOptions>('carekaki_get_search_options');
  }

  /**
   * Tool 2: carekaki_validate_request
   * Validates partial care request and returns missing question or confirmation
   */
  async validateRequest(draft: Record<string, any>): Promise<McpValidationResult> {
    return this.callTool<McpValidationResult>('carekaki_validate_request', draft);
  }

  /**
   * Tool 3: carekaki_search_providers
   * Complete validation + eligibility filtering + 50/35/15 scoring
   */
  async searchProviders(request: Record<string, any>, limit = 5): Promise<McpSearchResult> {
    return this.callTool<McpSearchResult>('carekaki_search_providers', {
      ...request,
      limit,
    });
  }

  /**
   * Tool 4: carekaki_list_providers
   * Browse demo CSV catalogue with optional filters
   */
  async listProviders(filters: {
    location?: string;
    service?: string;
    max_hourly_rate?: number;
    verified_only?: boolean;
    date?: string;
    limit?: number;
  } = {}): Promise<{ total_providers: number; providers: any[]; currency: string }> {
    return this.callTool('carekaki_list_providers', filters);
  }

  /**
   * Tool 5: carekaki_get_provider
   * Retrieve full provider record by provider_id
   */
  async getProvider(providerId: string): Promise<{ status: 'found' | 'not_found'; provider?: any }> {
    return this.callTool('carekaki_get_provider', { provider_id: providerId });
  }

  /**
   * Tool 6: carekaki_explain_matching
   * Complete diagnostics of all 5 pass/fail checks for each provider
   */
  async explainMatching(request: Record<string, any>): Promise<{
    status: string;
    provider_count: number;
    diagnostics: McpDiagnostic[];
  }> {
    return this.callTool('carekaki_explain_matching', request);
  }

  private addLog(log: McpCallLog) {
    this.callLogs.update(logs => [log, ...logs.slice(0, 19)]);
  }
}
