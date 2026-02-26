import Foundation
import SwiftUI

final class PortfolioStore: ObservableObject {
    @Published var netDeposits: Double = 0 {
        didSet { saveIfReady() }
    }

    @Published var cashBalance: Double = 0 {
        didSet { saveIfReady() }
    }

    @Published var holdings: [Holding] = [] {
        didSet {
            guard !isSortingHoldings else { return }
            sortHoldings()
            saveIfReady()
        }
    }

    var totalEquity: Double {
        holdings.reduce(0) { $0 + $1.currentValue }
    }

    var totalAssets: Double {
        totalEquity + cashBalance
    }

    var totalProfit: Double {
        totalAssets - netDeposits
    }

    var totalReturnRate: Double {
        guard netDeposits != 0 else { return 0 }
        return totalProfit / netDeposits
    }

    private let fileURL: URL
    private var isBootstrapping = true
    private var isSortingHoldings = false

    init(fileManager: FileManager = .default) {
        fileURL = Self.makeFileURL(fileManager: fileManager)
        load()

        if holdings.isEmpty && cashBalance == 0 && netDeposits == 0 {
            seedDemoData()
        }

        isBootstrapping = false
        save()
    }

    func ratio(for holding: Holding) -> Double {
        guard totalAssets > 0 else { return 0 }
        return holding.currentValue / totalAssets
    }

    func status(for holding: Holding) -> PositionStatus {
        guard let targetWeight = holding.targetWeight, targetWeight > 0 else {
            return .neutral
        }

        let current = ratio(for: holding) * 100
        if current > targetWeight * 1.1 {
            return .over
        }
        if current < targetWeight * 0.9 {
            return .under
        }
        return .neutral
    }

    func upsert(_ holding: Holding) {
        if let index = holdings.firstIndex(where: { $0.id == holding.id }) {
            holdings[index] = holding
        } else {
            holdings.append(holding)
        }
    }

    func delete(_ holding: Holding) {
        holdings.removeAll { $0.id == holding.id }
    }

    func marketAllocation() -> [AllocationEntry] {
        let denominator = totalAssets
        let marketRows = Market.allCases.map { market in
            let value = holdings
                .filter { $0.market == market }
                .reduce(0) { $0 + $1.currentValue }
            return AllocationEntry(
                name: market.title,
                ratio: denominator == 0 ? 0 : value / denominator
            )
        }

        let cashRow = AllocationEntry(
            name: "Cash",
            ratio: denominator == 0 ? 0 : cashBalance / denominator
        )

        return (marketRows + [cashRow]).filter { $0.ratio > 0 || denominator == 0 }
    }

    func sectorAllocation() -> [AllocationEntry] {
        let denominator = totalAssets
        let grouped = Dictionary(grouping: holdings, by: \.sector)
        let rows = Sector.allCases.compactMap { sector -> AllocationEntry? in
            let value = grouped[sector, default: []].reduce(0) { $0 + $1.currentValue }
            guard value > 0 || denominator == 0 else { return nil }
            return AllocationEntry(
                name: sector.rawValue,
                ratio: denominator == 0 ? 0 : value / denominator
            )
        }

        return rows.sorted { $0.ratio > $1.ratio }
    }

    private func saveIfReady() {
        guard !isBootstrapping else { return }
        save()
    }

    private func sortHoldings() {
        let sorted = holdings.sorted { lhs, rhs in
            lhs.currentValue > rhs.currentValue
        }
        guard sorted != holdings else { return }
        isSortingHoldings = true
        holdings = sorted
        isSortingHoldings = false
    }

    private static func makeFileURL(fileManager: FileManager) -> URL {
        if let appSupportDirectory = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            let directory = appSupportDirectory.appendingPathComponent("PortfolioMac", isDirectory: true)
            return directory.appendingPathComponent("portfolio.json", isDirectory: false)
        }

        return URL(fileURLWithPath: "portfolio.json")
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else {
            return
        }

        do {
            let snapshot = try JSONDecoder().decode(PortfolioSnapshot.self, from: data)
            netDeposits = snapshot.netDeposits
            cashBalance = snapshot.cashBalance
            holdings = snapshot.holdings
            sortHoldings()
        } catch {
            print("Could not decode saved portfolio: \(error.localizedDescription)")
        }
    }

    private func save() {
        let snapshot = PortfolioSnapshot(
            netDeposits: netDeposits,
            cashBalance: cashBalance,
            holdings: holdings
        )

        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )

            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(snapshot)
            try data.write(to: fileURL, options: [.atomic])
        } catch {
            print("Could not save portfolio: \(error.localizedDescription)")
        }
    }

    private func seedDemoData() {
        netDeposits = 29_500_000
        cashBalance = 6_737_467
        holdings = [
            Holding(
                id: UUID(),
                symbol: "SAMBIO",
                displayName: "Samsung Biologics",
                market: .kr,
                sector: .biotech,
                term: .long,
                costBasis: 4_080_000,
                currentValue: 3_702_000,
                targetWeight: 20,
                note: "KR biotech long-term"
            ),
            Holding(
                id: UUID(),
                symbol: "DGMT",
                displayName: "Digen Matrix",
                market: .kr,
                sector: .biotech,
                term: .long,
                costBasis: 6_704_500,
                currentValue: 6_756_400,
                targetWeight: 18,
                note: "20s semiconductor consolidation thesis"
            ),
            Holding(
                id: UUID(),
                symbol: "PLTR",
                displayName: "Palantir",
                market: .us,
                sector: .ai,
                term: .long,
                costBasis: 2_170_998,
                currentValue: 1_967_667,
                targetWeight: 10,
                note: "AI data platform core"
            ),
            Holding(
                id: UUID(),
                symbol: "AMD",
                displayName: "Advanced Micro Devices",
                market: .us,
                sector: .semi,
                term: .short,
                costBasis: 4_131_455,
                currentValue: 3_922_043,
                targetWeight: 15,
                note: "Semi cycle trade"
            ),
            Holding(
                id: UUID(),
                symbol: "RKLB",
                displayName: "Rocket Lab",
                market: .us,
                sector: .space,
                term: .long,
                costBasis: 3_062_867,
                currentValue: 3_595_960,
                targetWeight: 12,
                note: "Never sell candidate"
            ),
            Holding(
                id: UUID(),
                symbol: "NBIS",
                displayName: "Nebius",
                market: .us,
                sector: .ai,
                term: .long,
                costBasis: 2_015_846,
                currentValue: 2_199_068,
                targetWeight: 8,
                note: "AI infrastructure"
            )
        ]
    }
}
