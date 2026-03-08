import { ReactNode } from "react";
import { PageHeaderBar } from "@/components/common/PageHeaderBar";

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
    <PageHeaderBar
      title={title}
      titleMeta={titleMeta}
      description={description}
      rightSlot={actions}
    />
  );
}
