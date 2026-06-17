type LessonIllustrationProps = {
	src: string;
	alt: string;
	className?: string;
};

export function LessonIllustration({
	src,
	alt,
	className = "",
}: LessonIllustrationProps) {
	return (
		<figure
			className={`overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 shadow-sm ${className}`}
		>
			<div className="flex min-h-[12rem] items-center justify-center p-5 sm:min-h-[14rem]">
				{/* Lesson illustrations are static SVGs; next/image does not optimize SVG. */}
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={src}
					alt={alt}
					className="max-h-56 w-full object-contain"
					loading="lazy"
					decoding="async"
				/>
			</div>
			<figcaption className="border-t border-blue-100 bg-blue-50/70 px-4 py-2.5 text-center text-sm font-medium text-blue-800">
				{alt}
			</figcaption>
		</figure>
	);
}
