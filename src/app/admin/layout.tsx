import ConfirmProvider from '@/components/admin/ConfirmProvider';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // ConfirmProvider puts the "are you sure?" question on the page instead of leaving it to the
  // browser, which silently shows nothing inside an iPhone in-app browser (task 07cc2628).
  return (
    <div className="h-full bg-stone-50">
      <ConfirmProvider>{children}</ConfirmProvider>
    </div>
  );
}
