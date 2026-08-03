import { describe, expect, it, vi } from 'vitest';
import type { AxiosInstance } from 'axios';
import type { RuntimeConfig } from '../config/runtime';
import {
  createPraxisSsoClient,
  submitPraxisTicket,
  type SsoDocumentLike,
} from './praxisSsoClient';

function fakeDocument() {
  const inputs: Array<Record<string, string>> = [];
  const submit = vi.fn();
  const form = {
    method: '',
    action: '',
    enctype: '',
    acceptCharset: '',
    hidden: false,
    appendChild(input: Record<string, string>) {
      inputs.push(input);
    },
    submit,
  };
  const appendForm = vi.fn();
  const documentRef = {
    body: { appendChild: appendForm },
    createElement(tagName: 'form' | 'input') {
      return tagName === 'form'
        ? form
        : { type: '', name: '', value: '' };
    },
  } as unknown as SsoDocumentLike;
  return { documentRef, form, inputs, submit, appendForm };
}

const config = {
  clientMode: 'upstream',
  apiBaseUrl: 'https://career.example',
  upstreamWithCredentials: false,
  upstreamConfigured: true,
  skipAuth: false,
} as RuntimeConfig;

describe('Praxis SSO browser handoff', () => {
  it('requests a ticket then submits it in a hidden form body', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        ticket: 'signed.ticket.value',
        targetUrl: 'https://praxis.example/api/v1/auth/sso',
      },
    });
    const { documentRef, form, inputs, submit, appendForm } = fakeDocument();

    await createPraxisSsoClient(
      config,
      { post } as unknown as AxiosInstance,
    ).launch(documentRef);

    expect(post).toHaveBeenCalledWith(
      '/api/career-agent/integrations/praxis/sso-ticket',
    );
    expect(form).toMatchObject({
      method: 'POST',
      action: 'https://praxis.example/api/v1/auth/sso',
      enctype: 'application/x-www-form-urlencoded',
      hidden: true,
    });
    expect(inputs).toEqual([{
      type: 'hidden',
      name: 'ticket',
      value: 'signed.ticket.value',
    }]);
    expect(appendForm).toHaveBeenCalledWith(form);
    expect(submit).toHaveBeenCalledOnce();
    expect(form.action).not.toContain('ticket');
  });

  it('rejects a target that could carry data in its URL', () => {
    const { documentRef, submit } = fakeDocument();
    expect(() => submitPraxisTicket({
      ticket: 'signed.ticket.value',
      targetUrl: 'https://praxis.example/api/v1/auth/sso?ticket=leak',
    }, documentRef)).toThrow('Praxis SSO 目标地址无效');
    expect(submit).not.toHaveBeenCalled();
  });
});
