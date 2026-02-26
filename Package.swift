// swift-tools-version: 6.2
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "PortfolioMac",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "PortfolioMac", targets: ["PortfolioMac"])
    ],
    targets: [
        .executableTarget(
            name: "PortfolioMac"
        ),
    ]
)
