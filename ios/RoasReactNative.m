// Objective-C bridge file exposing the Swift RoasReactNative class to React
// Native's bridge. RCT_EXTERN_MODULE/RCT_EXTERN_METHOD are Objective-C-only
// macros — this file's sole purpose is registering the Swift class + its
// methods under the same signatures declared in RoasReactNative.swift.
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// The base class MUST stay in step with RoasReactNative.swift's own superclass.
// Naming NSObject here while the Swift class subclasses RCTEventEmitter
// compiles cleanly and then fails at runtime, because RN decides whether the
// module can emit events from what this macro declares.
//
// addListener:/removeListeners: are deliberately NOT declared here —
// RCTEventEmitter already exports both, and re-declaring them registers a
// duplicate selector.
@interface RCT_EXTERN_MODULE(RoasReactNative, RCTEventEmitter)

RCT_EXTERN_METHOD(initialize:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestTracking:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(updateConversionValue:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(visitorId:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(appAccountToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(identify:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(track:(NSString *)event
                  properties:(NSDictionary *)properties
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(handleDeepLink:(NSString *)urlString
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setLogLevel:(NSString *)levelName
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
