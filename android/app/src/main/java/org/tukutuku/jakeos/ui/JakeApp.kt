package org.tukutuku.jakeos.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.MonitorHeart
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import java.text.NumberFormat
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.tukutuku.jakeos.data.AiHistory
import org.tukutuku.jakeos.data.AttentionCard
import org.tukutuku.jakeos.data.EstateProduct
import org.tukutuku.jakeos.data.HomeResponse
import org.tukutuku.jakeos.data.JakeRepository
import org.tukutuku.jakeos.data.Loaded
import org.tukutuku.jakeos.data.ProductResponse
import org.tukutuku.jakeos.data.ProjectListResponse
import org.tukutuku.jakeos.data.TodayResponse
import org.tukutuku.jakeos.data.WatchResponse
import org.tukutuku.jakeos.data.WorkItem

private val Kampala = ZoneId.of("Africa/Kampala")
private val TimeFormat = DateTimeFormatter.ofPattern("HH:mm")
private val DateFormat = DateTimeFormatter.ofPattern("EEE, d MMM")

data class ChatMessage(val role: String, val content: String)

class JakeViewModel(private val repo: JakeRepository) : ViewModel() {
    private val _signedIn = MutableStateFlow(repo.session.isSignedIn())
    val signedIn = _signedIn.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy = _busy.asStateFlow()
    private val _message = MutableStateFlow<String?>(null)
    val message = _message.asStateFlow()
    private val _home = MutableStateFlow<Loaded<HomeResponse>?>(null)
    val home = _home.asStateFlow()
    private val _today = MutableStateFlow<Loaded<TodayResponse>?>(null)
    val today = _today.asStateFlow()
    private val _projects = MutableStateFlow<Loaded<ProjectListResponse>?>(null)
    val projects = _projects.asStateFlow()
    private val _estate = MutableStateFlow<Loaded<org.tukutuku.jakeos.data.EstateResponse>?>(null)
    val estate = _estate.asStateFlow()
    private val _product = MutableStateFlow<Loaded<ProductResponse>?>(null)
    val product = _product.asStateFlow()
    private val _watch = MutableStateFlow<Loaded<WatchResponse>?>(null)
    val watch = _watch.asStateFlow()
    private val _chat = MutableStateFlow<List<ChatMessage>>(emptyList())
    val chat = _chat.asStateFlow()

    init { if (_signedIn.value) refreshAll() }

    fun login(email: String, password: String) = viewModelScope.launch {
        _busy.value = true
        runCatching { repo.login(email, password) }
            .onSuccess { _signedIn.value = true; _message.value = null; refreshAll() }
            .onFailure { _message.value = it.message ?: "Sign-in failed" }
        _busy.value = false
    }

    fun logout() {
        repo.logout()
        _signedIn.value = false
        _home.value = null; _today.value = null; _projects.value = null; _estate.value = null; _watch.value = null
    }

    fun refreshAll() = viewModelScope.launch {
        _home.value = repo.home()
        _today.value = repo.today()
        _projects.value = repo.projects()
        _estate.value = repo.estate()
        _watch.value = repo.watch()
    }
    fun refreshHome() = viewModelScope.launch { _home.value = repo.home() }
    fun refreshWork() = viewModelScope.launch { _today.value = repo.today(); _projects.value = repo.projects() }
    fun refreshEstate(force: Boolean = false) = viewModelScope.launch { _estate.value = repo.estate(force) }
    fun refreshWatch() = viewModelScope.launch { _watch.value = repo.watch() }
    fun loadProduct(code: String, force: Boolean = false) = viewModelScope.launch { _product.value = repo.product(code, force) }

    fun complete(task: WorkItem) = viewModelScope.launch {
        runCatching { repo.completeTask(task.id) }
            .onSuccess { refreshWork(); refreshHome() }
            .onFailure { _message.value = it.message ?: "Task could not be completed" }
    }

