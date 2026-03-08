import { ReactNode } from "react";

interface SectionCardProps {
  title?: ReactNode;
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
}

export function SectionCard({
  title,
  rightSlot,
  children,
  className = "",
  headerClassName = "",
}: SectionCardProps) {
  return (
    <section className={`panel ${className}`.trim()}>
      {title || rightSlot ? (
        <div className={`panel-header-inline ${headerClassName}`.trim()}>
          {title ? <h3>{title}</h3> : <span />}
          {rightSlot}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export default SectionCard;
