import { AdminAiAssistantPage } from "@/components/ai/admin-ai-assistant-page";
import { getAdminAiAssistantSnapshot } from "@/lib/ai/admin-ai-read-model";

export default async function AdminAiAssistantRoutePage() {
  const snapshot = await getAdminAiAssistantSnapshot();

  return <AdminAiAssistantPage snapshot={snapshot} />;
}
