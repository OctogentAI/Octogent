/**
 * OctogentClient.kt
 * Octogent Android SDK
 * Copyright (c) 2024 Octogent Labs. All rights reserved.
 */

package ai.octogent.sdk

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.*
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Configuration for the Octogent client
 */
data class OctogentConfig(
    val host: String = "localhost",
    val port: Int = 8888,
    val apiKey: String? = null,
    val timeout: Long = 30,
    val enableSSL: Boolean = false
) {
    val baseUrl: String
        get() = "${if (enableSSL) "https" else "http"}://$host:$port"
    
    val websocketUrl: String
        get() = "${if (enableSSL) "wss" else "ws"}://$host:$port/ws"
}

/**
 * Task status enumeration
 */
@Serializable
enum class TaskStatus {
    @SerialName("queued") QUEUED,
    @SerialName("running") RUNNING,
    @SerialName("completed") COMPLETED,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED
}

/**
 * Task priority levels
 */
@Serializable
enum class TaskPriority(val value: Int) {
    LOW(0),
    NORMAL(1),
    HIGH(2),
    CRITICAL(3)
}

/**
 * Represents an Octogent task
 */
@Serializable
data class OctogentTask(
    val id: String,
    val sessionId: String,
    val goal: String,
    val status: TaskStatus = TaskStatus.QUEUED,
    val priority: TaskPriority = TaskPriority.NORMAL,
    val createdAt: String,
    val startedAt: String? = null,
    val completedAt: String? = null,
    val result: String? = null,
    val error: String? = null,
    val workerId: Int? = null,
    val iterations: Int = 0,
    val toolCalls: Int = 0
)

/**
 * Represents an Octogent session
 */
@Serializable
data class OctogentSession(
    val id: String,
    val name: String,
    val createdAt: String,
    val updatedAt: String,
    val taskCount: Int = 0,
    val completedTasks: Int = 0,
    val isActive: Boolean = true
)

/**
 * Worker status information
 */
@Serializable
data class WorkerStatus(
    val id: Int,
    val status: String,
    val currentTaskId: String? = null,
    val iterations: Int = 0,
    val tokensUsed: Int = 0,
    val lastActivity: String? = null
) {
    val isIdle: Boolean get() = status == "idle"
    val isBusy: Boolean get() = status == "busy"
}

/**
 * Message types for WebSocket communication
 */
@Serializable
enum class MessageType {
    @SerialName("task:created") TASK_CREATED,
    @SerialName("task:started") TASK_STARTED,
    @SerialName("task:progress") TASK_PROGRESS,
    @SerialName("task:completed") TASK_COMPLETED,
    @SerialName("task:failed") TASK_FAILED,
    @SerialName("worker:update") WORKER_UPDATE,
    @SerialName("session:update") SESSION_UPDATE,
    @SerialName("error") ERROR,
    @SerialName("pong") PONG
}

/**
 * WebSocket message structure
 */
@Serializable
data class OctogentMessage(
    val type: MessageType,
    val data: JsonElement? = null,
    val timestamp: String
)

/**
 * Sealed class for Octogent events
 */
sealed class OctogentEvent {
    data class TaskCreated(val task: OctogentTask) : OctogentEvent()
    data class TaskStarted(val task: OctogentTask) : OctogentEvent()
    data class TaskProgress(val task: OctogentTask, val progress: Int) : OctogentEvent()
    data class TaskCompleted(val task: OctogentTask) : OctogentEvent()
    data class TaskFailed(val task: OctogentTask, val error: String) : OctogentEvent()
    data class WorkerUpdated(val worker: WorkerStatus) : OctogentEvent()
    data class SessionUpdated(val session: OctogentSession) : OctogentEvent()
    data class Connected(val session: OctogentSession) : OctogentEvent()
    data class Disconnected(val reason: String?) : OctogentEvent()
    data class Error(val message: String) : OctogentEvent()
}

/**
 * Result wrapper for API calls
 */
sealed class OctogentResult<out T> {
    data class Success<T>(val data: T) : OctogentResult<T>()
    data class Failure(val error: OctogentException) : OctogentResult<Nothing>()
}

/**
 * Custom exception for Octogent errors
 */
class OctogentException(
    message: String,
    val code: Int? = null,
    cause: Throwable? = null
) : Exception(message, cause)

/**
 * Main Octogent client for Android
 */
