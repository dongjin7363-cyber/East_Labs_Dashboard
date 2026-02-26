import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  titleMeta?: ReactNode;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  titleMeta,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <section className="page-header">
      <div className="page-title-group">
        <div className="page-title-row">
          <h1>{title}</h1>
          {titleMeta ? <div className="page-title-meta">{titleMeta}</div> : null}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </section>
  );
}
