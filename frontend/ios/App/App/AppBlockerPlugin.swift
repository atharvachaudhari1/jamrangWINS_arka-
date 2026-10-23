import Foundation
import Capacitor
import FamilyControls
import ManagedSettings
import DeviceActivity

/**
 * AppBlockerPlugin — iOS Capacitor plugin for app/website blocking.
 *
 * Enforcement model:
 *   - FamilyControls authorization gates all blocking APIs.
 *   - ManagedSettingsStore applies app token shields and web content filters.
 *   - DeviceActivityMonitor extension (separate target) handles schedule-based
 *     blocking without the main app being open.
 *
 * Required entitlements (App target and DeviceActivity extension):
 *   com.apple.developer.family-controls   — apply for at developer.apple.com
 *
 * Required frameworks (Xcode > Frameworks, Libraries, and Embedded Content):
 *   FamilyControls.framework
 *   ManagedSettings.framework
 *   DeviceActivity.framework
 */
@objc(AppBlockerPlugin)
public class AppBlockerPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier   = "AppBlockerPlugin"
    public let jsName       = "AppBlocker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "checkPermissions",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions",      returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestFamilyControlsAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBlockingRules",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBlockingState",        returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startBlocking",           returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBlocking",            returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "snooze",                  returnType: CAPPluginReturnPromise),
    ]

    private let store    = ManagedSettingsStore()
    private let center   = AuthorizationCenter.shared
    private var defaults: UserDefaults? {
        UserDefaults(suiteName: "group.com.jumpybrain.app")
    }

    // ── Permissions ──────────────────────────────────────────────────────────

    @objc func checkPermissions(_ call: CAPPluginCall) {
        let status: String
        switch center.authorizationStatus {
        case .approved: status = "granted"
        case .denied:   status = "denied"
        default:        status = "prompt"
        }
        call.resolve([
            "usageStats":    "denied",
            "accessibility": "denied",
            "familyControls": status
        ])
    }

    @objc func requestPermissions(_ call: CAPPluginCall) {
        Task {
            do {
                try await center.requestAuthorization(for: .individual)
                call.resolve()
            } catch {
                call.reject("FamilyControls authorization failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func requestFamilyControlsAuth(_ call: CAPPluginCall) {
        Task {
            do {
                try await center.requestAuthorization(for: .individual)
                call.resolve(["authorized": true])
            } catch {
                call.resolve(["authorized": false])
            }
        }
    }

    // ── Rules ────────────────────────────────────────────────────────────────

    @objc func setBlockingRules(_ call: CAPPluginCall) {
        guard let rules = call.getObject("rules") else {
            call.reject("rules parameter required")
            return
        }

        // Persist rules in the shared App Group so the DeviceActivity extension
        // can read them without the main app being open.
        defaults?.set(rules, forKey: "blockingRules")

        if center.authorizationStatus == .approved {
            applyManagedSettings(rules: rules)
        }

        call.resolve(["ok": true])
    }

    // ── State ────────────────────────────────────────────────────────────────

    @objc func getBlockingState(_ call: CAPPluginCall) {
        let active      = defaults?.bool(forKey: "blocking_active") ?? false
        let snoozeUntil = defaults?.double(forKey: "snooze_until") ?? 0
        let snoozed     = snoozeUntil > Date().timeIntervalSince1970 * 1000
        call.resolve(["active": active, "snoozed": snoozed, "snoozeUntil": snoozeUntil])
    }

    // ── Control ──────────────────────────────────────────────────────────────

    @objc func startBlocking(_ call: CAPPluginCall) {
        guard center.authorizationStatus == .approved else {
            call.reject("FAMILY_CONTROLS_NOT_AUTHORIZED",
                        "Call requestFamilyControlsAuth first")
            return
        }
        defaults?.set(true, forKey: "blocking_active")

        if let rules = defaults?.dictionary(forKey: "blockingRules") {
            applyManagedSettings(rules: rules)
        }

        call.resolve(["ok": true])
    }

    @objc func stopBlocking(_ call: CAPPluginCall) {
        defaults?.set(false, forKey: "blocking_active")
        store.clearAllSettings()
        call.resolve(["ok": true])
    }

    @objc func snooze(_ call: CAPPluginCall) {
        let minutes     = call.getInt("minutes") ?? 5
        let snoozeUntil = (Date().timeIntervalSince1970 + Double(minutes * 60)) * 1000
        defaults?.set(snoozeUntil, forKey: "snooze_until")
        store.clearAllSettings()
        call.resolve(["ok": true])
    }

    // ── ManagedSettings application ──────────────────────────────────────────

    /**
     * Applies FamilyControls shields via ManagedSettings.
     *
     * App tokens are opaque values obtained from FamilyActivityPicker (a SwiftUI
     * component the user interacts with to select apps). In a full implementation:
     *
     *   1. Present FamilyActivityPicker to the user.
     *   2. Receive the ActivitySelection (contains Set<ApplicationToken>).
     *   3. Persist the selection in the App Group defaults.
     *   4. Pass those tokens into store.application.blockedApplications here.
     *
     * The blocked apps list stored in blockingRules uses package-style names as
     * human-readable labels. The actual ApplicationTokens must come from the
     * FamilyActivityPicker UI flow.
     */
    private func applyManagedSettings(rules: [AnyHashable: Any]) {
        // Retrieve persisted ApplicationToken selection (populated by FamilyActivityPicker)
        if let tokenData = defaults?.data(forKey: "selected_app_tokens"),
           let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: tokenData) {
            store.application.blockedApplications = selection.applicationTokens
            store.application.denyAppInstallation  = false
            store.application.denyAppRemoval        = false
        }

        // Block websites via WebContentSettings
        if let blockedSites = rules["blockedSites"] as? [[String: Any]] {
            let domains = blockedSites.compactMap { $0["value"] as? String }
            let whitelistedSites = (rules["whitelist"] as? [[String: Any]] ?? [])
                .compactMap { $0["value"] as? String }

            // ManagedSettings web content filter: block listed domains
            store.webContent.blockedByFilter = .specific(
                BlockedWebsiteFilter(
                    filterPolicy:  .specific,
                    blockedDomains: Set(domains.compactMap { URL(string: "https://\($0)") }),
                    allowedDomains: Set(whitelistedSites.compactMap { URL(string: "https://\($0)") })
                )
            )
        }
    }
}