class OctogentClient(
    private val config: OctogentConfig = OctogentConfig()
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
    }
    
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(config.timeout, TimeUnit.SECONDS)
        .readTimeout(config.timeout, TimeUnit.SECONDS)
        .writeTimeout(config.timeout, TimeUnit.SECONDS)
        .build()
    
    private var webSocket: WebSocket? = null
    private val _events = MutableSharedFlow<OctogentEvent>(replay = 0, extraBufferCapacity = 100)
    
    /**
     * Flow of events from the Octogent server
     */
    val events: SharedFlow<OctogentEvent> = _events.asSharedFlow()
    
    private val _connectionState = MutableStateFlow(false)
    
    /**
     * Connection state flow
     */
    val isConnected: StateFlow<Boolean> = _connectionState.asStateFlow()
    
    private var reconnectJob: Job? = null
    private var pingJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    /**
     * Connect to the Octogent server via WebSocket
     */
    fun connect() {
        if (_connectionState.value) return
        
        val request = Request.Builder()
            .url(config.websocketUrl)
            .apply {
                config.apiKey?.let { addHeader("Authorization", "Bearer $it") }
            }
            .build()
        
        webSocket = httpClient.newWebSocket(request, createWebSocketListener())
    }
    
    /**
     * Disconnect from the Octogent server
     */
    fun disconnect() {
        pingJob?.cancel()
        reconnectJob?.cancel()
        webSocket?.close(1000, "Client disconnecting")
        webSocket = null
        _connectionState.value = false
    }
    
    /**
     * Clean up resources
     */
    fun destroy() {
        disconnect()
        scope.cancel()
    }
    
    private fun createWebSocketListener() = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            _connectionState.value = true
            startPingTimer()
        }
        
        override fun onMessage(webSocket: WebSocket, text: String) {
            try {
                val message = json.decodeFromString<OctogentMessage>(text)
                handleMessage(message)
            } catch (e: Exception) {
                scope.launch { _events.emit(OctogentEvent.Error("Failed to parse message: ${e.message}")) }
            }
        }
        
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(1000, null)
        }
        
        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            _connectionState.value = false
            pingJob?.cancel()
            scope.launch { _events.emit(OctogentEvent.Disconnected(reason)) }
            
            if (code != 1000) {
                scheduleReconnect()
            }
        }
        
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            _connectionState.value = false
            pingJob?.cancel()
            scope.launch { _events.emit(OctogentEvent.Error(t.message ?: "Connection failed")) }
            scheduleReconnect()
        }
    }
    
    private fun handleMessage(message: OctogentMessage) {
        scope.launch {
            when (message.type) {
                MessageType.TASK_CREATED -> {
                    message.data?.let {
                        val task = json.decodeFromJsonElement<OctogentTask>(it)
                        _events.emit(OctogentEvent.TaskCreated(task))
                    }
                }
                MessageType.TASK_STARTED -> {
                    message.data?.let {
                        val task = json.decodeFromJsonElement<OctogentTask>(it)
                        _events.emit(OctogentEvent.TaskStarted(task))
                    }
                }
                MessageType.TASK_COMPLETED -> {
                    message.data?.let {
                        val task = json.decodeFromJsonElement<OctogentTask>(it)
                        _events.emit(OctogentEvent.TaskCompleted(task))
                    }
                }
                MessageType.TASK_FAILED -> {
                    message.data?.let {
                        val task = json.decodeFromJsonElement<OctogentTask>(it)
                        _events.emit(OctogentEvent.TaskFailed(task, task.error ?: "Unknown error"))
                    }
                }
                MessageType.WORKER_UPDATE -> {
                    message.data?.let {
                        val worker = json.decodeFromJsonElement<WorkerStatus>(it)
                        _events.emit(OctogentEvent.WorkerUpdated(worker))
                    }
                }
                MessageType.PONG -> { /* Ignore pong responses */ }
                else -> { /* Handle other message types */ }
            }
        }
    }
    
    private fun startPingTimer() {
        pingJob?.cancel()
        pingJob = scope.launch {
            while (isActive) {
                delay(30_000)
                webSocket?.send("""{"type":"ping"}""")
            }
        }
    }
    
    private fun scheduleReconnect() {
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(5_000)
            connect()
        }
    }
    
    // ==================== API Methods ====================
    
    /**
     * Create a new session
     */
    suspend fun createSession(name: String): OctogentResult<OctogentSession> {
        return executeRequest {
            val body = json.encodeToString(mapOf("name" to name))
                .toRequestBody("application/json".toMediaType())
            
            val request = Request.Builder()
                .url("${config.baseUrl}/api/sessions")
                .post(body)
                .applyAuth()
                .build()
            
            val response = httpClient.newCall(request).execute()
            parseResponse(response)
        }
    }
    
    /**
     * Submit a new task
     */
    suspend fun submitTask(
        sessionId: String,
        goal: String,
        skill: String? = null,
        priority: TaskPriority = TaskPriority.NORMAL
    ): OctogentResult<OctogentTask> {
        return executeRequest {
            val payload = buildMap {
                put("sessionId", sessionId)
                put("goal", goal)
                put("priority", priority.value)
                skill?.let { put("skill", it) }
            }
            
            val body = json.encodeToString(payload)
                .toRequestBody("application/json".toMediaType())
            
            val request = Request.Builder()
                .url("${config.baseUrl}/api/tasks")
                .post(body)
                .applyAuth()
                .build()
            
            val response = httpClient.newCall(request).execute()
            parseResponse(response)
        }
    }
    
    /**
     * Get task by ID
     */
    suspend fun getTask(id: String): OctogentResult<OctogentTask> {
        return executeRequest {
            val request = Request.Builder()
                .url("${config.baseUrl}/api/tasks/$id")
                .get()
                .applyAuth()
                .build()
            
            val response = httpClient.newCall(request).execute()
            parseResponse(response)
        }
    }
    
    /**
     * Cancel a task
     */
    suspend fun cancelTask(id: String): OctogentResult<Unit> {
        return executeRequest {
            val request = Request.Builder()
                .url("${config.baseUrl}/api/tasks/$id/cancel")
                .post("".toRequestBody())
                .applyAuth()
                .build()
            
            val response = httpClient.newCall(request).execute()
            if (response.isSuccessful) Unit
            else throw OctogentException("Failed to cancel task", response.code)
        }
    }
    
    /**
     * Get all workers
     */
    suspend fun getWorkers(): OctogentResult<List<WorkerStatus>> {
        return executeRequest {
            val request = Request.Builder()
                .url("${config.baseUrl}/api/workers")
                .get()
                .applyAuth()
                .build()
            
            val response = httpClient.newCall(request).execute()
            parseResponse(response)
        }
    }
    
    /**
     * Get available skills
     */
    suspend fun getSkills(): OctogentResult<List<String>> {
        return executeRequest {
            val request = Request.Builder()
                .url("${config.baseUrl}/api/skills")
                .get()
                .applyAuth()
                .build()
            
            val response = httpClient.newCall(request).execute()
            val result: Map<String, List<String>> = parseResponse(response)
            result["skills"] ?: emptyList()
        }
    }
    
    /**
     * Save to memory
     */
    suspend fun saveMemory(key: String, value: String, namespace: String = "default"): OctogentResult<Unit> {
        return executeRequest {
            val payload = mapOf(
                "key" to key,
                "value" to value,
                "namespace" to namespace
            )
            
            val body = json.encodeToString(payload)
                .toRequestBody("application/json".toMediaType())
            
            val request = Request.Builder()
                .url("${config.baseUrl}/api/memory")
                .post(body)
                .applyAuth()
                .build()
            
            val response = httpClient.newCall(request).execute()
            if (response.isSuccessful) Unit
            else throw OctogentException("Failed to save memory", response.code)
        }
    }
    
    /**
     * Read from memory
     */
    suspend fun readMemory(key: String, namespace: String = "default"): OctogentResult<String?> {
        return executeRequest {
            val request = Request.Builder()
                .url("${config.baseUrl}/api/memory?key=$key&namespace=$namespace")
                .get()
                .applyAuth()
                .build()
            
            val response = httpClient.newCall(request).execute()
            
            if (response.code == 404) {
                null
            } else {
                val result: Map<String, String> = parseResponse(response)
                result["value"]
            }
        }
    }
    
    // ==================== Helper Methods ====================
    
    private fun Request.Builder.applyAuth(): Request.Builder {
        config.apiKey?.let { addHeader("Authorization", "Bearer $it") }
        return this
    }
    
    private suspend inline fun <reified T> executeRequest(
        crossinline block: suspend () -> T
    ): OctogentResult<T> {
        return withContext(Dispatchers.IO) {
            try {
                OctogentResult.Success(block())
            } catch (e: OctogentException) {
                OctogentResult.Failure(e)
            } catch (e: Exception) {
                OctogentResult.Failure(OctogentException(e.message ?: "Unknown error", cause = e))
            }
        }
    }
    
    private inline fun <reified T> parseResponse(response: Response): T {
        if (!response.isSuccessful) {
            throw OctogentException("Request failed", response.code)
        }
        
        val body = response.body?.string()
            ?: throw OctogentException("Empty response body")
        
        return json.decodeFromString(body)
    }
}
