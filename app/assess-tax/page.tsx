import { Suspense } from "react";
import AssessTaxClient from "./AssessTaxView";

export default function Page() {
  return (
    <Suspense fallback={<div>Loading tax details…</div>}>
      <AssessTaxClient />
    </Suspense>
  );
}
