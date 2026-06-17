'use client';

import * as React from 'react';
import LessonTemplateStats from '@/components/LessonTemplateStats';

export default function TeacherLessonStatsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  return <LessonTemplateStats id={id} basePath="/teacher/content-library" />;
}
