import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

// NOTE FOR THE FIRST MAC BUILD: the deep-link methods at the bottom of
// AppDelegate use `RCTLinkingManager`. It ships in the React-RCTLinking pod and
// is normally reachable through the `React` umbrella above with static linking,
// which is why no extra import is written here. If the compiler reports
// "cannot find 'RCTLinkingManager' in scope" — most likely under
// USE_FRAMEWORKS, where each pod becomes its own module — add:
//
//     import React_RCTLinking
//
// Authored on a Windows machine, so which of the two the build wants is
// untested here. It is a one-line fix either way, not a design question — the
// first Xcode build will say which.

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "RoasRnTest",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  // MARK: - Deep links
  //
  // These two forward incoming links into React Native's Linking module, which
  // is what App.tsx subscribes to. WITHOUT THEM the deep-link wiring in App.tsx
  // is dead code on iOS: Linking.getInitialURL() resolves null and the 'url'
  // listener never fires, so Roas.handleDeepLink() is never called and an
  // rsclid arriving by link is silently lost. Android needs no equivalent —
  // the intent reaches the Activity, which ReactActivity already forwards.
  //
  // Both are needed, and they cover different cases:
  //
  //   openURL           custom-scheme links (roasrn://open?rsclid=…), the QA
  //                     path the Android side is tested with via adb.
  //   continueUserActivity  Universal Links (https://…), which is what a real
  //                     ad click opens. This is the one that matters in
  //                     production and the one a scheme-only test never
  //                     exercises — Universal Links additionally require an
  //                     apple-app-site-association file hosted on the domain
  //                     and the Associated Domains capability on the target,
  //                     neither of which is set up here yet.

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    RCTLinkingManager.application(app, open: url, options: options)
  }

  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