    fun askJake(text: String) = viewModelScope.launch {
        val clean = text.trim(); if (clean.isEmpty()) return@launch
        val existing = _chat.value
        _chat.value = existing + ChatMessage("user", clean)
        _busy.value = true
        runCatching {
            repo.askJake(clean, existing.takeLast(8).map { AiHistory(it.role, it.content) })
        }.onSuccess { reply ->
            _chat.value = _chat.value + ChatMessage("assistant", reply.reply)
            if (reply.actions.any { it.status == "executed" }) { refreshWork(); refreshHome() }
        }.onFailure {
            _chat.value = _chat.value + ChatMessage("assistant", "Jake AI is unavailable right now: ${it.message ?: "unknown error"}")
        }
        _busy.value = false
    }
}

@Suppress("UNCHECKED_CAST")
private fun factory(repo: JakeRepository) = object : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T = JakeViewModel(repo) as T
}

private data class NavItem(val route: String, val label: String, val icon: ImageVector)
private val navItems = listOf(
    NavItem("home", "Home", Icons.Outlined.Home),
    NavItem("work", "Work", Icons.Outlined.Checklist),
    NavItem("estate", "Estate", Icons.Outlined.Apps),
    NavItem("watch", "Watch", Icons.Outlined.MonitorHeart)
)

@Composable
fun JakeApp(repo: JakeRepository) {
    val vm: JakeViewModel = viewModel(factory = factory(repo))
    val signedIn by vm.signedIn.collectAsState()
    val busy by vm.busy.collectAsState()
    val message by vm.message.collectAsState()
    if (!signedIn) {
        LoginScreen(busy, message, vm::login)
        return
    }

    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route.orEmpty()
    val showBottom = route in navItems.map { it.route }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = JakeCanvas,
        bottomBar = { if (showBottom) BottomNav(nav) },
        floatingActionButton = {
            if (showBottom) ExtendedFloatingActionButton(
                onClick = { nav.navigate("ai") },
                icon = { Icon(Icons.Outlined.AutoAwesome, null) },
                text = { Text("Jake") },
                containerColor = JakePurple,
                contentColor = Color.White
            )
        }
    ) { padding ->
        NavHost(navController = nav, startDestination = "home", modifier = Modifier.padding(padding)) {
            composable("home") { HomeScreen(vm, onLogout = vm::logout) }
            composable("work") { WorkScreen(vm) }
            composable("estate") { EstateScreen(vm) { nav.navigate("estate/${it}") } }
            composable("estate/{code}") { back -> ProductScreen(vm, nav, back.arguments?.getString("code").orEmpty()) }
            composable("watch") { WatchScreen(vm) }
            composable("ai") { AiScreen(vm, nav, busy) }
        }
    }
}

@Composable
private fun BottomNav(nav: NavHostController) {
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    NavigationBar(containerColor = Color.White, modifier = Modifier.navigationBarsPadding()) {
        navItems.forEach { item ->
            NavigationBarItem(
                selected = route == item.route,
                onClick = { nav.navigate(item.route) { launchSingleTop = true; restoreState = true; popUpTo("home") { saveState = true } } },
                icon = { Icon(item.icon, item.label) },
                label = { Text(item.label) }
            )
        }
    }
}

