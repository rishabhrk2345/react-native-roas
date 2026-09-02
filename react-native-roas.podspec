require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'react-native-roas'
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = 'https://github.com/harsh-vasundhara/react-native-roas'
  s.license      = package['license']
  s.author       = { 'ROASSensor' => 'support@roassensor.com' }
  s.platforms    = { :ios => '14.0' }
  s.source       = { :path => '.' }
  s.source_files = 'ios/**/*.{h,m,swift}'

  s.dependency 'React-Core'

  # RoasSensor now has a real home and a real tag:
  #   https://github.com/rishabhrk2345/Roas-ios-SDK  (tag 0.1.7)
  # It is NOT on the CocoaPods trunk, though, and a podspec cannot name a git
  # source for its own dependency. So the consuming APP still has to say where
  # it comes from, in its own ios/Podfile:
  #
  #   pod 'RoasSensor', :git => 'https://github.com/rishabhrk2345/Roas-ios-SDK.git', :tag => '0.1.7'
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
  s.dependency 'RoasSensor', '~> 0.1.7'

  s.swift_version = '5.9'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
