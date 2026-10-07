import CalepinageLayout from "@/components/calepinage/CalepinageLayout";

interface PageProps {
  params: Promise<{ zoneId: string }>;
}

export default async function CalepinageZonePage({ params }: PageProps) {
  const { zoneId } = await params;
  return <CalepinageLayout zoneId={zoneId} />;
}
