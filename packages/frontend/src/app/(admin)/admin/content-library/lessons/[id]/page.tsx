'use client';

import * as React from 'react';
import LessonTemplateDetail from '@/components/LessonTemplateDetail';

export default function AdminLessonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <LessonTemplateDetail id={id} basePath="/admin/content-library" />;
}
