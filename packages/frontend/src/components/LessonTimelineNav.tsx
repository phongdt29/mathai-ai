import Link from "next/link";
import type { LessonTimelineItem } from "@/lib/lesson-content";

type LessonTimelineNavProps = {
	items: LessonTimelineItem[];
	className?: string;
};

export function LessonTimelineNav({
	items,
	className = "",
}: LessonTimelineNavProps) {
	return (
		<nav
			aria-label="Dòng thời gian nội dung bài học"
			className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 ${className}`}
		>
			<h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
				Nội dung bài học
			</h2>
			<ol className="relative flex flex-col gap-2 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-gray-200">
				{items.map((item) => (
					<li
						key={`${item.kind}-${item.itemNumber ?? "check"}`}
						className="relative"
					>
						<Link
							href={item.href}
							scroll={false}
							aria-current={item.isCurrent ? "page" : undefined}
							className={`group flex gap-3 rounded-xl p-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
								item.isCurrent
									? "bg-blue-50 text-blue-800 ring-1 ring-blue-200"
									: "text-gray-700 hover:bg-gray-50 hover:text-blue-700"
							}`}
						>
							<span
								className={`z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
									item.isCurrent
										? "bg-blue-600 text-white"
										: item.kind === "check"
											? "bg-emerald-100 text-emerald-700"
											: "bg-gray-100 text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-700"
								}`}
							>
								{item.itemNumber ?? "✓"}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block text-xs font-bold uppercase tracking-wide text-gray-400">
									{item.label}
								</span>
								<span className="line-clamp-2 text-sm font-semibold leading-5">
									{item.title}
								</span>
							</span>
						</Link>
					</li>
				))}
			</ol>
		</nav>
	);
}
