'use client';

import * as React from 'react';
import LessonTemplateEdit from '@/components/LessonTemplateEdit';

export default function AdminLessonEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <LessonTemplateEdit id={id} basePath="/admin/content-library" />;
}
