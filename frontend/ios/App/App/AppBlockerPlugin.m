#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Registers the plugin with the Capacitor bridge.
// Method names must match the Swift @objc func names exactly.
CAP_PLUGIN(AppBlockerPlugin, "AppBlocker",
    CAP_PLUGIN_METHOD(checkPermissions,         CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestPermissions,       CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestFamilyControlsAuth, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setBlockingRules,         CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getBlockingState,         CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(startBlocking,            CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stopBlocking,             CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(snooze,                   CAPPluginReturnPromise);
)
