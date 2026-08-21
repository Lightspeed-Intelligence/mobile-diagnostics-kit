package com.mobilediagnosticskit

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import com.didichuxing.doraemonkit.DoKit
import com.didichuxing.doraemonkit.aop.DokitPluginConfig
import com.didichuxing.doraemonkit.kit.AbstractKit
import com.didichuxing.doraemonkit.kit.core.DoKitManager
import com.didichuxing.doraemonkit.kit.network.NetworkManager
import com.didichuxing.doraemonkit.kit.network.okhttp.interceptor.DokitCapInterceptor
import com.facebook.react.modules.network.OkHttpClientProvider
import java.util.LinkedHashMap
import java.util.concurrent.atomic.AtomicBoolean

internal object MobileDiagnosticsDoKit {
  private const val CLEANUP_ATTEMPTS = 20
  private const val DOKIT_UNIVERSAL_ACTIVITY =
    "com.didichuxing.doraemonkit.kit.core.UniversalActivity"
  private val installed = AtomicBoolean(false)
  private val initialized = AtomicBoolean(false)
  private val unsupportedBuiltInKitIds = setOf(
    "dokit_sdk_performance_ck_network",
    "dokit_sdk_platform_ck_mock",
    "dokit_sdk_platform_ck_health",
    "dokit_sdk_platform_ck_dokit_connect",
    "dokit_sdk_platform_ck_dokit_for_web",
  )
  private var currentHostActivity: Activity? = null
  private var panelRestorePending = false

  fun install(application: Application) {
    if (!installed.compareAndSet(false, true)) return

    application.registerActivityLifecycleCallbacks(
      object : Application.ActivityLifecycleCallbacks {
        override fun onActivityCreated(activity: Activity, state: Bundle?) {
          initializeIfNeeded(application)
          installDoKitSafeAreaInsets(activity)
        }

        override fun onActivityStarted(activity: Activity) = Unit

        override fun onActivityResumed(activity: Activity) {
          if (activity is MobileDiagnosticsActivity || isDoKitActivity(activity)) return
          currentHostActivity = activity
          activity.window.decorView.post {
            if (currentHostActivity !== activity || activity.isFinishing) return@post
            DoKit.hide()
            DoKitManager.MAIN_ICON_HAS_SHOW = false
            DoKitManager.ALWAYS_SHOW_MAIN_ICON = false
            MobileDiagnosticsLauncherOverlay.show(activity)
            if (panelRestorePending) {
              panelRestorePending = false
              DoKit.showToolPanel()
            }
          }
        }

        override fun onActivityPaused(activity: Activity) {
          if (currentHostActivity === activity && activity.isFinishing) {
            MobileDiagnosticsLauncherOverlay.hide(activity)
          }
        }

        override fun onActivityStopped(activity: Activity) = Unit
        override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) = Unit

        override fun onActivityDestroyed(activity: Activity) {
          if (currentHostActivity === activity) currentHostActivity = null
          MobileDiagnosticsLauncherOverlay.hide(activity)
        }
      },
    )
  }

  fun kits(context: Context): LinkedHashMap<String, List<AbstractKit>> = linkedMapOf(
    context.getString(R.string.mobile_diagnostics_application_tools) to listOf(
      DestinationKit(MobileDiagnosticsActivity.DESTINATION_NETWORK),
      DestinationKit(MobileDiagnosticsActivity.DESTINATION_STORAGE),
      DestinationKit(MobileDiagnosticsActivity.DESTINATION_OTA),
    ),
  )

  fun showToolPanel() {
    currentHostActivity?.window?.decorView?.post { DoKit.showToolPanel() }
  }

  fun requestToolPanelRestore() {
    panelRestorePending = true
  }

  private fun initializeIfNeeded(application: Application) {
    if (!initialized.compareAndSet(false, true)) return

    DokitPluginConfig.SWITCH_DOKIT_PLUGIN = true
    DokitPluginConfig.SWITCH_NETWORK = true
    application.getSharedPreferences(
      "shared_prefs_doraemon",
      Context.MODE_PRIVATE,
    ).edit().putString("float_start_mode", "normal").commit()
    DoKitManager.IS_NORMAL_FLOAT_MODE = true
    DoKit.Builder(application)
      .customKits(kits(application))
      .disableUpload()
      .build()
    DoKitManager.ALWAYS_SHOW_MAIN_ICON = false
    OkHttpClientProvider.setOkHttpClientFactory {
      OkHttpClientProvider.createClientBuilder(application)
        .addInterceptor(DokitCapInterceptor())
        .build()
    }
    NetworkManager.get().startMonitor()
    cleanupUnsupportedBuiltInKits(0)
  }

  private fun isDoKitActivity(activity: Activity): Boolean =
    activity.javaClass.name.startsWith("com.didichuxing.doraemonkit.")

  private fun installDoKitSafeAreaInsets(activity: Activity) {
    if (Build.VERSION.SDK_INT < 35 ||
      activity.javaClass.name != DOKIT_UNIVERSAL_ACTIVITY
    ) return

    val content = activity.findViewById<View>(android.R.id.content) ?: return
    val left = content.paddingLeft
    val top = content.paddingTop
    val right = content.paddingRight
    val bottom = content.paddingBottom
    content.setOnApplyWindowInsetsListener { view, windowInsets ->
      val safeInsets = windowInsets.getInsets(
        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
      )
      view.setPadding(
        left + safeInsets.left,
        top + safeInsets.top,
        right + safeInsets.right,
        bottom + safeInsets.bottom,
      )
      windowInsets
    }
    content.requestApplyInsets()
  }

  private fun cleanupUnsupportedBuiltInKits(attempt: Int) {
    DoKitManager.GLOBAL_KITS.values.forEach { kits ->
      kits.removeAll { it.kit?.innerKitId() in unsupportedBuiltInKitIds }
    }
    DoKitManager.GLOBAL_SYSTEM_KITS.values.forEach { kits ->
      kits.removeAll { it.kit?.innerKitId() in unsupportedBuiltInKitIds }
    }
    if (attempt < CLEANUP_ATTEMPTS) {
      android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
        { cleanupUnsupportedBuiltInKits(attempt + 1) },
        100L,
      )
    }
  }

  private class DestinationKit(
    private val destination: String,
  ) : AbstractKit() {
    override val name: Int
      get() = when (destination) {
        MobileDiagnosticsActivity.DESTINATION_NETWORK -> R.string.mobile_diagnostics_network
        MobileDiagnosticsActivity.DESTINATION_OTA -> R.string.mobile_diagnostics_expo_update
        else -> R.string.mobile_diagnostics_local_state
      }

    override val icon: Int
      get() = when (destination) {
        MobileDiagnosticsActivity.DESTINATION_NETWORK -> android.R.drawable.ic_menu_search
        MobileDiagnosticsActivity.DESTINATION_OTA -> R.drawable.mobile_diagnostics_expo_update
        else -> android.R.drawable.ic_menu_edit
      }

    override fun onAppInit(context: Context?) = Unit

    override fun onClickWithReturn(activity: Activity): Boolean {
      MobileDiagnosticsActivity.open(activity, destination)
      return true
    }
  }
}
