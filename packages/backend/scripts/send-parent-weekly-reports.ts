import { resolve } from "node:path";
import dotenv from "dotenv";
import mongoose from "mongoose";

import { parentWeeklyReportSchedulerService } from "../src/services/parent-weekly-report-scheduler.service";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "mathai";

export function getDefaultWeeklyReportPeriodKey(
	now: Date = new Date(),
): string {
	const date = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	const day = date.getUTCDay() || 7;
	date.setUTCDate(date.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
	const week = Math.ceil(
		((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
	);
	return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function runParentWeeklyReportScheduler() {
	try {
		await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
		console.log(`Connected to MongoDB database=${DB_NAME}`);

		const periodKey =
			process.env.PERIOD_KEY || getDefaultWeeklyReportPeriodKey();
		const rangeDays = Number(process.env.RANGE_DAYS) || 7;
		return await parentWeeklyReportSchedulerService.run({
			periodKey,
			rangeDays,
		});
	} finally {
		await mongoose.disconnect().catch(() => undefined);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
	runParentWeeklyReportScheduler()
		.then((summary) => {
			if (summary.failed > 0) {
				process.exitCode = 1;
			}
		})
		.catch((error) => {
			console.error("Parent weekly report scheduler failed:", error);
			process.exit(1);
		});
}
