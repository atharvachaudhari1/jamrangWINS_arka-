package com.jumpybrain.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.view.accessibility.AccessibilityEvent
import org.json.JSONObject

/**
 * Accessibility service that reacts to every TYPE_WINDOW_STATE_CHANGED event.
 * This fires as soon as an app becomes the foreground window — much faster than
 * the 1-second UsageStats poll in AppMonitorService and works without the
 * PACKAGE_USAGE_STATS permission.
 *
 * To activate: Settings > Accessibility > JumpyBrain > Enable.
 * Declared in AndroidManifest and res/xml/accessibility_service_config.xml.
 */
class AppBlockerAccessibilityService : AccessibilityService() {

    private var blockedPackages = emptySet<String>()
    private var snoozeUntil     = 0L
    private var lastBlocked     = ""

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = serviceInfo.apply {
            eventTypes   = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100
        }
        loadRules()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return

        // Reload rules on every event to pick up changes without restart
        loadRules()

        val p = prefs()
        if (!p.getBoolean(AppBlockerPlugin.PREF_ACTIVE, false)) return
        if (System.currentTimeMillis() < snoozeUntil) return
        if (pkg in blockedPackages && pkg != lastBlocked) {
            lastBlocked = pkg
            performGlobalAction(GLOBAL_ACTION_HOME)
        } else if (pkg !in blockedPackages) {
            lastBlocked = ""
        }
    }

    override fun onInterrupt() {}

    private fun loadRules() {
        val p = prefs()
        snoozeUntil = p.getLong(AppBlockerPlugin.PREF_SNOOZE_UNTIL, 0L)

        val json = p.getString(AppBlockerPlugin.PREF_RULES, null) ?: run {
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
                val pkg = app.optString("value").trim().ifBlank { null }
                if (pkg != null) pkgs.add(pkg)
            }
            blockedPackages = pkgs
        } catch (_: Exception) {
            blockedPackages = emptySet()
        }
    }

    private fun prefs() = getSharedPreferences(AppBlockerPlugin.PREFS_NAME, Context.MODE_PRIVATE)
}
