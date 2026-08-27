import { SkeletonGrid } from "../../components/feedback/Skeleton";

export default function SectionState({ loading, error, onRetry, children }) {
  if (loading) {
    return <SkeletonGrid count={4} />;
  }

  if (error) {
    return (
      <div className="ia-error-banner" role="alert">
        {error}
        <button type="button" onClick={onRetry}>Tentar novamente</button>
      </div>
    );
  }

  return children;
}
