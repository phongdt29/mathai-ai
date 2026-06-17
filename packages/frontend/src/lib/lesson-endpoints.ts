import { isFallbackLessonId } from "./lesson-fallbacks";

export function getLessonDetailEndpoint(id: string | number): string | null {
	if (isFallbackLessonId(id)) {
		return null;
	}

	return `/lessons/${id}`;
}

export function getLessonExerciseGenerationEndpoint(
	id: string | number,
): string | null {
	if (isFallbackLessonId(id)) {
		return null;
	}

	return `/lessons/${id}/exercises/generate`;
}

export function getLessonExerciseAttemptSubmitEndpoint(
	id: string | number,
): string | null {
	if (isFallbackLessonId(id)) {
		return null;
	}

	return `/lessons/${id}/exercise-attempts/submit`;
}

export function getLessonExerciseAttemptHistoryEndpoint(
	id: string | number,
): string | null {
	if (isFallbackLessonId(id)) {
		return null;
	}

	return `/lessons/${id}/exercise-attempts/history`;
}