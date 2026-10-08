#import "SyncTasks.h"
#import "react-native-sync-tasks.hpp"

#import <React/RCTBridge.h>
#import <jsi/jsi.h>

#ifdef RCT_NEW_ARCH_ENABLED
#import <ReactCommon/RCTTurboModule.h>
#import <ReactCommon/RCTTurboModuleWithJSIBindings.h>
#else
#import <React/RCTBridge+Private.h>
#endif

using namespace facebook;

#ifdef RCT_NEW_ARCH_ENABLED
@interface SyncTasksManager () <RCTTurboModule, RCTTurboModuleWithJSIBindings>
@end
#endif

@implementation SyncTasksManager

RCT_EXPORT_MODULE(SyncTasksManager)

@synthesize bridge = _bridge;
@synthesize methodQueue = _methodQueue;

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

#ifdef RCT_NEW_ARCH_ENABLED

// The TurboModule manager calls this on the JS thread when the module is first requested.
- (void)installJSIBindingsWithRuntime:(jsi::Runtime &)runtime
                          callInvoker:(const std::shared_ptr<react::CallInvoker> &)callInvoker {
  sh::synctasks::install(&runtime, callInvoker);
}

- (std::shared_ptr<react::TurboModule>)getTurboModule:(const react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<react::NativeSyncTasksSpecJSI>(params);
}

// The bindings are already installed by installJSIBindingsWithRuntime.
- (NSNumber *)install {
  return @YES;
}

#else

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(install)
{
  RCTBridge* bridge = [RCTBridge currentBridge];
  RCTCxxBridge* cxxBridge = (RCTCxxBridge*)bridge;

  if (cxxBridge == nil) {
    return @false;
  }

  auto jsiRuntime = (jsi::Runtime*) cxxBridge.runtime;
  if (jsiRuntime == nil) {
    return @false;
  }

  auto jsCallInvoker =  bridge.jsCallInvoker;
  sh::synctasks::install(jsiRuntime, jsCallInvoker);

  return @true;
}

#endif

@end