@Composable
private fun LoginScreen(busy: Boolean, error: String?, onLogin: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize().background(JakeCanvas).statusBarsPadding().padding(28.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Surface(shape = CircleShape, color = JakeLavender, modifier = Modifier.size(54.dp)) {
            Box(contentAlignment = Alignment.Center) { Text("J", color = JakePurple, fontWeight = FontWeight.Bold) }
        }
        Spacer(Modifier.height(22.dp))
        Text("JakeOS", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Text("Your pocket command centre", color = JakeMuted, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(28.dp))
        OutlinedTextField(email, { email = it }, label = { Text("Tuku email") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        error?.let { Spacer(Modifier.height(10.dp)); Text(it, color = JakeRed, style = MaterialTheme.typography.bodySmall) }
        Spacer(Modifier.height(18.dp))
        Button(onClick = { onLogin(email, password) }, enabled = email.isNotBlank() && password.isNotBlank() && !busy, modifier = Modifier.fillMaxWidth()) {
            if (busy) CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp) else Text("Continue with Tuku Auth")
        }
    }
}

@Composable
private fun HomeScreen(vm: JakeViewModel, onLogout: () -> Unit) {
    val loaded by vm.home.collectAsState()
    val home = loaded?.data
    LaunchedEffect(Unit) { if (loaded == null) vm.refreshHome() }
    ScreenShell("Command centre", loaded?.stale == true, vm::refreshHome, onLogout) {
        if (home == null) item { LoadingOrError(loaded?.error) } else {
            item {
                Text(greeting(), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text(nowLabel(), color = JakeMuted)
            }
            item { CommandSummaryCard(home) }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(vertical = 2.dp)) {
                    items(home.kpis) { KpiCard(it.label, it.value, it.unit, it.status) }
                }
            }
            if (home.attention.isNotEmpty()) {
                item { SectionTitle("Needs attention") }
                items(home.attention.take(5)) { AttentionCardUi(it) }
            }
            home.nextCommitment?.let { commitment ->
                item { SectionTitle("Next commitment") }
                item {
                    InfoCard(
                        title = commitment.title,
                        metric = commitment.startsAt?.let { formatTime(it) }.orEmpty(),
                        detail = commitment.project ?: "Calendar"
                    )
                }
            }
            if (home.nextWork.isNotEmpty()) {
                item { SectionTitle("What to work on next") }
                items(home.nextWork.take(4)) { WorkCard(it) { vm.complete(it) } }
            }
        }
    }
}

@Composable
private fun WorkScreen(vm: JakeViewModel) {
    val todayLoaded by vm.today.collectAsState()
    val projectsLoaded by vm.projects.collectAsState()
    val today = todayLoaded?.data
    val projects = projectsLoaded?.data?.projects.orEmpty()
    LaunchedEffect(Unit) { if (todayLoaded == null) vm.refreshWork() }
    ScreenShell("Work", todayLoaded?.stale == true || projectsLoaded?.stale == true, vm::refreshWork) {
        if (today == null) item { LoadingOrError(todayLoaded?.error) } else {
            item {
                Text("Today", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("JakeOS-ranked work, not a generic task list.", color = JakeMuted)
            }
            today.nextCommitment?.let { event ->
                item {
                    InfoCard("Next commitment", formatTime(event.startsAt), event.title)
                }
            }
            items(today.tasks) { WorkCard(it) { vm.complete(it) } }
            if (projects.isNotEmpty()) {
                item { SectionTitle("Projects") }
                items(projects.take(12)) { project ->
                    InfoCard(
                        "${project.emoji.orEmpty()} ${project.name}".trim(),
                        "${project.progress}%",
                        "${project.openTasks} open · ${project.doingTasks} doing · ${project.blockedTasks} blocked"
                    )
                }
            }
        }
    }
}

@Composable
private fun EstateScreen(vm: JakeViewModel, onProduct: (String) -> Unit) {
    val loaded by vm.estate.collectAsState()
    val estate = loaded?.data
    LaunchedEffect(Unit) { if (loaded == null) vm.refreshEstate() }
    ScreenShell("Tuku Estate", loaded?.stale == true || estate?.stale == true, { vm.refreshEstate(true) }) {
        val snapshot = estate?.snapshot
        if (snapshot == null) item { LoadingOrError(loaded?.error ?: estate?.error) } else {
            item {
                Text("Estate", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("Usage, growth, orders and earnings across Tuku.", color = JakeMuted)
            }
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    item { KpiCard("Products", snapshot.totals.products.toDouble(), "tools", null) }
                    item { KpiCard("Active users", snapshot.totals.activeUsers7d.toDouble(), "7d", null) }
                    item { KpiCard("Live orders", snapshot.totals.ordersActive.toDouble(), "orders", null) }
                    item { KpiCard("Revenue", snapshot.totals.realizedRevenueUGX, "UGX", null) }
                }
            }
            item { SectionTitle("Products") }
            items(snapshot.products) { product -> ProductCard(product) { onProduct(product.code) } }
        }
    }
}

@Composable
private fun ProductScreen(vm: JakeViewModel, nav: NavHostController, code: String) {
    val loaded by vm.product.collectAsState()
    LaunchedEffect(code) { vm.loadProduct(code) }
    val detail = loaded?.data?.detail
    Column(Modifier.fillMaxSize().background(JakeCanvas).statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.Outlined.ArrowBack, "Back") }
            Text(detail?.product?.name ?: code, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            IconButton(onClick = { vm.loadProduct(code, true) }) { Icon(Icons.Outlined.Refresh, "Refresh") }
        }
        LazyColumn(contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (detail == null) item { LoadingOrError(loaded?.error ?: loaded?.data?.error) } else {
                item { InfoCard("Active users", "${detail.product.activeUsers7d} / 7d", "${signed(detail.product.growth7dPercent)} growth · ${detail.product.newUsers7d} new") }
                item { InfoCard("Telemetry", detail.telemetry?.coverage ?: "Unobserved", detail.telemetry?.message ?: "No telemetry note") }
                if (detail.commerce.isNotEmpty()) {
                    item { SectionTitle("Orders & earnings") }
                    items(detail.commerce) { commerce ->
                        InfoCard(commerce.currency, "${commerce.orders.active} live · ${commerce.orders.completed} fulfilled", "${money(commerce.earnings.realized)} realized · ${money(commerce.earnings.pending)} pending")
                    }
                }
                if (detail.operations.eventTypes.isNotEmpty()) {
                    item { SectionTitle("Product activity") }
                    items(detail.operations.eventTypes.take(12)) { event ->
                        InfoCard(event.eventName.replace('_', ' '), "${event.events30d} events / 30d", "${event.users30d} users")
                    }
                }
            }
        }
    }
}

