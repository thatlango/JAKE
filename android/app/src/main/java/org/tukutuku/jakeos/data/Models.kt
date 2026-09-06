package org.tukutuku.jakeos.data

import com.squareup.moshi.Json

data class AuthEnvelope(
    val data: AuthPayload? = null,
    val session: AuthSession? = null,
    val user: TukuUser? = null,
    val error: ApiError? = null,
    val message: String? = null
) {
    fun payload(): AuthPayload? = data ?: if (session != null && user != null) AuthPayload(session, user) else null
}

data class ApiError(val message: String? = null)
data class AuthPayload(val session: AuthSession, val user: TukuUser)
data class AuthSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long = 0,
    val expiresAt: Long? = null,
    val tokenType: String = "Bearer"
)
data class TukuUser(
    val coreUserId: String,
    val email: String? = null,
    val displayName: String? = null,
    val fullName: String? = null
)

data class LoginRequest(val email: String, val password: String)
data class RefreshRequest(val refreshToken: String)

data class HomeResponse(
    val generatedAt: String? = null,
    val commandSummary: CommandSummary = CommandSummary(),
    val kpis: List<Kpi> = emptyList(),
    val attention: List<AttentionCard> = emptyList(),
    val nextCommitment: CalendarCommitment? = null,
    val nextWork: List<WorkItem> = emptyList(),
    val work: WorkSummary = WorkSummary(),
    val estate: HomeEstate = HomeEstate(),
    val watch: WatchSummary = WatchSummary()
)

data class CommandSummary(
    val severity: String = "healthy",
    val title: String = "No urgent exceptions right now",
    val detail: String = "",
    val count: Int = 0
)

data class Kpi(
    val key: String,
    val label: String,
    val value: Double? = null,
    val unit: String? = null,
    val status: String? = null
)

data class AttentionCard(
    val id: String? = null,
    val severity: String = "medium",
    val title: String,
    val summary: String? = null,
    val source: String? = null,
    val sourceRef: String? = null,
    val dueAt: String? = null,
    val actionUrl: String? = null
)

data class CalendarCommitment(
    val id: String,
    val title: String,
    val project: String? = null,
    @Json(name = "starts_at") val startsAt: String? = null,
    @Json(name = "ends_at") val endsAt: String? = null,
    @Json(name = "all_day") val allDay: Boolean = false,
    val source: String? = null
)

data class WorkSummary(
    val open: Int = 0,
    val doing: Int = 0,
    val overdue: Int = 0,
    val blocked: Int = 0
)

data class WorkItem(
    val id: String,
    val title: String,
    val description: String? = null,
    val status: String = "inbox",
    val priority: String = "medium",
    @Json(name = "estimated_minutes") val estimatedMinutes: Int = 30,
    @Json(name = "due_at") val dueAt: String? = null,
    @Json(name = "scheduled_start") val scheduledStart: String? = null,
    @Json(name = "scheduled_end") val scheduledEnd: String? = null,
    val blocked: Boolean = false,
    @Json(name = "blocked_reason") val blockedReason: String? = null,
    @Json(name = "project_id") val projectId: String? = null,
    @Json(name = "project_name") val projectName: String? = null,
    @Json(name = "project_emoji") val projectEmoji: String? = null,
    @Json(name = "priority_score") val priorityScore: Double? = null,
    @Json(name = "why_now") val whyNow: String? = null
)

data class TodayResponse(
    val generatedAt: String? = null,
    val nextCommitment: CalendarCommitment? = null,
    val tasks: List<WorkItem> = emptyList()
)

data class ProjectListResponse(val projects: List<ProjectSummary> = emptyList())
data class ProjectSummary(
    val id: String,
    val name: String,
    val emoji: String? = null,
    val description: String? = null,
    val status: String? = null,
    val priority: String? = null,
    val progress: Int = 0,
    @Json(name = "open_tasks") val openTasks: Int = 0,
    @Json(name = "doing_tasks") val doingTasks: Int = 0,
    @Json(name = "blocked_tasks") val blockedTasks: Int = 0,
    @Json(name = "next_due_at") val nextDueAt: String? = null
)

data class ProjectDetailResponse(val project: ProjectSummary, val tasks: List<WorkItem> = emptyList())
data class TaskEnvelope(val task: WorkItem)
data class TaskCreateRequest(
    val title: String,
    val description: String = "",
    val priority: String = "medium",
    val estimatedMinutes: Int = 30,
    val dueAt: String? = null,
    val scheduledStart: String? = null,
    val scheduledEnd: String? = null,
    val projectName: String? = null,
    val tags: List<String> = emptyList()
)

data class HomeEstate(
    val available: Boolean = false,
    val stale: Boolean = false,
    val lastSuccessfulAt: String? = null,
    val error: String? = null,
    val totals: EstateTotals = EstateTotals(),
    val products: List<EstateProduct> = emptyList(),
    val commerce: List<CommerceProduct> = emptyList()
)

data class WatchSummary(
    val score: Int? = null,
    val status: String = "unavailable",
    val summary: WatchCounts = WatchCounts()
)

data class WatchCounts(
    val servicesTotal: Int = 0,
    val servicesHealthy: Int = 0,
    val domainsTotal: Int = 0,
    val domainsAttention: Int = 0,
    val criticalSignals: Int = 0,
    val highSignals: Int = 0
)

data class EstateResponse(
    val configured: Boolean = false,
    val available: Boolean = false,
    val stale: Boolean = false,
    val snapshot: EstateSnapshot? = null,
    val lastSuccessfulAt: String? = null,
    val error: String? = null
)

