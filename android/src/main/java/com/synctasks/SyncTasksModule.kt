package com.synctasks

import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.common.annotations.FrameworkAPI
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.turbomodule.core.CallInvokerHolderImpl
import com.facebook.react.turbomodule.core.interfaces.BindingsInstallerHolder
import com.facebook.react.turbomodule.core.interfaces.TurboModuleWithJSIBindings

@ReactModule(name = SyncTasksModule.NAME)
class SyncTasksModule(context: ReactApplicationContext) :
  SyncTasksSpec(context), TurboModuleWithJSIBindings {

  // New architecture: the TurboModule manager installs the bindings when the module is created.
  @DoNotStrip
  override fun getBindingsInstaller(): BindingsInstallerHolder = nativeCreateBindingsInstaller()

  @OptIn(FrameworkAPI::class)
  @ReactMethod(isBlockingSynchronousMethod = true)
  override fun install(): Boolean {
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      return true
    }

    @Suppress("DEPRECATION")
    val callInvokerHolder =
      reactApplicationContext.catalystInstance.jsCallInvokerHolder as CallInvokerHolderImpl
    val runtime = reactApplicationContext.javaScriptContextHolder?.get() ?: return false

    nativeInstall(runtime, callInvokerHolder)
    return true
  }

  companion object {
    const val NAME = "SyncTasksManager"

    init {
      System.loadLibrary("rnsynctasks")
    }

    @OptIn(FrameworkAPI::class)
    @JvmStatic
    external fun nativeInstall(jsiRuntimePointer: Long, jsCallInvoker: CallInvokerHolderImpl)

    @JvmStatic
    external fun nativeCreateBindingsInstaller(): BindingsInstallerHolder
  }
}
