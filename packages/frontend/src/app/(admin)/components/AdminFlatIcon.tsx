import type { SVGProps } from "react";

export type AdminFlatIconName =
	| "brand"
	| "overview"
	| "activity"
	| "users"
	| "activeUsers"
	| "teacher"
	| "classes"
	| "proposals"
	| "content"
	| "contentLibrary"
	| "assignments"
	| "tutors"
	| "aiProviders"
	| "aiGovernance"
	| "aiLogs"
	| "scheduler"
	| "riskReview"
	| "notifications"
	| "reports"
	| "analytics"
	| "audit"
	| "billing"
	| "settings"
	| "logout"
	| "menu"
	| "collapse"
	| "expand"
	| "aiRequests"
	| "lessons";

type Palette = {
	bg: string;
	main: string;
	deep: string;
	soft: string;
	light: string;
	ink: string;
};

const palettes: Record<AdminFlatIconName, Palette> = {
	brand: flatPalette("#e0f2fe", "#0ea5e9", "#0369a1", "#38bdf8"),
	overview: flatPalette("#e0f2fe", "#38bdf8", "#0369a1", "#f59e0b"),
	activity: flatPalette("#ede9fe", "#8b5cf6", "#5b21b6", "#22c55e"),
	users: flatPalette("#dbeafe", "#60a5fa", "#1d4ed8", "#f97316"),
	activeUsers: flatPalette("#dcfce7", "#22c55e", "#15803d", "#86efac"),
	teacher: flatPalette("#fef3c7", "#f59e0b", "#b45309", "#60a5fa"),
	classes: flatPalette("#e0f2fe", "#0ea5e9", "#075985", "#f97316"),
	proposals: flatPalette("#dcfce7", "#22c55e", "#166534", "#facc15"),
	content: flatPalette("#fce7f3", "#ec4899", "#9d174d", "#60a5fa"),
	contentLibrary: flatPalette("#ffedd5", "#fb923c", "#9a3412", "#22c55e"),
	assignments: flatPalette("#ede9fe", "#a78bfa", "#6d28d9", "#f59e0b"),
	tutors: flatPalette("#ccfbf1", "#14b8a6", "#0f766e", "#a78bfa"),
	aiProviders: flatPalette("#e0e7ff", "#6366f1", "#3730a3", "#22c55e"),
	aiGovernance: flatPalette("#dcfce7", "#16a34a", "#166534", "#38bdf8"),
	aiLogs: flatPalette("#f3e8ff", "#a855f7", "#6b21a8", "#38bdf8"),
	scheduler: flatPalette("#fef9c3", "#eab308", "#854d0e", "#60a5fa"),
	riskReview: flatPalette("#fee2e2", "#ef4444", "#991b1b", "#facc15"),
	notifications: flatPalette("#ffedd5", "#f97316", "#9a3412", "#60a5fa"),
	reports: flatPalette("#dcfce7", "#22c55e", "#166534", "#38bdf8"),
	analytics: flatPalette("#dbeafe", "#3b82f6", "#1e40af", "#f59e0b"),
	audit: flatPalette("#f1f5f9", "#64748b", "#334155", "#22c55e"),
	billing: flatPalette("#cffafe", "#06b6d4", "#0e7490", "#f59e0b"),
	settings: flatPalette("#e5e7eb", "#6b7280", "#374151", "#38bdf8"),
	logout: flatPalette("#fee2e2", "#ef4444", "#991b1b", "#f97316"),
	menu: flatPalette("#e0f2fe", "#38bdf8", "#0369a1", "#f97316"),
	collapse: flatPalette("#e0f2fe", "#38bdf8", "#0369a1", "#f97316"),
	expand: flatPalette("#e0f2fe", "#38bdf8", "#0369a1", "#f97316"),
	aiRequests: flatPalette("#ede9fe", "#8b5cf6", "#5b21b6", "#22c55e"),
	lessons: flatPalette("#ffedd5", "#f97316", "#9a3412", "#38bdf8"),
};

function flatPalette(bg: string, main: string, deep: string, soft: string): Palette {
	return { bg, main, deep, soft, light: "#ffffff", ink: "#0f172a" };
}

export interface AdminFlatIconProps
	extends Omit<SVGProps<SVGSVGElement>, "name"> {
	name: AdminFlatIconName;
	size?: number;
	title?: string;
}

