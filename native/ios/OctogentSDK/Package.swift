// swift-tools-version:5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.
// Octogent iOS/macOS SDK
// Copyright (c) 2024 Octogent Labs. All rights reserved.

import PackageDescription

let package = Package(
    name: "OctogentSDK",
    platforms: [
        .iOS(.v15),
        .macOS(.v12),
        .tvOS(.v15),
        .watchOS(.v8)
    ],
    products: [
        .library(
            name: "OctogentSDK",
            targets: ["OctogentSDK"]
        ),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "OctogentSDK",
            dependencies: [],
            path: "Sources/OctogentSDK"
        ),
        .testTarget(
            name: "OctogentSDKTests",
            dependencies: ["OctogentSDK"],
            path: "Tests/OctogentSDKTests"
        ),
    ]
)
