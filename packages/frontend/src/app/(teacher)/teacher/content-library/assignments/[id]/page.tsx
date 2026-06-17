"use client";

import * as React from "react";
import AssignmentDetail from "@/components/AssignmentDetail";

export default function TeacherAssignmentDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = React.use(params);
	return (
		<AssignmentDetail id={id} basePath="/teacher/content-library/assignments" />
	);
}
