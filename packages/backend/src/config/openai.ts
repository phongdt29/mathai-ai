import OpenAI from 'openai';
import { config } from './index';

export function createOpenAIClient(baseURL?: string, apiKey?: string): OpenAI {
  return new OpenAI({
    apiKey: apiKey || config.openai.apiKey,
    ...(baseURL || config.openai.baseUrl
      ? { baseURL: baseURL || config.openai.baseUrl }
      : {}),
  });
}

export const openai = createOpenAIClient();

export default openai;
