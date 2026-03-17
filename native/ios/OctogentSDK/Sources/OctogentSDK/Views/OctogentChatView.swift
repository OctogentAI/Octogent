// OctogentChatView.swift
// Octogent iOS/macOS SDK - SwiftUI Components
// Copyright (c) 2024 Octogent Labs. All rights reserved.

import SwiftUI

/// A SwiftUI view for displaying the Octogent chat interface
@available(iOS 15.0, macOS 12.0, *)
public struct OctogentChatView: View {
    @ObservedObject private var viewModel: OctogentChatViewModel
    @State private var inputText: String = ""
    @FocusState private var isInputFocused: Bool
    
    public init(client: OctogentClient, sessionId: String) {
        self.viewModel = OctogentChatViewModel(client: client, sessionId: sessionId)
    }
    
    public var body: some View {
        VStack(spacing: 0) {
            // Header
            headerView
            
            Divider()
            
            // Messages
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(viewModel.messages) { message in
                            MessageBubble(message: message)
                                .id(message.id)
                        }
                    }
                    .padding()
                }
                .onChange(of: viewModel.messages.count) { _ in
                    if let lastMessage = viewModel.messages.last {
                        withAnimation {
                            proxy.scrollTo(lastMessage.id, anchor: .bottom)
                        }
                    }
                }
            }
            
            Divider()
            
            // Input
            inputView
        }
        .background(Color(.systemBackground))
    }
    
    private var headerView: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Octogent")
                    .font(.headline)
                    .fontWeight(.semibold)
                
                HStack(spacing: 4) {
                    Circle()
                        .fill(viewModel.isConnected ? Color.green : Color.red)
                        .frame(width: 8, height: 8)
                    
                    Text(viewModel.isConnected ? "Connected" : "Disconnected")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            Spacer()
            
            if viewModel.isProcessing {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle())
                    .scaleEffect(0.8)
            }
        }
        .padding()
    }
    
    private var inputView: some View {
        HStack(spacing: 12) {
            TextField("Ask Octogent...", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...5)
                .focused($isInputFocused)
                .onSubmit {
                    sendMessage()
                }
            
            Button(action: sendMessage) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
                    .foregroundColor(inputText.isEmpty ? .gray : .accentColor)
            }
            .disabled(inputText.isEmpty || viewModel.isProcessing)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
    }
    
    private func sendMessage() {
        guard !inputText.isEmpty else { return }
        let text = inputText
        inputText = ""
        
        Task {
            await viewModel.sendMessage(text)
        }
    }
}

/// View model for the chat interface
@available(iOS 15.0, macOS 12.0, *)
@MainActor
public class OctogentChatViewModel: ObservableObject {
    @Published public var messages: [ChatMessage] = []
    @Published public var isConnected: Bool = false
    @Published public var isProcessing: Bool = false
    
    private let client: OctogentClient
    private let sessionId: String
    
    public init(client: OctogentClient, sessionId: String) {
        self.client = client
        self.sessionId = sessionId
    }
    
    public func sendMessage(_ text: String) async {
        let userMessage = ChatMessage(role: .user, content: text)
        messages.append(userMessage)
        isProcessing = true
        
        do {
            let task = try await client.submitTask(
                sessionId: sessionId,
                goal: text
            )
            
            let assistantMessage = ChatMessage(
                role: .assistant,
                content: "Task submitted: \(task.id)",
                taskId: task.id
            )
            messages.append(assistantMessage)
        } catch {
            let errorMessage = ChatMessage(
                role: .system,
                content: "Error: \(error.localizedDescription)"
            )
            messages.append(errorMessage)
        }
        
        isProcessing = false
    }
}

/// Represents a chat message
public struct ChatMessage: Identifiable {
    public let id: String
    public let role: MessageRole
    public let content: String
    public let timestamp: Date
    public var taskId: String?
    
    public init(
        id: String = UUID().uuidString,
        role: MessageRole,
        content: String,
        timestamp: Date = Date(),
        taskId: String? = nil
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.timestamp = timestamp
        self.taskId = taskId
    }
}

public enum MessageRole {
    case user
    case assistant
    case system
}

/// Message bubble view
@available(iOS 15.0, macOS 12.0, *)
struct MessageBubble: View {
    let message: ChatMessage
    
    var body: some View {
        HStack {
            if message.role == .user {
                Spacer()
            }
            
            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                Text(message.content)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(backgroundColor)
                    .foregroundColor(foregroundColor)
                    .cornerRadius(18)
                
                Text(message.timestamp, style: .time)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: 280, alignment: message.role == .user ? .trailing : .leading)
            
            if message.role != .user {
                Spacer()
            }
        }
    }
    
    private var backgroundColor: Color {
        switch message.role {
        case .user:
            return .accentColor
        case .assistant:
            return Color(.secondarySystemBackground)
        case .system:
            return Color.orange.opacity(0.2)
        }
    }
    
    private var foregroundColor: Color {
        switch message.role {
        case .user:
            return .white
        case .assistant, .system:
            return .primary
        }
    }
}

/// Workers status grid view
@available(iOS 15.0, macOS 12.0, *)
public struct OctogentWorkersView: View {
    @ObservedObject private var viewModel: WorkersViewModel
    
    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible())
    ]
    
    public init(client: OctogentClient) {
        self.viewModel = WorkersViewModel(client: client)
    }
    
    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Workers")
                .font(.headline)
            
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(viewModel.workers) { worker in
                    WorkerCard(worker: worker)
                }
            }
        }
        .padding()
        .task {
            await viewModel.loadWorkers()
        }
    }
}

@available(iOS 15.0, macOS 12.0, *)
@MainActor
class WorkersViewModel: ObservableObject {
    @Published var workers: [WorkerStatus] = []
    
    private let client: OctogentClient
    
    init(client: OctogentClient) {
        self.client = client
    }
    
    func loadWorkers() async {
        do {
            workers = try await client.getWorkers()
        } catch {
            print("[OctogentSDK] Failed to load workers: \(error)")
        }
    }
}

@available(iOS 15.0, macOS 12.0, *)
struct WorkerCard: View {
    let worker: WorkerStatus
    
    var body: some View {
        VStack(spacing: 8) {
            Circle()
                .fill(statusColor)
                .frame(width: 40, height: 40)
                .overlay(
                    Text("\(worker.id)")
                        .font(.headline)
                        .foregroundColor(.white)
                )
            
            Text(worker.status.capitalized)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
    
    private var statusColor: Color {
        switch worker.status {
        case "idle":
            return .gray
        case "busy":
            return .green
        case "error":
            return .red
        default:
            return .orange
        }
    }
}

// MARK: - Preview Provider

#if DEBUG
@available(iOS 15.0, macOS 12.0, *)
struct OctogentChatView_Previews: PreviewProvider {
    static var previews: some View {
        OctogentChatView(
            client: OctogentClient(),
            sessionId: "preview-session"
        )
    }
}
#endif
