package com.jumpybrain.app

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "AppBlocker")
class AppBlockerPlugin : Plugin() {

    // ── Permissions ──────────────────────────────────────────────────────────

    @PluginMethod
    fun checkPermissions(call: PluginCall) {
        val ret = JSObject()
        ret.put("usageStats", if (hasUsageStatsPermission()) "granted" else "denied")
        ret.put("accessibility", if (isAccessibilityServiceEnabled()) "granted" else "denied")
        ret.put("familyControls", "denied")
        call.resolve(ret)
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        // Opens Usage Access settings; user must also enable the Accessibility service manually.
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        activity.startActivity(intent)
        call.resolve()
    }

    // iOS-only stub — resolves immediately on Android
    @PluginMethod
    fun requestFamilyControlsAuth(call: PluginCall) {
        call.resolve(JSObject().apply { put("authorized", false) })
    }

    // ── Rules ────────────────────────────────────────────────────────────────

    @PluginMethod
    fun setBlockingRules(call: PluginCall) {
        val rulesObj = call.getObject("rules") ?: run {
            call.reject("rules parameter required")
            return
        }
        prefs().edit().putString(PREF_RULES, rulesObj.toString()).apply()

        // Hot-reload rules into a running service
        context.startService(Intent(context, AppMonitorService::class.java).apply {
            action = ACTION_RULES_UPDATED
        })

        call.resolve(JSObject().apply { put("ok", true) })
    }

    // ── State ────────────────────────────────────────────────────────────────

    @PluginMethod
    fun getBlockingState(call: PluginCall) {
        val p = prefs()
        val active      = p.getBoolean(PREF_ACTIVE, false)
        val snoozeUntil = p.getLong(PREF_SNOOZE_UNTIL, 0L)
        val snoozed     = snoozeUntil > System.currentTimeMillis()

        call.resolve(JSObject().apply {
            put("active", active)
            put("snoozed", snoozed)
            put("snoozeUntil", snoozeUntil)
        })
    }

    // ── Control ──────────────────────────────────────────────────────────────

    @PluginMethod
    fun startBlocking(call: PluginCall) {
        if (!hasUsageStatsPermission()) {
            call.reject("USAGE_STATS_PERMISSION_DENIED",
                "Grant Usage Access in Settings > Apps > Special app access > Usage access")
            return
        }
        prefs().edit().putBoolean(PREF_ACTIVE, true).apply()

        val intent = Intent(context, AppMonitorService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }

        call.resolve(JSObject().apply { put("ok", true) })
    }

    @PluginMethod
    fun stopBlocking(call: PluginCall) {
        prefs().edit().putBoolean(PREF_ACTIVE, false).apply()
        context.stopService(Intent(context, AppMonitorService::class.java))
        call.resolve(JSObject().apply { put("ok", true) })
    }

    @PluginMethod
    fun snooze(call: PluginCall) {
        val minutes    = call.getInt("minutes") ?: 5
        val snoozeUntil = System.currentTimeMillis() + minutes * 60_000L
        prefs().edit().putLong(PREF_SNOOZE_UNTIL, snoozeUntil).apply()

        context.startService(Intent(context, AppMonitorService::class.java).apply {
            action = ACTION_SNOOZE
        })

        call.resolve(JSObject().apply { put("ok", true) })
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun prefs() = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun hasUsageStatsPermission(): Boolean {
        val ops  = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ops.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                context.packageName
            )
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                context.packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val serviceId = "${context.packageName}/${AppBlockerAccessibilityService::class.java.canonicalName}"
        val enabled   = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return enabled.split(':').any { it.equals(serviceId, ignoreCase = true) }
    }

    companion object {
        const val PREFS_NAME         = "jumpybrain_blocking"
        const val PREF_RULES         = "rules"
        const val PREF_ACTIVE        = "blocking_active"
        const val PREF_SNOOZE_UNTIL  = "snooze_until"
        const val ACTION_RULES_UPDATED = "RULES_UPDATED"
        const val ACTION_SNOOZE        = "SNOOZE"
    }
}
