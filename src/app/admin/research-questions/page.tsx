import { Suspense } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import ResearchQuestionsClient from './research-questions-client';

export default function AdminResearchQuestionsPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-stone-50 lg:flex-row">
      <AdminSidebar />
      <Suspense fallback={<main className="flex-1 p-6 text-sm text-stone-500 lg:p-8">Loading PEARL Questions...</main>}>
        <ResearchQuestionsClient />
      </Suspense>
    </div>
  );
}
