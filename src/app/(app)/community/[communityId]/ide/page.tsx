import ProtectedRoute from "@/components/auth/ProtectedRoute";
import IDEPageClient from "@/components/ide/IDEPageClient";

export default function IDERoute({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  return (
    <ProtectedRoute>
      <IDEPageClient params={params} />
    </ProtectedRoute>
  );
}