@Composable
private fun WatchScreen(vm: JakeViewModel) {
    val loaded by vm.watch.collectAsState()
    val watch = loaded?.data
    LaunchedEffect(Unit) { if (loaded == null) vm.refreshWatch() }
    ScreenShell("Watch", loaded?.stale == true, vm::refreshWatch) {
        if (watch == null) item { LoadingOrError(loaded?.error) } else {
            item {
                Text("Operations", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text("Infrastructure, services, domains and renewals.", color = JakeMuted)
            }
            item { HealthCard(watch) }
            if (watch.attention.isNotEmpty()) {
                item { SectionTitle("Infrastructure alerts") }
                items(watch.attention.take(8)) { signal ->
                    InfoCard(signal.title, signal.severity.uppercase(), signal.summary.orEmpty(), statusColor(signal.severity))
                }
            }
            item { SectionTitle("VPS") }
            items(watch.hosts) { host ->
                InfoCard(host.label ?: host.id, "Disk ${percent(host.diskPercent)} · RAM ${percent(host.memoryPercent)}", "CPU ${percent(host.cpuPercent)} · ${host.status ?: "unknown"}")
            }
            item { SectionTitle("Services") }
            items(watch.services.take(24)) { service ->
                val healthy = service.consecutiveFailures == 0 && (service.lastStatus ?: 0) in 200..499
                InfoCard(service.name, if (healthy) "Healthy" else "Needs attention", "HTTP ${service.lastStatus ?: 0} · ${service.lastLatencyMs ?: 0} ms", if (healthy) JakeGreen else JakeRed)
            }
            if (watch.subscriptions.isNotEmpty()) {
                item { SectionTitle("Subscriptions & renewals") }
                items(watch.subscriptions) { sub ->
                    InfoCard(sub.name, sub.planName ?: sub.provider.orEmpty(), renewalLabel(sub.expiresAt ?: sub.nextRenewalAt))
                }
            }
        }
    }
}

@Composable
private fun AiScreen(vm: JakeViewModel, nav: NavHostController, busy: Boolean) {
    val chat by vm.chat.collectAsState()
    var input by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().background(JakeCanvas).statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.Outlined.ArrowBack, "Back") }
            Column(Modifier.weight(1f)) {
                Text("Jake AI", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("Private estate intelligence", color = JakeMuted, style = MaterialTheme.typography.bodySmall)
            }
        }
        LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (chat.isEmpty()) item {
                InfoCard("Ask Jake", "What needs my attention?", "Try: How is the estate doing today? · What should I work on next? · Are any services or renewals at risk?")
            }
            items(chat) { msg ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = if (msg.role == "user") Arrangement.End else Arrangement.Start) {
                    Surface(shape = RoundedCornerShape(18.dp), color = if (msg.role == "user") JakePurple else Color.White) {
                        Text(msg.content, modifier = Modifier.padding(14.dp), color = if (msg.role == "user") Color.White else JakeNavy, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            if (busy) item { CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp) }
        }
        Row(Modifier.fillMaxWidth().background(Color.White).navigationBarsPadding().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(input, { input = it }, placeholder = { Text("Ask Jake…") }, modifier = Modifier.weight(1f), maxLines = 4)
            Spacer(Modifier.width(8.dp))
            IconButton(onClick = { val text = input; input = ""; vm.askJake(text) }, enabled = input.isNotBlank() && !busy) { Icon(Icons.Outlined.Send, "Send", tint = JakePurple) }
        }
    }
}

