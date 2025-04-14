#import "SyncTasks.h"
#import "react-native-sync-tasks.hpp"

#import <React/RCTBridge+Private.h>
#import <ReactCommon/RCTTurboModule.h>
#import <React/RCTBridge.h>
#import <React/RCTUtils.h>
#import <jsi/jsi.h>
#include <filesystem>

#include <future>
#include "iostream"


using namespace std;
using namespace facebook;


@implementation SyncTasksManager

RCT_EXPORT_MODULE(SyncTasksManager)

@synthesize bridge = _bridge;
@synthesize methodQueue = _methodQueue;

+ (BOOL)requiresMainQueueSetup {
  return YES;
}


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


@end
