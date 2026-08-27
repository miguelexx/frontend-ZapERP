import LogsView from "./LogsView";
import { useLogs } from "./useLogs";
import { SectionError, SectionLoading } from "../shared/SectionFeedback";

export default function LogsSection({ companyKey }) {
  const { logs, loading, error, reload } = useLogs(companyKey);
  if (loading) return <SectionLoading />;
  if (error) return <SectionError message={error} onRetry={reload} />;
  return <LogsView logs={logs} onRefresh={reload} />;
}
