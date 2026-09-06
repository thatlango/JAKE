package org.tukutuku.jakeos.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface JakeApi {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): AuthEnvelope

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): AuthEnvelope

    @GET("home")
    suspend fun home(): HomeResponse

    @GET("work/today")
    suspend fun today(@Query("limit") limit: Int = 7): TodayResponse

    @GET("work/projects")
    suspend fun projects(): ProjectListResponse

    @GET("work/projects/{id}")
    suspend fun project(@Path("id") id: String): ProjectDetailResponse

    @POST("work/tasks")
    suspend fun createTask(@Body body: TaskCreateRequest): TaskEnvelope

    @POST("work/tasks/{id}/complete")
    suspend fun completeTask(@Path("id") id: String): TaskEnvelope

    @GET("estate")
    suspend fun estate(@Query("refresh") refresh: Int? = null): EstateResponse

    @GET("estate/{code}")
    suspend fun estateProduct(@Path("code") code: String, @Query("refresh") refresh: Int? = null): ProductResponse

    @GET("watch")
    suspend fun watch(): WatchResponse

    @POST("ai/command")
    suspend fun ai(@Body body: AiRequest): AiResponse
}
