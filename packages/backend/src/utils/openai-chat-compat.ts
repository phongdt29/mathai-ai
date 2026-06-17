export type OpenAIChatProviderKind = "openai" | "openai-compatible";

export function createTokenLimitParam(
	provider: OpenAIChatProviderKind,
	model: string,
	maxTokens: number | undefined,
): Record<string, number> {
	if (maxTokens === undefined) return {};
	return shouldUseMaxCompletionTokens(provider, model)
		? { max_completion_tokens: maxTokens }
		: { max_tokens: maxTokens };
}

export function createSamplingParams(
	provider: OpenAIChatProviderKind,
	model: string,
	temperature: number | undefined,
): Record<string, number> {
	if (temperature === undefined || shouldOmitSamplingParams(provider, model)) {
		return {};
	}
	return { temperature };
}

export function shouldUseMaxCompletionTokens(
	provider: OpenAIChatProviderKind,
	model: string,
): boolean {
	return provider === "openai" || isOpenAIReasoningModel(model);
}

export function shouldOmitSamplingParams(
	_provider: OpenAIChatProviderKind,
	model: string,
): boolean {
	return isOpenAIReasoningModel(model);
}

export function isOpenAIReasoningModel(model: string): boolean {
	const normalized = model.trim().toLowerCase();
	const modelId = normalized.split("/").pop() ?? normalized;
	return /^gpt-5(?:[.-]|$)/.test(modelId) || /^o\d(?:[.-]|$)/.test(modelId);
}
