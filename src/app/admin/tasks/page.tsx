import { Suspense } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import TasksApp from '@/components/admin/tasks/TasksApp';

export const metadata = { title: 'Tasks | Windsor Glow Admin' };

export default function AdminTasksPage() {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-stone-50">
      <AdminSidebar />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        {/* Suspense: TasksApp reads the ?task= deep-link via useSearchParams */}
        <Suspense fallback={<p className="py-20 text-center text-sm text-stone-400">Loading tasks...</p>}>
          <TasksApp />
        </Suspense>
      </main>
    </div>
  );
}
