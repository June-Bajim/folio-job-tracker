import { ApplicationDetails } from "../../../../components/details";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ApplicationDetails id={id} />;
}
