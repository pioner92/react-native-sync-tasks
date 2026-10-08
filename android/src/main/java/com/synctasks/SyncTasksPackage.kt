package com.synctasks

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class SyncTasksPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == SyncTasksModule.NAME) SyncTasksModule(reactContext) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(
      SyncTasksModule.NAME to ReactModuleInfo(
        name = SyncTasksModule.NAME,
        className = SyncTasksModule.NAME,
        canOverrideExistingModule = false,
        needsEagerInit = false,
        isCxxModule = false,
        isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      )
    )
  }
}
