'use client';

import * as React from 'react';
import AssignmentEdit from '@/components/AssignmentEdit';

export default function AdminAssignmentEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <AssignmentEdit id={id} basePath="/admin/assignments" />;
}