@Composable
private fun ScreenShell(
    title: String,
    stale: Boolean,
    onRefresh: () -> Unit,
    onLogout: (() -> Unit)? = null,
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit
) {
    Column(Modifier.fillMaxSize().background(JakeCanvas).statusBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            if (stale) StatusPill("Cached", JakeAmber)
            IconButton(onClick = onRefresh) { Icon(Icons.Outlined.Refresh, "Refresh") }
            if (onLogout != null) IconButton(onClick = onLogout) { Icon(Icons.Outlined.Logout, "Sign out") }
        }
        LazyColumn(modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
private fun CommandSummaryCard(home: HomeResponse) {
    val color = statusColor(home.commandSummary.severity)
    Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            StatusPill(home.commandSummary.severity.uppercase(), color)
            Text(home.commandSummary.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            if (home.commandSummary.detail.isNotBlank()) Text(home.commandSummary.detail, color = JakeMuted)
        }
    }
}

@Composable
private fun KpiCard(label: String, value: Double?, unit: String?, status: String?) {
    Card(modifier = Modifier.width(154.dp), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(16.dp)) {
            Text(label, color = JakeMuted, style = MaterialTheme.typography.labelMedium)
            Spacer(Modifier.height(8.dp))
            Text(kpiValue(value, unit), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            if (!status.isNullOrBlank() && status !in listOf("available", "health")) Text(status, color = statusColor(status), style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun AttentionCardUi(card: AttentionCard) {
    InfoCard(card.title, card.severity.uppercase(), card.summary.orEmpty(), statusColor(card.severity))
}

@Composable
private fun WorkCard(task: WorkItem, onComplete: () -> Unit) {
    Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StatusPill(task.priority.uppercase(), statusColor(task.priority))
                    task.projectName?.let { Spacer(Modifier.width(8.dp)); Text(it, color = JakeMuted, style = MaterialTheme.typography.labelMedium) }
                }
                Spacer(Modifier.height(8.dp))
                Text(task.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                task.whyNow?.let { Text(it, color = JakeMuted, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                Text("${task.estimatedMinutes} min${task.dueAt?.let { " · due ${shortDate(it)}" }.orEmpty()}", color = JakeMuted, style = MaterialTheme.typography.labelSmall)
            }
            IconButton(onClick = onComplete) { Icon(Icons.Outlined.CheckCircle, "Complete", tint = JakeGreen) }
        }
    }
}

@Composable
private fun ProductCard(product: EstateProduct, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(product.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text("${product.activeUsers7d} active / 7d · ${product.newUsers7d} new", color = JakeMuted)
            }
            Text(signed(product.growth7dPercent), color = if (product.growth7dPercent >= 0) JakeGreen else JakeRed, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun HealthCard(watch: WatchResponse) {
    val color = statusColor(watch.status)
    Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${watch.score}%", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = color)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Infrastructure health", fontWeight = FontWeight.SemiBold)
                    Text("${watch.summary.servicesHealthy}/${watch.summary.servicesTotal} services healthy", color = JakeMuted)
                }
            }
            Spacer(Modifier.height(12.dp))
            HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = .45f))
            Spacer(Modifier.height(12.dp))
            Text("${watch.summary.domainsAttention} domains need attention · ${watch.summary.criticalSignals} critical signals", color = JakeMuted)
        }
    }
}

