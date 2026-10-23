# iOS Setup Notes — App Blocking (Phase 3)

## One-time setup after `npx cap add ios`

### 1. Register the plugin in AppDelegate.swift
```swift
// In application(_:didFinishLaunchingWithOptions:):
// Capacitor auto-discovers plugins via CAPBridgedPlugin protocol — no manual
// registration needed when using the CAPBridgedPlugin conformance in Swift.
```

### 2. Add frameworks in Xcode
Project > App target > Frameworks, Libraries, and Embedded Content:
- `FamilyControls.framework`
- `ManagedSettings.framework`
- `DeviceActivity.framework`

### 3. Add Signing & Capabilities
Project > App target > Signing & Capabilities > + Capability:
- **Family Controls** — this adds `com.apple.developer.family-controls`
- **App Groups** — add `group.com.jumpybrain.app`

### 4. Apply for the entitlement
Go to https://developer.apple.com/contact/request/family-controls-distribution
and request the `com.apple.developer.family-controls` entitlement.
Without approval, `AuthorizationCenter.requestAuthorization` will fail.

### 5. Add DeviceActivity extension (for schedule-based blocking)
File > New > Target > Device Activity Monitor Extension
- Name: `JumpyBrainActivityMonitor`
- Add the same entitlements (`family-controls` + App Group)
- The extension's `DeviceActivityMonitor` subclass reads blockingRules from
  the shared App Group UserDefaults and calls ManagedSettingsStore methods.

### 6. FamilyActivityPicker (app selection UI)
To let users select apps to block, present `FamilyActivityPicker` (SwiftUI):
```swift
FamilyActivityPicker(selection: $activitySelection)
    .onChange(of: activitySelection) { newValue in
        if let data = try? JSONEncoder().encode(newValue) {
            UserDefaults(suiteName: "group.com.jumpybrain.app")?
                .set(data, forKey: "selected_app_tokens")
        }
    }
```
This stores the opaque `ApplicationToken` set that `AppBlockerPlugin.swift`
reads and passes to `ManagedSettingsStore`.

## Runtime permission flow
1. JS calls `AppBlocker.checkPermissions()` → returns `familyControls: 'prompt'`
2. JS calls `AppBlocker.requestFamilyControlsAuth()` → system dialog appears
3. After approval, JS calls `AppBlocker.startBlocking()` → rules applied
4. Show `FamilyActivityPicker` (native SwiftUI) to let user select apps to block
