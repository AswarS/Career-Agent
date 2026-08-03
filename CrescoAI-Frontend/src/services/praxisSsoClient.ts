import axios, { AxiosHeaders, type AxiosInstance } from 'axios';
import { runtimeConfig, type RuntimeConfig } from '../config/runtime';
import { CAREER_AGENT_API_ROUTES } from './careerAgentApiRoutes';
import { readStoredAuthSession } from './authSessionStorage';

interface PraxisTicketResponse {
  ticket?: unknown;
  targetUrl?: unknown;
}

interface FormLike {
  method: string;
  action: string;
  enctype: string;
  acceptCharset: string;
  hidden: boolean;
  appendChild(child: InputLike): void;
  submit(): void;
}

interface InputLike {
  type: string;
  name: string;
  value: string;
}

export interface SsoDocumentLike {
  body: { appendChild(child: FormLike): void };
  createElement(tagName: 'form'): FormLike;
  createElement(tagName: 'input'): InputLike;
}

export function submitPraxisTicket(
  response: PraxisTicketResponse,
  documentRef: SsoDocumentLike = document as unknown as SsoDocumentLike,
) {
  const ticket = typeof response.ticket === 'string' ? response.ticket.trim() : '';
  const target = typeof response.targetUrl === 'string'
    ? response.targetUrl.trim()
    : '';
  if (!ticket || !target) {
    throw new Error('Praxis SSO Ticket 响应不完整。');
  }
  const targetUrl = new URL(target);
  if (
    !['http:', 'https:'].includes(targetUrl.protocol)
    || targetUrl.username
    || targetUrl.password
    || targetUrl.search
    || targetUrl.hash
  ) {
    throw new Error('Praxis SSO 目标地址无效。');
  }

  const form = documentRef.createElement('form');
  form.method = 'POST';
  form.action = targetUrl.toString();
  form.enctype = 'application/x-www-form-urlencoded';
  form.acceptCharset = 'UTF-8';
  form.hidden = true;
  const input = documentRef.createElement('input');
  input.type = 'hidden';
  input.name = 'ticket';
  input.value = ticket;
  form.appendChild(input);
  documentRef.body.appendChild(form);
  form.submit();
}

function createHttpClient(config: RuntimeConfig) {
  const client = axios.create({
    baseURL: config.apiBaseUrl ?? undefined,
    withCredentials: config.upstreamWithCredentials,
    headers: { Accept: 'application/json' },
  });
  client.interceptors.request.use((request) => {
    const session = readStoredAuthSession();
    if (session?.accessToken) {
      request.headers = AxiosHeaders.from(request.headers);
      request.headers.set(
        'Authorization',
        `${session.tokenType || 'Bearer'} ${session.accessToken}`,
      );
    }
    return request;
  });
  return client;
}

export function createPraxisSsoClient(
  config: RuntimeConfig = runtimeConfig,
  httpClient?: AxiosInstance,
) {
  return {
    async launch(
      documentRef: SsoDocumentLike = document as unknown as SsoDocumentLike,
    ) {
      if (!config.apiBaseUrl || config.clientMode !== 'upstream') {
        throw new Error('Praxis SSO 需要已配置的 Career 后端。');
      }
      try {
        const client = httpClient ?? createHttpClient(config);
        const response = await client.post<PraxisTicketResponse>(
          CAREER_AGENT_API_ROUTES.praxisSsoTicket(),
        );
        submitPraxisTicket(response.data, documentRef);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const data = error.response?.data;
          const message = data && typeof data === 'object' && 'message' in data
            ? String(data.message)
            : error.message;
          throw new Error(message || '无法进入 Praxis。');
        }
        throw error instanceof Error ? error : new Error('无法进入 Praxis。');
      }
    },
  };
}
