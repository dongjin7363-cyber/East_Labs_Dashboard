import Charts
import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var store: PortfolioStore
    @State private var activeSheet: HoldingSheet?

    var body: some View {
        VStack(spacing: 16) {
            header
            summaryCards
            allocationPanels
            holdingsPanel
        }
        .padding(20)
        .background(Color(nsColor: .windowBackgroundColor))
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .create:
                HoldingFormView(mode: .create) { store.upsert($0) }
            case .edit(let holding):
                HoldingFormView(mode: .edit(holding)) { store.upsert($0) }
            }
        }
    }

    private var header: some View {
        HStack(alignment: .bottom, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Portfolio Tracker")
                    .font(.system(size: 32, weight: .bold))
                Text("KR + US holdings, allocation, and return monitoring")
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .leading, spacing: 6) {
                Text("Net Deposits")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField("Net Deposits", value: $store.netDeposits, format: .number.grouping(.automatic))
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 160)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Cash")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                TextField("Cash", value: $store.cashBalance, format: .number.grouping(.automatic))
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 160)
            }

            Button {
                activeSheet = .create
            } label: {
                Label("Add Holding", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
        }
    }

    private var summaryCards: some View {
        LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible()),
            GridItem(.flexible()),
            GridItem(.flexible())
        ], spacing: 12) {
            StatCard(
                title: "Total Assets",
                valueText: amountText(store.totalAssets),
                valueColor: .primary
            )
            StatCard(
                title: "Total Equity",
                valueText: amountText(store.totalEquity),
                valueColor: .primary
            )
            StatCard(
                title: "Total Profit",
                valueText: amountText(store.totalProfit),
                valueColor: performanceColor(rate: store.totalReturnRate)
            )
            StatCard(
                title: "Total Return",
                valueText: percentText(store.totalReturnRate),
                valueColor: performanceColor(rate: store.totalReturnRate)
            )
        }
    }

    private var allocationPanels: some View {
        HStack(alignment: .top, spacing: 12) {
            AllocationCard(
                title: "Market Ratio",
                entries: store.marketAllocation(),
                accent: .blue
            )
            AllocationCard(
                title: "Sector Ratio",
                entries: store.sectorAllocation(),
                accent: .green
            )
        }
    }

    private var holdingsPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Holdings")
                    .font(.title2.bold())
                Spacer()
                Text("\(store.holdings.count) positions")
                    .foregroundStyle(.secondary)
            }

            Table(store.holdings) {
                TableColumn("Symbol", value: \.symbol)
                TableColumn("Market") { holding in
                    Text(holding.market.title)
                }
                TableColumn("Sector") { holding in
                    Text(holding.sector.rawValue)
                }
                TableColumn("Portion") { holding in
                    Text(amountText(holding.costBasis))
                }
                TableColumn("NAV") { holding in
                    Text(amountText(holding.currentValue))
                }
                TableColumn("Ratio") { holding in
                    Text(percentText(store.ratio(for: holding)))
                }
                TableColumn("Return") { holding in
                    Text(percentText(holding.returnRate))
                        .foregroundStyle(performanceColor(rate: holding.returnRate))
                }
                TableColumn("Profit") { holding in
                    Text(amountText(holding.profit))
                        .foregroundStyle(performanceColor(rate: holding.returnRate))
                }
                TableColumn("Status") { holding in
                    PositionStatusBadge(status: store.status(for: holding))
                }
                TableColumn("Actions") { holding in
                    HStack(spacing: 8) {
                        Button("Edit") {
                            activeSheet = .edit(holding)
                        }
                        .buttonStyle(.borderless)

                        Button("Delete", role: .destructive) {
                            store.delete(holding)
                        }
                        .buttonStyle(.borderless)
                    }
                }
            }
            .frame(minHeight: 330)
        }
        .padding(16)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
    }

    private func amountText(_ value: Double) -> String {
        value.formatted(.number.grouping(.automatic).precision(.fractionLength(0)))
    }

    private func percentText(_ value: Double) -> String {
        value.formatted(.percent.precision(.fractionLength(2)))
    }

    private func performanceColor(rate: Double) -> Color {
        if rate > 0 {
            return .red
        }
        if rate < 0 {
            return .blue
        }
        return .primary
    }
}

private enum HoldingSheet: Identifiable {
    case create
    case edit(Holding)

    var id: String {
        switch self {
        case .create:
            return "create"
        case .edit(let holding):
            return "edit-\(holding.id.uuidString)"
        }
    }
}

private struct StatCard: View {
    let title: String
    let valueText: String
    let valueColor: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(valueText)
                .font(.title3.weight(.semibold))
                .foregroundStyle(valueColor)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct AllocationCard: View {
    let title: String
    let entries: [AllocationEntry]
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.headline)

            if entries.isEmpty {
                ContentUnavailableView("No data", systemImage: "chart.bar")
                    .frame(height: 220)
            } else {
                Chart(entries) { entry in
                    BarMark(
                        x: .value("Category", entry.name),
                        y: .value("Weight", entry.ratio * 100)
                    )
                    .foregroundStyle(accent.gradient)
                    .annotation(position: .top) {
                        if entry.ratio > 0.01 {
                            Text(entry.ratio.formatted(.percent.precision(.fractionLength(1))))
                                .font(.caption2)
                        }
                    }
                }
                .chartYScale(domain: 0...max(10, maxRatio * 120))
                .chartYAxis {
                    AxisMarks(position: .leading)
                }
                .frame(height: 220)

                Divider()

                ForEach(entries) { entry in
                    HStack {
                        Text(entry.name)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(entry.ratio.formatted(.percent.precision(.fractionLength(2))))
                            .monospacedDigit()
                    }
                    .font(.caption)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
    }

    private var maxRatio: Double {
        entries.map(\.ratio).max() ?? 0
    }
}

private struct PositionStatusBadge: View {
    let status: PositionStatus

    var body: some View {
        Text(status.rawValue)
            .font(.caption.weight(.semibold))
            .padding(.vertical, 4)
            .padding(.horizontal, 8)
            .foregroundStyle(color)
            .background(color.opacity(0.15), in: Capsule())
    }

    private var color: Color {
        switch status {
        case .over:
            return .red
        case .under:
            return .blue
        case .neutral:
            return .green
        }
    }
}
