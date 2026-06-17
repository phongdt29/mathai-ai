'use client';

import * as React from 'react';
import CurriculumTemplateDetail from '@/components/CurriculumTemplateDetail';

export default function AdminCurriculumDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <CurriculumTemplateDetail id={id} basePath="/admin/content-library" />;
}
