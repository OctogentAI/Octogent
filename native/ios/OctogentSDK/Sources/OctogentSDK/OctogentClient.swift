// OctogentClient.swift
// Octogent iOS/macOS SDK
// Copyright (c) 2024 Octogent Labs. All rights reserved.

import Foundation

/// Configuration for the Octogent client
public struct OctogentConfig {
    public let host: String
    public let port: Int
    public let apiKey: String?
    public let timeout: TimeInterval
    public let enableSSL: Bool
    
    public init(
        host: String = "localhost",
        port: Int = 8888,
        apiKey: String? = nil,
        timeout: TimeInterval = 30.0,
        enableSSL: Bool = false
    ) {
        self.host = host
        self.port = port
        self.apiKey = apiKey
        self.timeout = timeout
        self.enableSSL = enableSSL
    }
    
    var baseURL: URL {
        let scheme = enableSSL ? "https" : "http"
        return URL(string: "\(scheme)://\(host):\(port)")!
    }
    
    var websocketURL: URL {
        let scheme = enableSSL ? "wss" : "ws"
        return URL(string: "\(scheme)://\(host):\(port)/ws")!
    }
}

/// Task status enumeration
public enum TaskStatus: String, Codable {
    case queued
    case running
    case completed
    case failed
    case cancelled
}

/// Task priority levels
public enum TaskPriority: Int, Codable {
    case low = 0
    case normal = 1
    case high = 2
    case critical = 3
}

/// Represents an Octogent task
public struct OctogentTask: Codable, Identifiable {
    public let id: String
    public let sessionId: String
    public let goal: String
    public var status: TaskStatus
    public let priority: TaskPriority
    public let createdAt: Date
    public var startedAt: Date?
    public var completedAt: Date?
    public var result: String?
    public var error: String?
    public var workerId: Int?
    public var iterations: Int
    public var toolCalls: Int
    
    public init(
        id: String = UUID().uuidString,
        sessionId: String,
        goal: String,
        status: TaskStatus = .queued,
        priority: TaskPriority = .normal,
        createdAt: Date = Date(),
        startedAt: Date? = nil,
        completedAt: Date? = nil,
        result: String? = nil,
        error: String? = nil,
        workerId: Int? = nil,
        iterations: Int = 0,
        toolCalls: Int = 0
    ) {
        self.id = id
        self.sessionId = sessionId
        self.goal = goal
        self.status = status
        self.priority = priority
        self.createdAt = createdAt
        self.startedAt = startedAt
        self.completedAt = completedAt
        self.result = result
        self.error = error
        self.workerId = workerId
        self.iterations = iterations
        self.toolCalls = toolCalls
    }
}

/// Represents an Octogent session
public struct OctogentSession: Codable, Identifiable {
    public let id: String
    public let name: String
    public let createdAt: Date
    public var updatedAt: Date
    public var taskCount: Int
    public var completedTasks: Int
    public var isActive: Bool
    
    public init(
        id: String = UUID().uuidString,
        name: String,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        taskCount: Int = 0,
        completedTasks: Int = 0,
        isActive: Bool = true
    ) {
        self.id = id
        self.name = name
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.taskCount = taskCount
        self.completedTasks = completedTasks
        self.isActive = isActive
    }
}

/// Worker status information
public struct WorkerStatus: Codable, Identifiable {
    public let id: Int
    public var status: String
    public var currentTaskId: String?
    public var iterations: Int
    public var tokensUsed: Int
    public var lastActivity: Date?
    
    public var isIdle: Bool {
        return status == "idle"
    }
    
    public var isBusy: Bool {
        return status == "busy"
    }
}

/// Message types for WebSocket communication
public enum MessageType: String, Codable {
    case taskCreated = "task:created"
    case taskStarted = "task:started"
    case taskProgress = "task:progress"
    case taskCompleted = "task:completed"
    case taskFailed = "task:failed"
    case workerUpdate = "worker:update"
    case sessionUpdate = "session:update"
    case error = "error"
    case pong = "pong"
}

/// WebSocket message structure
public struct OctogentMessage: Codable {
    public let type: MessageType
    public let data: AnyCodable?
    public let timestamp: Date
    
    public init(type: MessageType, data: AnyCodable? = nil, timestamp: Date = Date()) {
        self.type = type
        self.data = data
        self.timestamp = timestamp
    }
}

/// Type-erased Codable wrapper
public struct AnyCodable: Codable {
    public let value: Any
    
    public init(_ value: Any) {
        self.value = value
    }
    
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let string = try? container.decode(String.self) {
            value = string
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else {
            value = NSNull()
        }
    }
    
    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let string as String:
            try container.encode(string)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let bool as Bool:
            try container.encode(bool)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            try container.encodeNil()
        }
    }
}

