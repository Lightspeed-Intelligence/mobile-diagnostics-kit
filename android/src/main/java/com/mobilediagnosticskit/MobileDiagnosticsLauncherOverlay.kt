package com.mobilediagnosticskit

import android.app.Activity
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import java.lang.ref.WeakReference
import kotlin.math.abs

internal object MobileDiagnosticsLauncherOverlay {
  private var activityRef = WeakReference<Activity>(null)
  private var launcher: View? = null
  private var layoutParams: WindowManager.LayoutParams? = null

  fun show(activity: Activity) {
    if (activityRef.get() === activity && launcher?.isAttachedToWindow == true) return
    hide()

    val density = activity.resources.displayMetrics.density
    val size = (48 * density).toInt()
    val margin = (12 * density).toInt()
    val button = TextView(activity).apply {
      text = "D"
      textSize = 20f
      gravity = Gravity.CENTER
      setTextColor(Color.WHITE)
      contentDescription = "DoKit"
      elevation = 12 * density
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.rgb(22, 138, 91))
        setStroke((2 * density).toInt(), Color.WHITE)
      }
    }
    val params = WindowManager.LayoutParams(
      size,
      size,
      WindowManager.LayoutParams.TYPE_APPLICATION_PANEL,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      token = activity.window.decorView.windowToken
      gravity = Gravity.TOP or Gravity.START
      x = activity.resources.displayMetrics.widthPixels - size - margin
      y = margin * 5
    }
    installTouchHandling(button, activity.windowManager, params)

    runCatching { activity.windowManager.addView(button, params) }
      .onSuccess {
        activityRef = WeakReference(activity)
        launcher = button
        layoutParams = params
      }
  }

  fun hide(activity: Activity? = null) {
    val owner = activityRef.get()
    if (activity != null && owner !== activity) return
    val view = launcher
    if (owner != null && view != null) {
      runCatching { owner.windowManager.removeViewImmediate(view) }
    }
    activityRef = WeakReference(null)
    launcher = null
    layoutParams = null
  }

  private fun installTouchHandling(
    view: View,
    windowManager: WindowManager,
    params: WindowManager.LayoutParams,
  ) {
    var downRawX = 0f
    var downRawY = 0f
    var downX = 0
    var downY = 0
    view.setOnTouchListener { _, event ->
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downRawX = event.rawX
          downRawY = event.rawY
          downX = params.x
          downY = params.y
          true
        }
        MotionEvent.ACTION_MOVE -> {
          params.x = downX + (event.rawX - downRawX).toInt()
          params.y = downY + (event.rawY - downRawY).toInt()
          runCatching { windowManager.updateViewLayout(view, params) }
          true
        }
        MotionEvent.ACTION_UP -> {
          if (abs(event.rawX - downRawX) < 8 && abs(event.rawY - downRawY) < 8) {
            MobileDiagnosticsDoKit.showToolPanel()
          }
          true
        }
        else -> false
      }
    }
  }
}
