import { ReactNode } from "react";

interface PageHeaderBarProps {
  title: ReactNode;
  titleMeta?: ReactNode;
  description?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
}

export function PageHeaderBar({
  title,
  titleMeta,
  description,
  rightSlot,
  className = "",
}: PageHeaderBarProps) {
  return (
    <section className={`page-header ${className}`.trim()}>
      <div className="page-title-group">
        <div className="page-title-row">
          <h1>{title}</h1>
          {titleMeta ? <div className="page-title-meta">{titleMeta}</div> : null}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {rightSlot ? <div className="page-actions">{rightSlot}</div> : null}
    </section>
  );
}

export default PageHeaderBar;
