import { redirect } from "next/navigation";

/** Legacy URL: charts and analytics live on /dashboard (Progress Analytics) and /progress. */
export default function DashboardAnalyticsRedirect() {
  redirect("/dashboard");
}
