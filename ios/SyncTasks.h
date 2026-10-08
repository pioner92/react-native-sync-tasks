#ifdef __cplusplus
#import "react-native-sync-tasks.hpp"
#endif

#ifdef RCT_NEW_ARCH_ENABLED
#import <RNSyncTasksSpec/RNSyncTasksSpec.h>

@interface SyncTasksManager : NSObject <NativeSyncTasksSpec>
#else
#import <React/RCTBridgeModule.h>

@interface SyncTasksManager : NSObject <RCTBridgeModule>
#endif

@end
