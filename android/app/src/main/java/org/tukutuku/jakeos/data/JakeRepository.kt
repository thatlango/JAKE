package org.tukutuku.jakeos.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.squareup.moshi.JsonAdapter
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import java.io.File
import java.util.concurrent.TimeUnit
import okhttp3.Authenticator
import okhttp3.Credentials
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import org.tukutuku.jakeos.BuildConfig
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

class SessionStore(context: Context) {
    private val masterKey = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
    private val prefs = EncryptedSharedPreferences.create(
        context,
        "jakeos_session",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    var accessToken: String?
        get() = prefs.getString("access_token", null)
        set(value) = prefs.edit().putString("access_token", value).apply()
    var refreshToken: String?
        get() = prefs.getString("refresh_token", null)
        set(value) = prefs.edit().putString("refresh_token", value).apply()
    var email: String?
        get() = prefs.getString("email", null)
        set(value) = prefs.edit().putString("email", value).apply()
    var displayName: String?
        get() = prefs.getString("display_name", null)
        set(value) = prefs.edit().putString("display_name", value).apply()

    fun save(payload: AuthPayload) {
        prefs.edit()
            .putString("access_token", payload.session.accessToken)
            .putString("refresh_token", payload.session.refreshToken)
            .putString("email", payload.user.email)
            .putString("display_name", payload.user.displayName ?: payload.user.fullName)
            .apply()
    }

    fun clear() = prefs.edit().clear().apply()
    fun isSignedIn() = !accessToken.isNullOrBlank() && !refreshToken.isNullOrBlank()
}

data class Loaded<T>(val data: T?, val stale: Boolean = false, val error: String? = null)

private class SnapshotCache(private val context: Context) {
    private val dir = File(context.filesDir, "jakeos-cache").apply { mkdirs() }
    fun <T> put(key: String, adapter: JsonAdapter<T>, value: T) {
        runCatching { File(dir, "$key.json").writeText(adapter.toJson(value)) }
    }
    fun <T> get(key: String, adapter: JsonAdapter<T>): T? = runCatching {
        val file = File(dir, "$key.json")
        if (!file.exists()) null else adapter.fromJson(file.readText())
    }.getOrNull()
    fun clear() = runCatching { dir.listFiles()?.forEach { it.delete() } }
}

class JakeRepository(context: Context) {
    val session = SessionStore(context)
    private val cache = SnapshotCache(context)
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val authAdapter = moshi.adapter(AuthEnvelope::class.java)
    private val mediaJson = "application/json; charset=utf-8".toMediaType()

    private val rawClient = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()

    private fun refreshSynchronously(): String? {
        val refresh = session.refreshToken ?: return null
        val body = moshi.adapter(RefreshRequest::class.java).toJson(RefreshRequest(refresh)).toRequestBody(mediaJson)
        val request = Request.Builder()
            .url(BuildConfig.JAKEOS_API_BASE_URL + "auth/refresh")
            .post(body)
            .header("Accept", "application/json")
            .build()
        return runCatching {
            rawClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use null
                val envelope = authAdapter.fromJson(response.body?.string().orEmpty())
                val payload = envelope?.payload() ?: return@use null
                session.save(payload)
                payload.session.accessToken
            }
        }.getOrNull()
    }

    private val authenticator = Authenticator { _: Route?, response ->
        if (responseCount(response) >= 2) return@Authenticator null
        val prior = response.request.header("Authorization")?.removePrefix("Bearer ")
        val current = session.accessToken
        if (!current.isNullOrBlank() && current != prior) {
            return@Authenticator response.request.newBuilder().header("Authorization", "Bearer $current").build()
        }
        val refreshed = refreshSynchronously() ?: return@Authenticator null
        response.request.newBuilder().header("Authorization", "Bearer $refreshed").build()
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val builder = chain.request().newBuilder().header("Accept", "application/json")
            session.accessToken?.takeIf { it.isNotBlank() }?.let { builder.header("Authorization", "Bearer $it") }
            chain.proceed(builder.build())
        }
        .authenticator(authenticator)
        .apply {
            if (BuildConfig.DEBUG) addInterceptor(HttpLoggingInterceptor().setLevel(HttpLoggingInterceptor.Level.BASIC))
        }
        .build()

    private val api = Retrofit.Builder()
        .baseUrl(BuildConfig.JAKEOS_API_BASE_URL)
        .client(client)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()
        .create(JakeApi::class.java)

    private val authApi = Retrofit.Builder()
        .baseUrl(BuildConfig.JAKEOS_API_BASE_URL)
        .client(rawClient)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()
        .create(JakeApi::class.java)

    suspend fun login(email: String, password: String): TukuUser {
        val payload = authApi.login(LoginRequest(email.trim(), password)).payload()
            ?: error("Tuku Auth did not return a JakeOS session")
        session.save(payload)
        return payload.user
    }

    fun logout() {
        session.clear()
        cache.clear()
    }

    suspend fun home(): Loaded<HomeResponse> = cached("home", moshi.adapter(HomeResponse::class.java)) { api.home() }
    suspend fun today(): Loaded<TodayResponse> = cached("today", moshi.adapter(TodayResponse::class.java)) { api.today() }
    suspend fun projects(): Loaded<ProjectListResponse> = cached("projects", moshi.adapter(ProjectListResponse::class.java)) { api.projects() }
    suspend fun estate(force: Boolean = false): Loaded<EstateResponse> = cached("estate", moshi.adapter(EstateResponse::class.java)) { api.estate(if (force) 1 else null) }
    suspend fun product(code: String, force: Boolean = false): Loaded<ProductResponse> = cached("product-${safeKey(code)}", moshi.adapter(ProductResponse::class.java)) { api.estateProduct(code, if (force) 1 else null) }
    suspend fun watch(): Loaded<WatchResponse> = cached("watch", moshi.adapter(WatchResponse::class.java)) { api.watch() }
    suspend fun completeTask(id: String) = api.completeTask(id).task
    suspend fun createTask(request: TaskCreateRequest) = api.createTask(request).task
    suspend fun askJake(message: String, history: List<AiHistory>) = api.ai(AiRequest(message, history))

    private suspend fun <T> cached(key: String, adapter: JsonAdapter<T>, fetch: suspend () -> T): Loaded<T> {
        return try {
            val value = fetch()
            cache.put(key, adapter, value)
            Loaded(value, stale = false)
        } catch (error: Throwable) {
            val fallback = cache.get(key, adapter)
            if (fallback != null) Loaded(fallback, stale = true, error = error.message)
            else Loaded(null, stale = false, error = error.message ?: "JakeOS is unavailable")
        }
    }

    private fun safeKey(value: String) = value.lowercase().replace(Regex("[^a-z0-9_-]"), "-").take(80)

    private fun responseCount(response: okhttp3.Response): Int {
        var current: okhttp3.Response? = response
        var count = 1
        while (current?.priorResponse != null) {
            count += 1
            current = current.priorResponse
        }
        return count
    }
}
