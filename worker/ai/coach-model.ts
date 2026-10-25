import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { AiRoute } from '../llm.ts';
import type { WorkerEnv } from '../platform.ts';
import { modelHubCoach } from './model-hub-model.ts';

export function coachModel(env: WorkerEnv, route: AiRoute, context?: { userId: string; turnId: string; attemptId: string; locale: string; highRisk: boolean }) {
  if (route.provider === 'model_hub') {
    if (!context) throw new Error('MODEL_HUB_CONTEXT_REQUIRED');
    return modelHubCoach(env, { ...context, model: route.model });
  }
  if (route.provider === 'openai') {
    const baseURL = env.OPENAI_BASE_URL?.replace(/\/responses\/?$/, '').replace(/\/$/, '');
    return createOpenAI({ apiKey: env.OPENAI_API_KEY, baseURL }).responses(route.model);
  }
  const baseURL = route.provider === 'compatible' ? env.AI_COMPAT_BASE_URL! :
    env.CLOUDFLARE_AI_GATEWAY_URL || `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_AI_ACCOUNT_ID}/ai/v1`;
  return createOpenAICompatible({ name: route.provider, baseURL: baseURL.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, ''),
    apiKey: route.provider === 'compatible' ? env.AI_COMPAT_API_KEY : env.CLOUDFLARE_AI_GATEWAY_TOKEN || env.CLOUDFLARE_AI_TOKEN,
    supportsStructuredOutputs: true }).chatModel(route.model);
}