@Composable
private fun InfoCard(title: String, metric: String, detail: String, metricColor: Color = JakePurple) {
    Card(shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            if (metric.isNotBlank()) Text(metric, color = metricColor, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            if (detail.isNotBlank()) Text(detail, color = JakeMuted, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 6.dp))
}

@Composable
private fun StatusPill(text: String, color: Color) {
    Surface(shape = RoundedCornerShape(99.dp), color = color.copy(alpha = .12f)) {
        Text(text, color = color, modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun LoadingOrError(error: String?) {
    if (error.isNullOrBlank()) Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
    else InfoCard("JakeOS could not load this view", "Unavailable", error, JakeRed)
}

private fun statusColor(value: String?): Color = when (value?.lowercase()) {
    "healthy", "low", "available", "high" -> if (value?.lowercase() == "high") JakeAmber else JakeGreen
    "attention", "medium", "stale" -> JakeAmber
    "critical", "error", "unavailable" -> JakeRed
    else -> JakePurple
}

private fun greeting(): String {
    val hour = java.time.ZonedDateTime.now(Kampala).hour
    return when (hour) { in 5..11 -> "Good morning"; in 12..16 -> "Good afternoon"; else -> "Good evening" }
}
private fun nowLabel() = java.time.ZonedDateTime.now(Kampala).format(DateFormat)
private fun signed(value: Double) = if (value > 0) "+${String.format("%.1f", value)}%" else "${String.format("%.1f", value)}%"
private fun percent(value: Double?) = value?.let { "${String.format("%.0f", it)}%" } ?: "—"
private fun money(value: Double) = NumberFormat.getNumberInstance().format(value)
private fun shortDate(value: String) = value.take(10)
private fun formatTime(value: String?): String {
    if (value.isNullOrBlank()) return ""
    return runCatching { OffsetDateTime.parse(value).atZoneSameInstant(Kampala).format(TimeFormat) }
        .recoverCatching { Instant.parse(value).atZone(Kampala).format(TimeFormat) }.getOrDefault(value.take(5))
}
private fun renewalLabel(value: String?): String {
    if (value.isNullOrBlank()) return "Renewal date not confirmed"
    val instant = runCatching { Instant.parse(value) }.getOrNull() ?: runCatching { OffsetDateTime.parse(value).toInstant() }.getOrNull()
    if (instant == null) return value.take(10)
    val days = java.time.Duration.between(Instant.now(), instant).toDays()
    return when { days < 0 -> "Expired ${-days}d ago"; days == 0L -> "Due today"; else -> "Due in ${days}d" }
}
private fun kpiValue(value: Double?, unit: String?): String {
    if (value == null) return "—"
    return when (unit) {
        "UGX" -> if (value >= 1_000_000) "UGX ${String.format("%.1f", value / 1_000_000)}m" else "UGX ${money(value)}"
        "health" -> "${String.format("%.0f", value)}%"
        else -> if (value % 1.0 == 0.0) value.toLong().toString() else String.format("%.1f", value)
    }
}
