import type { PointLedgerEntry } from "@/lib/api";

export function adminPointHistoryDetails(entry: PointLedgerEntry): string {
	const note = entry.metadata?.note;
	return typeof note === "string" && note.trim() ? note.trim() : "—";
}
