import SwiftUI

@main
struct PortfolioMacApp: App {
    @StateObject private var store = PortfolioStore()

    var body: some Scene {
        WindowGroup {
            DashboardView()
                .environmentObject(store)
                .frame(minWidth: 1200, minHeight: 760)
        }
    }
}
