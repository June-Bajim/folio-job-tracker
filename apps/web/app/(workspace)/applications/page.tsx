import { Suspense } from "react";
import { ApplicationList } from "../../../components/applications";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading applications…</p>}>
      <ApplicationList />
    </Suspense>
  );
}
