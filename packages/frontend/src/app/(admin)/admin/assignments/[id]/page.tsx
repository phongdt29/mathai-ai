'use client';

import * as React from 'react';
import AssignmentDetail from '@/components/AssignmentDetail';

export default function AdminAssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <AssignmentDetail id={id} basePath="/admin/assignments" />;
}
