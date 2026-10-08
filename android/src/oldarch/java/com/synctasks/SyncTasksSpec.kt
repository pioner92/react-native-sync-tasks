package com.synctasks

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

abstract class SyncTasksSpec(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName(): String = SyncTasksModule.NAME

  abstract fun install(): Boolean
}