/// Delegate protocol for receiving Octogent events
public protocol OctogentClientDelegate: AnyObject {
    func octogentClient(_ client: OctogentClient, didReceiveMessage message: OctogentMessage)
    func octogentClient(_ client: OctogentClient, didConnect session: OctogentSession)
    func octogentClient(_ client: OctogentClient, didDisconnect error: Error?)
    func octogentClient(_ client: OctogentClient, taskDidUpdate task: OctogentTask)
    func octogentClient(_ client: OctogentClient, workerDidUpdate worker: WorkerStatus)
}

/// Main Octogent client for iOS/macOS
public class OctogentClient: NSObject {
    
    // MARK: - Properties
    
    public let config: OctogentConfig
    public weak var delegate: OctogentClientDelegate?
    
    private var webSocketTask: URLSessionWebSocketTask?
    private var urlSession: URLSession!
    private var isConnected = false
    private var reconnectAttempts = 0
    private let maxReconnectAttempts = 5
    private var pingTimer: Timer?
    
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
    
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
    
    // MARK: - Initialization
    
    public init(config: OctogentConfig = OctogentConfig()) {
        self.config = config
        super.init()
        
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.timeoutIntervalForRequest = config.timeout
        sessionConfig.timeoutIntervalForResource = config.timeout * 2
        self.urlSession = URLSession(configuration: sessionConfig, delegate: self, delegateQueue: .main)
    }
    
    deinit {
        disconnect()
    }
    
    // MARK: - Connection Management
    
