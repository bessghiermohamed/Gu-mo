package com.example.talib.data.supabase

import android.util.Log
import com.example.BuildConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.realtime
import io.github.jan.supabase.storage.Storage
import io.github.jan.supabase.storage.storage

object SupabaseClientProvider {
  private const val TAG = "SupabaseClientProvider"

  val client: SupabaseClient by lazy {
    val supabaseUrl = try {
      BuildConfig::class.java.getField("SUPABASE_URL").get(null) as? String ?: ""
    } catch (_: Exception) {
      ""
    }.ifEmpty { "https://ntdzvujhujnbazaqzuvo.supabase.co" }

    val supabaseKey = try {
      BuildConfig::class.java.getField("SUPABASE_ANON_KEY").get(null) as? String ?: ""
    } catch (_: Exception) {
      ""
    }.ifEmpty { "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50ZHp2dWpodWpuYmF6YXF6dXZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNTk0NzQsImV4cCI6MjEwMjgzNTQ3NH0.MD_tGI24lHf1RSrt6zhSru7E4VfmZP_VVASYDV8b-1Y" }

    createSupabaseClient(
      supabaseUrl = supabaseUrl,
      supabaseKey = supabaseKey
    ) {
      install(Postgrest)
      install(Auth)
      install(Storage)
      install(Realtime)
    }
  }

  val postgrest: Postgrest
    get() = client.postgrest

  val auth: Auth
    get() = client.auth

  val storage: Storage
    get() = client.storage

  val realtime: Realtime
    get() = client.realtime
}
