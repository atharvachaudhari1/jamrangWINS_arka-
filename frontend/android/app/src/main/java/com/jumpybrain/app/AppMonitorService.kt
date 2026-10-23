package com.jumpybrain.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import org.json.JSONObject

/**
 * Foreground service that polls UsageStatsManager every second.
 * When the foreground app is in the blocklist it launches the home screen.
 *
 * Requires: PACKAGE_USAGE_STATS (granted via Settings > Usage Access)
 *           FOREGROUND_SERVICE   (declared in AndroidManifest)
 */
class AppMonitorService : Service() {

    private val handler          = Handler(Looper.getMainLooper())
    private var blockedPackages  = emptySet<String>()
    private var snoozeUntil      = 0L
    private var lastBlocked      = ""   // debounce — avoid spamming home intent

    private val pollRunnable = object : Runnable {
        override fun run() {
            try { checkForegroundApp() } catch (_: Exception) {}
            handler.postDelayed(this, 1_000)
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        loadRules()
        startForeground(NOTIF_ID, buildNotification())
        handler.post(pollRunnable)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            AppBlockerPlugin.ACTION_RULES_UPDATED -> loadRules()
            AppBlockerPlugin.ACTION_SNOOZE -> {
                snoozeUntil = prefs().getLong(AppBlockerPlugin.PREF_SNOOZE_UNTIL, 0L)
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(pollRunnable)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Core logic ────────────────────────────────────────────────────────────

    private fun checkForegroundApp() {
        val p = prefs()
        if (!p.getBoolean(AppBlockerPlugin.PREF_ACTIVE, false)) return
        if (System.currentTimeMillis() < snoozeUntil) return
        if (blockedPackages.isEmpty()) return

        val fg = foregroundPackage() ?: return
        if (fg == lastBlocked) return // already sent home for this app
        if (fg in blockedPackages) {
            lastBlocked = fg
            goHome()
        } else {
            lastBlocked = ""
        }
    }

    private fun foregroundPackage(): String? {
        val usm  = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now  = System.currentTimeMillis()
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 10_000, now)
        return stats?.maxByOrNull { it.lastTimeUsed }?.packageName
    }

    private fun goHome() {
        startActivity(Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        })
    }

    // ── Rules ─────────────────────────────────────────────────────────────────

    private fun loadRules() {
        snoozeUntil = prefs().getLong(AppBlockerPlugin.PREF_SNOOZE_UNTIL, 0L)
        val json = prefs().getString(AppBlockerPlugin.PREF_RULES, null) ?: run {
            blockedPackages = emptySet()
            return
        }
        try {
            val rules = JSONObject(json)
            if (!rules.optBoolean("isEnabled", false)) {
                blockedPackages = emptySet()
                return
            }
            val apps = rules.optJSONArray("blockedApps") ?: run {
                blockedPackages = emptySet()
                return
            }
            val pkgs = mutableSetOf<String>()
            for (i in 0 until apps.length()) {
                val app = apps.getJSONObject(i)
                // Convention: value = package name (e.g. com.instagram.android)
                //             label = human name (e.g. Instagram)
                val pkg = app.optString("value").trim().ifBlank { null }
                if (pkg != null) pkgs.add(pkg)
            }
            blockedPackages = pkgs
        } catch (_: Exception) {
            blockedPackages = emptySet()
        }
    }

    private fun prefs() = getSharedPreferences(AppBlockerPlugin.PREFS_NAME, Context.MODE_PRIVATE)

    // ── Notification ──────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "JumpyBrain Focus Guard",
                NotificationManager.IMPORTANCE_LOW
            ).apply { description = "Active while app blocking is on" }
            (getSystemService(NotificationManager::class.java)).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("JumpyBrain — Focus Mode")
            .setContentText("App blocking is active")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setOngoing(true)
            .setSilent(true)
            .build()

    companion object {
        private const val CHANNEL_ID = "jb_focus_guard"
        private const val NOTIF_ID   = 1001
    }
}