data class EstateSnapshot(
    val products: List<EstateProduct> = emptyList(),
    val commerce: List<CommerceProduct> = emptyList(),
    val telemetry: List<EstateTelemetry> = emptyList(),
    val totals: EstateTotals = EstateTotals(),
    val generatedAt: String? = null
)

data class EstateProduct(
    val code: String,
    val name: String,
    val activeUsers24h: Int = 0,
    val activeUsers7d: Int = 0,
    val activeUsers30d: Int = 0,
    val newUsers7d: Int = 0,
    val growth7dPercent: Double = 0.0,
    val usageEvents7d: Int = 0,
    val lastActivityAt: String? = null
)

data class EstateTotals(
    val products: Int = 0,
    val activeUsers24h: Int = 0,
    val activeUsers7d: Int = 0,
    val ordersActive: Int = 0,
    val ordersCompleted: Int = 0,
    val realizedRevenueUGX: Double = 0.0,
    val pendingRevenueUGX: Double = 0.0,
    val productsNeedingTelemetryReview: Int = 0
)

data class CommerceProduct(
    val productCode: String,
    val currency: String = "UGX",
    val orders: OrderMetrics = OrderMetrics(),
    val earnings: EarningsMetrics = EarningsMetrics()
)

data class OrderMetrics(val total: Int = 0, val active: Int = 0, val completed: Int = 0, val cancelled: Int = 0)
data class EarningsMetrics(val realized: Double = 0.0, val pending: Double = 0.0, val fulfilledGross: Double = 0.0)
data class EstateTelemetry(
    val productCode: String,
    val productName: String? = null,
    val coverage: String = "unobserved",
    val needsAttention: Boolean = false,
    val message: String? = null
)

data class ProductResponse(
    val configured: Boolean = false,
    val available: Boolean = false,
    val stale: Boolean = false,
    val detail: ProductDetail? = null,
    val lastSuccessfulAt: String? = null,
    val error: String? = null
)

data class ProductDetail(
    val product: EstateProduct,
    val commerce: List<CommerceProduct> = emptyList(),
    val telemetry: EstateTelemetry? = null,
    val operations: ProductOperations = ProductOperations(),
    val degraded: Boolean = false
)

data class ProductOperations(
    val eventTypes: List<ProductEventType> = emptyList(),
    val sourceTables: List<ProductSourceTable> = emptyList()
)
data class ProductEventType(val eventName: String, val events30d: Int = 0, val users30d: Int = 0, val lastObservedAt: String? = null)
data class ProductSourceTable(val sourceSystem: String, val sourceTable: String? = null, val records: Int = 0, val businesses: Int = 0, val lastObservedAt: String? = null)

data class WatchResponse(
    val generatedAt: String? = null,
    val score: Int = 0,
    val status: String = "unknown",
    val summary: WatchCounts = WatchCounts(),
    val hosts: List<HostStatus> = emptyList(),
    val services: List<ServiceStatus> = emptyList(),
    val domains: List<DomainStatus> = emptyList(),
    val attention: List<AttentionRaw> = emptyList(),
    val subscriptions: List<SubscriptionStatus> = emptyList()
)

data class HostStatus(
    val id: String,
    val label: String? = null,
    val status: String? = null,
    @Json(name = "cpu_percent") val cpuPercent: Double? = null,
    @Json(name = "memory_percent") val memoryPercent: Double? = null,
    @Json(name = "disk_percent") val diskPercent: Double? = null,
    @Json(name = "uptime_seconds") val uptimeSeconds: Long? = null,
    @Json(name = "captured_at") val capturedAt: String? = null
)

data class ServiceStatus(
    val id: String,
    val name: String,
    val product: String? = null,
    val url: String? = null,
    @Json(name = "last_status") val lastStatus: Int? = null,
    @Json(name = "last_latency_ms") val lastLatencyMs: Int? = null,
    @Json(name = "consecutive_failures") val consecutiveFailures: Int = 0,
    @Json(name = "last_checked_at") val lastCheckedAt: String? = null
)

data class DomainStatus(
    val host: String,
    @Json(name = "root_domain") val rootDomain: String? = null,
    val status: String? = null,
    @Json(name = "expires_at") val expiresAt: String? = null,
    @Json(name = "tls_expires_at") val tlsExpiresAt: String? = null,
    val registrar: String? = null
)

data class AttentionRaw(
    val id: String? = null,
    val severity: String = "medium",
    val title: String,
    val summary: String? = null,
    @Json(name = "due_at") val dueAt: String? = null
)

data class SubscriptionStatus(
    val id: String,
    val name: String,
    val provider: String? = null,
    @Json(name = "plan_name") val planName: String? = null,
    @Json(name = "billing_mode") val billingMode: String? = null,
    @Json(name = "billing_cycle") val billingCycle: String? = null,
    val amount: Double? = null,
    val currency: String? = null,
    @Json(name = "next_renewal_at") val nextRenewalAt: String? = null,
    @Json(name = "expires_at") val expiresAt: String? = null,
    @Json(name = "auto_renew") val autoRenew: Boolean? = null,
    @Json(name = "usage_current") val usageCurrent: Double? = null,
    @Json(name = "usage_limit") val usageLimit: Double? = null,
    @Json(name = "usage_unit") val usageUnit: String? = null
)

data class AiRequest(val message: String, val history: List<AiHistory> = emptyList())
data class AiHistory(val role: String, val content: String)
data class AiResponse(
    val reply: String,
    val model: String? = null,
    val provider: String? = null,
    val actions: List<AiActionResult> = emptyList()
)
data class AiActionResult(val type: String, val status: String, val task: WorkItem? = null, val error: String? = null)
