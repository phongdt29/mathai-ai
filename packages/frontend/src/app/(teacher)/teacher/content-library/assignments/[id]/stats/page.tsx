"use client";

import * as React from "react";
import AssignmentStats from "@/components/AssignmentStats";

export default function TeacherAssignmentStatsPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = React.use(params);
	return (
		<AssignmentStats id={id} basePath="/teacher/content-library/assignments" />
	);
}
