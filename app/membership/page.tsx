import { PageHeader } from "@/components/PageHeader";

export default function MembershipPage() {
  return (
    <section>
      <PageHeader title="Membership" />
      <section className="panel">
        {/* Route shell intentionally kept in place until Membership CRUD is restored. */}
        <p>Membership page is available.</p>
      </section>
    </section>
  );
}
