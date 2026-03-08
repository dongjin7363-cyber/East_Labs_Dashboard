import { EmptyState } from "@/components/common/EmptyState";
import { PageHeaderBar } from "@/components/common/PageHeaderBar";
import { SectionCard } from "@/components/common/SectionCard";

export default function MembershipPage() {
  return (
    <section>
      <PageHeaderBar title="Membership" />
      <SectionCard>
        {/* Route shell intentionally kept in place until Membership CRUD is restored. */}
        <EmptyState
          title="Membership page is available."
          description="Membership CRUD 복구 전까지 route shell만 유지됩니다."
          compact
        />
      </SectionCard>
    </section>
  );
}
