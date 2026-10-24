require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'react-native-roas'
  s.version      = package['version']
  s.summary      = package['description']
  # THIS package's repo. It named harsh-vasundhara/react-native-roas, which was
  # a guess made before this package had a repo at all — that account owns
  # roas-sensor-flutter, so it looked like the house style. The SDKs are in fact
  # split across two accounts: Roas-ios-SDK and this one live under
  # rishabhrk2345, roas-sensor-flutter under harsh-vasundhara. The guessed URL
  # was a 404, which is the same wrong turn roas-sensor-flutter's podspec once
  # had (it pointed at the native Android SDK) and the worst one to leave in a
  # package whose homepage is where someone goes to find out what it is.
  s.homepage     = 'https://github.com/rishabhrk2345/react-native-roas'
  s.license      = package['license']
  s.author       = { 'ROASSensor' => 'support@roassensor.com' }
  s.platforms    = { :ios => '14.0' }
  s.source       = { :path => '.' }
  s.source_files = 'ios/**/*.{h,m,swift}'

  s.dependency 'React-Core'

  # RoasSensor now has a real home and a real tag:
  #   https://github.com/rishabhrk2345/Roas-ios-SDK  (tag 0.1.10)
  # It is NOT on the CocoaPods trunk, though, and a podspec cannot name a git
  # source for its own dependency. So the consuming APP still has to say where
  # it comes from, in its own ios/Podfile:
  #
  #   pod 'RoasSensor', :git => 'https://github.com/rishabhrk2345/Roas-ios-SDK.git', :tag => '0.1.10'
  #   # or, for local dev against a checkout:
  #   pod 'RoasSensor', :path => '../../sdk-ios'
  #
  # Without that line `pod install` fails with "Unable to find a specification
  # for RoasSensor", which reads like a broken bridge and is really a missing
  # source.
  #
  # Version-pinned rather than bare, and as of bridge 0.1.5 the floor is
  # load-bearing rather than tidiness: requestTracking / updateConversionValue /
  # appAccountToken are RoasSensor 0.1.7 API, and an unconstrained dependency
  # would let an older one resolve silently — the failure landing as a Swift
  # compile error about missing members, or on a future incompatible release as
  # missing methods at runtime, rather than at resolve time as a version
  # conflict.
  #
  # Raised to 0.1.8 for a DIFFERENT kind of reason, and the distinction matters
  # if this is ever relaxed: 0.1.8 adds no API, so nothing here fails to compile
  # against 0.1.7. What 0.1.7 does is label every TestFlight install
  # `installer_package=development`, because the receipt file it tested for is
  # written asynchronously and is usually still absent when the install beacon
  # fires. Nothing errors; the column that exists to separate the customer's own
  # QA from their real users simply reports the wrong one, for the entire beta
  # cohort. `~> 0.1.7` would already ALLOW 0.1.8 to resolve — the floor is
  # raised so that an app pinning `:tag => '0.1.7'` fails at resolve time rather
  # than shipping a beta whose install rows all read as developer builds.
  #
  # 0.1.9 is then the floor this bridge actually needs, and for a third kind of
  # reason again: `Roas.verifyPurchase(transactionId:)` is 0.1.9 API, so on
  # 0.1.8 RoasReactNative.swift fails to compile on a missing member — back to
  # the first reason above, which is what a floor is for.
  #
  # 0.1.15 is the floor as of bridge 0.1.8, for the plainest reason yet: below
  # it a track() property JSONSerialization refuses (a NaN from JavaScript, a
  # value it cannot encode) crashes the host app with an exception Swift
  # cannot catch, and the default collector is api.roassensor.com, which has
  # no DNS. An app whose Podfile still names an older tag now fails at
  # `pod install` instead of shipping that crash.
  #
  # A new RoasSensor TAG is minted on a Mac (swift build + swift test + the iOS-slice
  # xcodebuild) and may not exist yet when you read this; a version ahead of
  # its tag is the normal state between "ready" and "shipped". If `pod install`
  # says it cannot find the tag, that is what happened — mint it, don't lower
  # the pin.
  s.dependency 'RoasSensor', '~> 0.1.15'

  s.swift_version = '5.9'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