export function AdminFlatIcon({
	name,
	size = 28,
	title,
	className,
	...props
}: AdminFlatIconProps) {
	const palette = palettes[name];
	return (
		<svg
			viewBox="0 0 64 64"
			width={size}
			height={size}
			className={className}
			role={title ? "img" : undefined}
			aria-hidden={title ? undefined : true}
			focusable="false"
			{...props}
		>
			{title ? <title>{title}</title> : null}
			<rect width="64" height="64" rx="16" fill={palette.bg} />
			{renderGlyph(name, palette)}
		</svg>
	);
}

function renderGlyph(name: AdminFlatIconName, p: Palette) {
	switch (name) {
		case "brand":
			return <CalculatorGlyph p={p} />;
		case "overview":
			return <ChartGlyph p={p} />;
		case "analytics":
		case "reports":
			return <TrendGlyph p={p} />;
		case "activity":
		case "assignments":
			return <ClipboardGlyph p={p} />;
		case "users":
			return <UsersGlyph p={p} />;
		case "activeUsers":
			return <ActiveUsersGlyph p={p} />;
		case "teacher":
			return <TeacherGlyph p={p} />;
		case "classes":
		case "lessons":
			return <BookGlyph p={p} />;
		case "proposals":
			return <ProposalGlyph p={p} />;
		case "content":
			return <DocumentGlyph p={p} />;
		case "contentLibrary":
			return <LibraryGlyph p={p} />;
		case "tutors":
		case "aiRequests":
			return <RobotGlyph p={p} />;
		case "aiProviders":
			return <ChipGlyph p={p} />;
		case "aiGovernance":
			return <ShieldGlyph p={p} />;
		case "aiLogs":
			return <SearchGlyph p={p} />;
		case "scheduler":
			return <ClockGlyph p={p} />;
		case "riskReview":
			return <WarningGlyph p={p} />;
		case "notifications":
			return <BellGlyph p={p} />;
		case "audit":
			return <AuditGlyph p={p} />;
		case "billing":
			return <BillingGlyph p={p} />;
		case "settings":
			return <SettingsGlyph p={p} />;
		case "logout":
			return <LogoutGlyph p={p} />;
		case "menu":
			return <MenuGlyph p={p} />;
		case "collapse":
			return <ArrowGlyph p={p} direction="left" />;
		case "expand":
			return <ArrowGlyph p={p} direction="right" />;
		default:
			return <ChartGlyph p={p} />;
	}
}

function CalculatorGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<rect x="18" y="12" width="28" height="40" rx="7" fill={p.deep} />
			<rect x="22" y="17" width="20" height="9" rx="3" fill={p.light} opacity="0.95" />
			{[0, 1, 2].map((row) =>
				[0, 1, 2].map((col) => (
					<rect
						key={`${row}-${col}`}
						x={22 + col * 7}
						y={31 + row * 7}
						width="5"
						height="5"
						rx="2"
						fill={row === 2 && col === 2 ? p.soft : p.main}
					/>
				)),
			)}
		</g>
	);
}

function ChartGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<rect x="16" y="34" width="8" height="16" rx="3" fill={p.deep} />
			<rect x="28" y="24" width="8" height="26" rx="3" fill={p.main} />
			<rect x="40" y="15" width="8" height="35" rx="3" fill={p.soft} />
			<path d="M14 52h37" stroke={p.deep} strokeWidth="4" strokeLinecap="round" />
			<circle cx="45" cy="16" r="5" fill={p.light} opacity="0.85" />
		</g>
	);
}

function TrendGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<rect x="14" y="38" width="7" height="12" rx="3" fill={p.soft} />
			<rect x="26" y="31" width="7" height="19" rx="3" fill={p.main} />
			<rect x="38" y="22" width="7" height="28" rx="3" fill={p.deep} />
			<path d="M17 27l11-7 8 5 12-12" fill="none" stroke={p.deep} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M44 13h6v6" fill="none" stroke={p.deep} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
		</g>
	);
}

function ClipboardGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<rect x="18" y="15" width="28" height="36" rx="7" fill={p.light} />
			<rect x="24" y="11" width="16" height="9" rx="4" fill={p.main} />
			<path d="M25 30l4 4 9-10" fill="none" stroke={p.deep} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M25 41h15" stroke={p.soft} strokeWidth="4" strokeLinecap="round" />
			<rect x="17" y="15" width="30" height="37" rx="7" fill="none" stroke={p.deep} strokeWidth="3" opacity="0.18" />
		</g>
	);
}

function UsersGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<circle cx="26" cy="25" r="8" fill={p.main} />
			<circle cx="41" cy="27" r="7" fill={p.soft} />
			<path d="M12 48c2-10 9-15 18-15s16 5 18 15" fill={p.deep} />
			<path d="M36 48c1-7 6-11 13-11 3 0 6 1 8 3v8" fill={p.main} opacity="0.8" />
			<circle cx="23" cy="22" r="3" fill={p.light} opacity="0.8" />
		</g>
	);
}

function ActiveUsersGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<circle cx="28" cy="25" r="9" fill={p.main} />
			<path d="M12 49c2-11 9-16 18-16s16 5 18 16" fill={p.deep} />
			<circle cx="45" cy="21" r="10" fill={p.soft} />
			<path d="M40 21l4 4 8-9" fill="none" stroke={p.deep} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
		</g>
	);
}

function TeacherGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<path d="M10 25l22-11 22 11-22 11-22-11z" fill={p.deep} />
			<path d="M19 30v9c4 5 22 5 26 0v-9l-13 6-13-6z" fill={p.main} />
			<path d="M48 28v12" stroke={p.soft} strokeWidth="4" strokeLinecap="round" />
			<circle cx="48" cy="43" r="4" fill={p.soft} />
		</g>
	);
}

function BookGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<path d="M13 18c8-3 14-2 19 2v32c-5-4-11-5-19-2V18z" fill={p.light} />
			<path d="M32 20c5-4 11-5 19-2v32c-8-3-14-2-19 2V20z" fill={p.soft} />
			<path d="M13 18c8-3 14-2 19 2 5-4 11-5 19-2" fill="none" stroke={p.deep} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M32 20v32" stroke={p.deep} strokeWidth="3" strokeLinecap="round" opacity="0.5" />
			<path d="M18 28h8M18 36h7M39 28h7M39 36h6" stroke={p.main} strokeWidth="3" strokeLinecap="round" />
		</g>
	);
}

function ProposalGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<rect x="15" y="16" width="34" height="34" rx="8" fill={p.light} />
			<path d="M24 34l6 6 12-16" fill="none" stroke={p.deep} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="46" cy="18" r="7" fill={p.soft} />
			<rect x="15" y="16" width="34" height="34" rx="8" fill="none" stroke={p.main} strokeWidth="4" opacity="0.28" />
		</g>
	);
}

function DocumentGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<path d="M20 12h18l10 10v30H20V12z" fill={p.light} />
			<path d="M38 12v12h10" fill={p.soft} />
			<path d="M27 31h15M27 39h15M27 47h10" stroke={p.main} strokeWidth="4" strokeLinecap="round" />
			<path d="M20 12h18l10 10v30H20V12z" fill="none" stroke={p.deep} strokeWidth="3" strokeLinejoin="round" opacity="0.22" />
		</g>
	);
}

function LibraryGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<rect x="16" y="16" width="10" height="34" rx="4" fill={p.main} />
			<rect x="28" y="12" width="10" height="38" rx="4" fill={p.deep} />
			<rect x="40" y="20" width="10" height="30" rx="4" fill={p.soft} />
			<path d="M15 51h38" stroke={p.deep} strokeWidth="4" strokeLinecap="round" />
			<path d="M19 25h4M31 23h4M43 30h4" stroke={p.light} strokeWidth="3" strokeLinecap="round" />
		</g>
	);
}

function RobotGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<path d="M32 13v7" stroke={p.deep} strokeWidth="4" strokeLinecap="round" />
			<circle cx="32" cy="11" r="4" fill={p.soft} />
			<rect x="15" y="20" width="34" height="28" rx="9" fill={p.main} />
			<circle cx="26" cy="32" r="4" fill={p.light} />
			<circle cx="38" cy="32" r="4" fill={p.light} />
			<path d="M26 41h12" stroke={p.deep} strokeWidth="4" strokeLinecap="round" />
			<path d="M11 31h4M49 31h4" stroke={p.deep} strokeWidth="4" strokeLinecap="round" />
		</g>
	);
}

function ChipGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<rect x="18" y="18" width="28" height="28" rx="7" fill={p.main} />
			<rect x="25" y="25" width="14" height="14" rx="4" fill={p.light} opacity="0.85" />
			{[17, 25, 33, 41].map((y) => (
				<path key={`l-${y}`} d={`M12 ${y}h6M46 ${y}h6`} stroke={p.deep} strokeWidth="3" strokeLinecap="round" />
			))}
			{[17, 25, 33, 41].map((x) => (
				<path key={`t-${x}`} d={`M${x} 12v6M${x} 46v6`} stroke={p.deep} strokeWidth="3" strokeLinecap="round" />
			))}
		</g>
	);
}

function ShieldGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<path d="M32 12l18 7v12c0 11-7 18-18 23-11-5-18-12-18-23V19l18-7z" fill={p.main} />
			<path d="M25 32l5 5 10-12" fill="none" stroke={p.light} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M32 12v42" stroke={p.deep} strokeWidth="3" opacity="0.22" />
		</g>
	);
}

function SearchGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<rect x="17" y="12" width="26" height="34" rx="6" fill={p.light} />
			<path d="M24 23h12M24 31h10" stroke={p.main} strokeWidth="4" strokeLinecap="round" />
			<circle cx="40" cy="39" r="8" fill={p.soft} />
			<path d="M46 45l6 6" stroke={p.deep} strokeWidth="5" strokeLinecap="round" />
			<circle cx="40" cy="39" r="8" fill="none" stroke={p.deep} strokeWidth="4" />
		</g>
	);
}

function ClockGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<circle cx="32" cy="32" r="20" fill={p.light} />
			<circle cx="32" cy="32" r="20" fill="none" stroke={p.main} strokeWidth="5" />
			<path d="M32 20v13l10 6" stroke={p.deep} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="46" cy="18" r="5" fill={p.soft} />
		</g>
	);
}

function WarningGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<path d="M32 12l23 40H9l23-40z" fill={p.soft} />
			<path d="M32 12l23 40H9l23-40z" fill="none" stroke={p.deep} strokeWidth="4" strokeLinejoin="round" />
			<path d="M32 25v12" stroke={p.deep} strokeWidth="5" strokeLinecap="round" />
			<circle cx="32" cy="44" r="3" fill={p.deep} />
		</g>
	);
}

function BellGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<path d="M20 29c0-8 5-14 12-14s12 6 12 14v9l5 8H15l5-8v-9z" fill={p.main} />
			<path d="M27 48a5 5 0 0010 0" fill="none" stroke={p.deep} strokeWidth="5" strokeLinecap="round" />
			<circle cx="44" cy="18" r="6" fill={p.soft} />
		</g>
	);
}

function AuditGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<path d="M18 12h24l6 6v34H18V12z" fill={p.light} />
			<path d="M27 32l4 4 8-11" fill="none" stroke={p.soft} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M25 44h16" stroke={p.main} strokeWidth="4" strokeLinecap="round" />
			<path d="M42 12v8h7" fill={p.main} opacity="0.7" />
			<path d="M18 12h24l6 6v34H18V12z" fill="none" stroke={p.deep} strokeWidth="3" strokeLinejoin="round" opacity="0.22" />
		</g>
	);
}

function BillingGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<rect x="12" y="19" width="40" height="28" rx="8" fill={p.main} />
			<rect x="12" y="26" width="40" height="6" fill={p.deep} opacity="0.5" />
			<rect x="20" y="38" width="12" height="4" rx="2" fill={p.light} />
			<circle cx="44" cy="40" r="5" fill={p.soft} />
		</g>
	);
}

function SettingsGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<circle cx="32" cy="32" r="9" fill={p.light} />
			<path
				d="M32 12l4 6 7-1 3 6-5 5 2 7 7 3-3 7-7-1-4 6h-8l-4-6-7 1-3-7 7-3 2-7-5-5 3-6 7 1 4-6h8z"
				fill={p.main}
			/>
			<circle cx="32" cy="32" r="8" fill={p.light} />
			<circle cx="32" cy="32" r="4" fill={p.deep} />
		</g>
	);
}

function LogoutGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<path d="M18 15h20v34H18V15z" fill={p.light} />
			<path d="M35 32h18M45 24l8 8-8 8" fill="none" stroke={p.deep} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M18 15h20v34H18V15z" fill="none" stroke={p.main} strokeWidth="4" strokeLinejoin="round" />
		</g>
	);
}

function MenuGlyph({ p }: { p: Palette }) {
	return (
		<g>
			<rect x="16" y="18" width="32" height="6" rx="3" fill={p.deep} />
			<rect x="16" y="29" width="32" height="6" rx="3" fill={p.main} />
			<rect x="16" y="40" width="32" height="6" rx="3" fill={p.soft} />
		</g>
	);
}

function ArrowGlyph({
	p,
	direction,
}: {
	p: Palette;
	direction: "left" | "right";
}) {
	const points =
		direction === "left"
			? "M34 18L20 32l14 14M22 32h22"
			: "M30 18l14 14-14 14M42 32H20";
	return (
		<g>
			<circle cx="32" cy="32" r="21" fill={p.light} />
			<circle cx="32" cy="32" r="21" fill="none" stroke={p.main} strokeWidth="5" />
			<path
				d={points}
				fill="none"
				stroke={p.deep}
				strokeWidth="5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx="47" cy="18" r="5" fill={p.soft} />
		</g>
	);
}
