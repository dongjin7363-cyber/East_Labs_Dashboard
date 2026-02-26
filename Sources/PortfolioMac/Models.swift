import Foundation

enum Market: String, CaseIterable, Codable, Identifiable {
    case kr = "KR"
    case us = "US"

    var id: String { rawValue }
    var title: String { rawValue }
}

enum InvestmentTerm: String, CaseIterable, Codable, Identifiable {
    case short = "ST"
    case long = "LT"

    var id: String { rawValue }
    var title: String { rawValue }
}

enum Sector: String, CaseIterable, Codable, Identifiable {
    case ai = "AI"
    case semi = "Semi"
    case biotech = "Biotech"
    case ev = "EV"
    case robotics = "Robotics"
    case energy = "Energy"
    case space = "Space"
    case smallCap = "SmallCap"
    case index = "Index"
    case cashLike = "Cash"

    var id: String { rawValue }
}

enum PositionStatus: String {
    case over = "Over"
    case under = "Under"
    case neutral = "Neutral"
}

struct Holding: Identifiable, Codable, Hashable {
    var id: UUID
    var symbol: String
    var displayName: String
    var market: Market
    var sector: Sector
    var term: InvestmentTerm
    var costBasis: Double
    var currentValue: Double
    var targetWeight: Double?
    var note: String

    var profit: Double { currentValue - costBasis }

    var returnRate: Double {
        guard costBasis != 0 else { return 0 }
        return profit / costBasis
    }
}

struct PortfolioSnapshot: Codable {
    var netDeposits: Double
    var cashBalance: Double
    var holdings: [Holding]
}

struct AllocationEntry: Identifiable, Hashable {
    var id: String { name }
    let name: String
    let ratio: Double
}
