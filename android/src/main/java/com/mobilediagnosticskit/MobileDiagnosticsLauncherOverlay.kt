package com.mobilediagnosticskit

import android.app.Activity
import android.os.Build
import android.view.Gravity
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.FrameLayout
import java.lang.ref.WeakReference
import kotlin.math.abs
import kotlin.math.max

internal object MobileDiagnosticsLauncherOverlay {
  private var activityRef = WeakReference<Activity>(null)
  private var launcher: View? = null
  private var lastX: Float? = null
  private var lastY: Float? = null

  fun show(activity: Activity) {
    if (activityRef.get() !== activity) {
      hide()
      activityRef = WeakReference(activity)
    }
    scheduleRefresh(activity)
  }

  fun hide(activity: Activity? = null) {
    val owner = activityRef.get()
    if (activity != null && owner !== activity) return

    detachLauncher()
    activityRef = WeakReference(null)
  }

  private fun scheduleRefresh(activity: Activity) {
    val root = activity.window.decorView
    root.post { refreshLauncher(activity) }
    root.postDelayed({ refreshLauncher(activity) }, 120L)
  }

  private fun refreshLauncher(activity: Activity) {
    if (activityRef.get() !== activity || activity.isFinishing ||
      (Build.VERSION.SDK_INT >= 17 && activity.isDestroyed)
    ) return

    val root = activity.window.decorView
    val target = root as? ViewGroup ?: return
    if (launcher?.parent === target && launcher?.isAttachedToWindow == true) return

    detachLauncher()
    val density = activity.resources.displayMetrics.density
    val size = (48 * density).toInt()
    val button = LayoutInflater.from(activity).inflate(
      com.didichuxing.doraemonkit.R.layout.dk_main_launch_icon,
      target,
      false,
    ).apply {
      contentDescription = activity.getString(R.string.mobile_diagnostics_launcher)
      elevation = 12 * density
      isClickable = true
      isFocusable = true
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
      setOnClickListener { MobileDiagnosticsDoKit.showToolPanel() }
    }
    installTouchHandling(button, target)
    target.addView(
      button,
      FrameLayout.LayoutParams(size, size, Gravity.TOP or Gravity.START),
    )
    launcher = button
    positionLauncher(button, target, size)
  }

  private fun positionLauncher(view: View, parent: ViewGroup, size: Int) {
    parent.post {
      if (view.parent !== parent) return@post
      val margin = dp(view, 12)
      val topInset = if (Build.VERSION.SDK_INT >= 23) {
        @Suppress("DEPRECATION")
        parent.rootWindowInsets?.systemWindowInsetTop ?: 0
      } else 0
      val maximumX = max(0, parent.width - size)
      val maximumY = max(0, parent.height - size)
      view.x = (lastX ?: (maximumX - margin).toFloat()).coerceIn(0f, maximumX.toFloat())
      view.y = (lastY ?: (topInset + margin).toFloat()).coerceIn(0f, maximumY.toFloat())
    }
  }

  private fun detachLauncher() {
    launcher?.let { view ->
      lastX = view.x
      lastY = view.y
      (view.parent as? ViewGroup)?.let { parent ->
        runCatching { parent.removeView(view) }
      }
    }
    launcher = null
  }

  private fun installTouchHandling(view: View, parent: ViewGroup) {
    val touchSlop = ViewConfiguration.get(view.context).scaledTouchSlop
    var downRawX = 0f
    var downRawY = 0f
    var downX = 0f
    var downY = 0f
    view.setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downRawX = event.rawX
          downRawY = event.rawY
          downX = view.x
          downY = view.y
          true
        }
        MotionEvent.ACTION_MOVE -> {
          val maximumX = max(0, parent.width - view.width).toFloat()
          val maximumY = max(0, parent.height - view.height).toFloat()
          view.x = (downX + event.rawX - downRawX).coerceIn(0f, maximumX)
          view.y = (downY + event.rawY - downRawY).coerceIn(0f, maximumY)
          lastX = view.x
          lastY = view.y
          true
        }
        MotionEvent.ACTION_UP -> {
          if (abs(event.rawX - downRawX) < touchSlop &&
            abs(event.rawY - downRawY) < touchSlop
          ) view.performClick()
          true
        }
        MotionEvent.ACTION_CANCEL -> true
        else -> false
      }
    }
  }

  private fun dp(view: View, value: Int): Int =
    (value * view.resources.displayMetrics.density).toInt()
}
