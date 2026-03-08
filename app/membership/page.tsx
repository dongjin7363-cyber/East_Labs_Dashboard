import { EmptyState } from "@/components/common/EmptyState";
import { CalendarHeaderBar } from "@/components/common/CalendarHeaderBar";
import { SectionCard } from "@/components/common/SectionCard";

export default function MembershipPage() {
  return (
    <section>
      <CalendarHeaderBar title="Membership" />
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
