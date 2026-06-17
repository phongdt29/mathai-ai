"use client";

/**
 * LateBadge — hiển thị badge "Nộp trễ" khi bài nộp quá hạn.
 */
export default function LateBadge({ isLate }: { isLate: boolean }) {
	if (!isLate) return null;

	return (
		<span
			data-testid="late-badge"
			className="inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white"
		>
			Nộp trễ
		</span>
	);
}
