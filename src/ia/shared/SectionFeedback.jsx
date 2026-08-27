import { SkeletonGrid } from "../../components/feedback/Skeleton";

export function SectionLoading() {
  return <div className="ia-section"><SkeletonGrid count={4} /></div>;
}

export function SectionError({ message, onRetry }) {
  return (
    <div className="ia-section">
      <div className="ia-error-banner" role="alert">
        {message}
        {onRetry ? <button type="button" onClick={onRetry}>Tentar novamente</button> : null}
      </div>
    </div>
  );
}
