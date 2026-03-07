"use client";

import { ComponentProps } from "react";
import { PortfolioAllocationDonut } from "@/components/portfolio/PortfolioAllocationDonut";

type PortfolioAllocationSectionProps = ComponentProps<typeof PortfolioAllocationDonut>;

export function PortfolioAllocationSection(
  props: PortfolioAllocationSectionProps,
) {
  return <PortfolioAllocationDonut {...props} />;
}

export default PortfolioAllocationSection;