    /// Connect to the Octogent server
    public func connect() {
        guard !isConnected else { return }
        
        var request = URLRequest(url: config.websocketURL)
        request.timeoutInterval = config.timeout
        
        if let apiKey = config.apiKey {
            request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        
        webSocketTask = urlSession.webSocketTask(with: request)
        webSocketTask?.resume()
        
        isConnected = true
        reconnectAttempts = 0
        
        receiveMessage()
        startPingTimer()
    }
    
    /// Disconnect from the Octogent server
    public func disconnect() {
        stopPingTimer()
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
    }
    
    private func reconnect() {
        guard reconnectAttempts < maxReconnectAttempts else {
            let error = NSError(domain: "OctogentSDK", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "Max reconnection attempts reached"
            ])
            delegate?.octogentClient(self, didDisconnect: error)
            return
        }
        
        reconnectAttempts += 1
        let delay = Double(reconnectAttempts) * 2.0
        
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.connect()
        }
    }
    
    // MARK: - Message Handling
    
    private func receiveMessage() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self.handleTextMessage(text)
                case .data(let data):
                    self.handleDataMessage(data)
                @unknown default:
                    break
                }
                self.receiveMessage()
                
            case .failure(let error):
                self.isConnected = false
                self.delegate?.octogentClient(self, didDisconnect: error)
                self.reconnect()
            }
        }
    }
    
    private func handleTextMessage(_ text: String) {
        guard let data = text.data(using: .utf8) else { return }
        handleDataMessage(data)
    }
    
    private func handleDataMessage(_ data: Data) {
        do {
            let message = try decoder.decode(OctogentMessage.self, from: data)
            delegate?.octogentClient(self, didReceiveMessage: message)
            
            switch message.type {
            case .taskCreated, .taskStarted, .taskProgress, .taskCompleted, .taskFailed:
                if let taskData = try? JSONSerialization.data(withJSONObject: message.data?.value ?? [:]),
                   let task = try? decoder.decode(OctogentTask.self, from: taskData) {
                    delegate?.octogentClient(self, taskDidUpdate: task)
                }
            case .workerUpdate:
                if let workerData = try? JSONSerialization.data(withJSONObject: message.data?.value ?? [:]),
                   let worker = try? decoder.decode(WorkerStatus.self, from: workerData) {
                    delegate?.octogentClient(self, workerDidUpdate: worker)
                }
            default:
                break
            }
        } catch {
            print("[OctogentSDK] Failed to decode message: \(error)")
        }
    }
    
    // MARK: - Ping/Pong
    
    private func startPingTimer() {
        pingTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { [weak self] _ in
            self?.sendPing()
        }
    }
    
    private func stopPingTimer() {
        pingTimer?.invalidate()
        pingTimer = nil
    }
    
    private func sendPing() {
        let pingMessage = ["type": "ping"]
        guard let data = try? JSONSerialization.data(withJSONObject: pingMessage) else { return }
        
        webSocketTask?.send(.data(data)) { error in
            if let error = error {
                print("[OctogentSDK] Ping failed: \(error)")
            }
        }
    }
    
    // MARK: - API Methods
    
    /// Create a new session
    public func createSession(name: String) async throws -> OctogentSession {
        let url = config.baseURL.appendingPathComponent("/api/sessions")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let apiKey = config.apiKey {
            request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        
        let body = ["name": name]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await urlSession.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw OctogentError.serverError("Failed to create session")
        }
        
        return try decoder.decode(OctogentSession.self, from: data)
    }
    
    /// Submit a new task
    public func submitTask(
        sessionId: String,
        goal: String,
        skill: String? = nil,
        priority: TaskPriority = .normal
    ) async throws -> OctogentTask {
        let url = config.baseURL.appendingPathComponent("/api/tasks")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let apiKey = config.apiKey {
            request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        
        var body: [String: Any] = [
            "sessionId": sessionId,
            "goal": goal,
            "priority": priority.rawValue
        ]
        
        if let skill = skill {
            body["skill"] = skill
        }
        
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (data, response) = try await urlSession.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw OctogentError.serverError("Failed to submit task")
        }
        
        return try decoder.decode(OctogentTask.self, from: data)
    }
    
    /// Get task status
    public func getTask(id: String) async throws -> OctogentTask {
        let url = config.baseURL.appendingPathComponent("/api/tasks/\(id)")
        var request = URLRequest(url: url)
        
        if let apiKey = config.apiKey {
            request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await urlSession.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw OctogentError.serverError("Failed to get task")
        }
        
        return try decoder.decode(OctogentTask.self, from: data)
    }
    
    /// Cancel a task
    public func cancelTask(id: String) async throws {
        let url = config.baseURL.appendingPathComponent("/api/tasks/\(id)/cancel")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        if let apiKey = config.apiKey {
            request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        
        let (_, response) = try await urlSession.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw OctogentError.serverError("Failed to cancel task")
        }
    }
    
    /// Get all workers status
    public func getWorkers() async throws -> [WorkerStatus] {
        let url = config.baseURL.appendingPathComponent("/api/workers")
        var request = URLRequest(url: url)
        
        if let apiKey = config.apiKey {
            request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await urlSession.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw OctogentError.serverError("Failed to get workers")
        }
        
        return try decoder.decode([WorkerStatus].self, from: data)
    }
    
    /// Get available skills
    public func getSkills() async throws -> [String] {
        let url = config.baseURL.appendingPathComponent("/api/skills")
        var request = URLRequest(url: url)
        
        if let apiKey = config.apiKey {
            request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await urlSession.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw OctogentError.serverError("Failed to get skills")
        }
        
        let result = try decoder.decode([String: [String]].self, from: data)
        return result["skills"] ?? []
    }
    
    /// Save to agent memory
    public func saveMemory(key: String, value: String, namespace: String = "default") async throws {
        let url = config.baseURL.appendingPathComponent("/api/memory")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let apiKey = config.apiKey {
            request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        
        let body: [String: String] = [
            "key": key,
            "value": value,
            "namespace": namespace
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        
        let (_, response) = try await urlSession.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw OctogentError.serverError("Failed to save memory")
        }
    }
    
    /// Read from agent memory
    public func readMemory(key: String, namespace: String = "default") async throws -> String? {
        var components = URLComponents(url: config.baseURL.appendingPathComponent("/api/memory"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "key", value: key),
            URLQueryItem(name: "namespace", value: namespace)
        ]
        
        var request = URLRequest(url: components.url!)
        
        if let apiKey = config.apiKey {
            request.addValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await urlSession.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw OctogentError.serverError("Invalid response")
        }
        
        if httpResponse.statusCode == 404 {
            return nil
        }
        
        guard (200...299).contains(httpResponse.statusCode) else {
            throw OctogentError.serverError("Failed to read memory")
        }
        
        let result = try decoder.decode([String: String].self, from: data)
        return result["value"]
    }
}

// MARK: - URLSessionWebSocketDelegate

extension OctogentClient: URLSessionWebSocketDelegate {
    public func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        print("[OctogentSDK] WebSocket connected")
    }
    
    public func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        isConnected = false
        let reasonString = reason.flatMap { String(data: $0, encoding: .utf8) }
        print("[OctogentSDK] WebSocket closed: \(closeCode) - \(reasonString ?? "no reason")")
    }
}

// MARK: - Errors

public enum OctogentError: Error, LocalizedError {
    case connectionFailed(String)
    case serverError(String)
    case decodingError(String)
    case invalidResponse
    case timeout
    
    public var errorDescription: String? {
        switch self {
        case .connectionFailed(let message):
            return "Connection failed: \(message)"
        case .serverError(let message):
            return "Server error: \(message)"
        case .decodingError(let message):
            return "Decoding error: \(message)"
        case .invalidResponse:
            return "Invalid response from server"
        case .timeout:
            return "Request timed out"
        }
    }
}
