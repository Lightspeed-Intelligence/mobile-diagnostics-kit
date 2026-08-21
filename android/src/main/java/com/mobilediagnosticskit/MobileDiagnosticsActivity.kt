package com.mobilediagnosticskit

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Bundle
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.didichuxing.doraemonkit.kit.network.NetworkManager
import expo.modules.updates.IUpdatesController
import expo.modules.updates.UpdatesController
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class MobileDiagnosticsActivity : Activity() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private lateinit var body: LinearLayout

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.statusBarColor = SURFACE
    window.navigationBarColor = SURFACE
    setContentView(createScreen())
    renderDestination(intent.getStringExtra(EXTRA_DESTINATION) ?: DESTINATION_STORAGE)
  }

  @Deprecated("Deprecated in Android")
  override fun onBackPressed() {
    finishAndRestorePanel()
  }

  override fun onDestroy() {
    scope.cancel()
    super.onDestroy()
  }

  private fun createScreen(): View {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(SURFACE)
    }
    root.setOnApplyWindowInsetsListener { view, insets ->
      if (Build.VERSION.SDK_INT >= 30) {
        val safe = insets.getInsets(
          WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
        )
        view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
      } else {
        @Suppress("DEPRECATION")
        view.setPadding(
          insets.systemWindowInsetLeft,
          insets.systemWindowInsetTop,
          insets.systemWindowInsetRight,
          insets.systemWindowInsetBottom,
        )
      }
      insets
    }

    body = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    root.addView(body, ViewGroup.LayoutParams(MATCH, MATCH))
    return root
  }

  private fun renderDestination(destination: String) {
    body.removeAllViews()
    val title = when (destination) {
      DESTINATION_NETWORK -> getString(R.string.mobile_diagnostics_network)
      DESTINATION_OTA -> getString(R.string.mobile_diagnostics_expo_update)
      else -> getString(R.string.mobile_diagnostics_local_state)
    }
    body.addView(header(title))
    when (destination) {
      DESTINATION_NETWORK -> renderNetwork()
      DESTINATION_OTA -> renderOta()
      else -> renderStorage()
    }
  }

  private fun header(title: String): View = LinearLayout(this).apply {
    gravity = Gravity.CENTER_VERTICAL
    orientation = LinearLayout.HORIZONTAL
    setPadding(dp(16), dp(10), dp(16), dp(10))
    minimumHeight = dp(64)
    addView(TextView(context).apply {
      text = "‹"
      textSize = 32f
      gravity = Gravity.CENTER
      setTextColor(SECONDARY_TEXT)
      contentDescription = getString(R.string.mobile_diagnostics_back)
      isClickable = true
      isFocusable = true
      background = rippleBackground(RAISED, BORDER, 24)
      setOnClickListener { finishAndRestorePanel() }
    }, LinearLayout.LayoutParams(dp(44), dp(44)))
    addView(TextView(context).apply {
      text = title
      textSize = 22f
      setTextColor(PRIMARY_TEXT)
      setTypeface(typeface, Typeface.BOLD)
      setPadding(dp(12), 0, 0, 0)
    }, LinearLayout.LayoutParams(0, WRAP, 1f))
  }

  private fun renderStorage() {
    val scroll = scrollingColumn()
    val entries = runCatching { MobileDiagnosticsStorage.readDefault(this) }
      .getOrElse {
        scroll.column.addView(message(getString(R.string.mobile_diagnostics_unavailable)))
        emptyList()
      }
    if (entries.isEmpty() && scroll.column.childCount == 0) {
      scroll.column.addView(message(getString(R.string.mobile_diagnostics_no_state)))
    }
    entries.forEach { entry -> scroll.column.addView(storageCard(entry)) }
    body.addView(scroll.view, LinearLayout.LayoutParams(MATCH, 0, 1f))
  }

  private fun storageCard(entry: MobileDiagnosticsStorageEntry): View =
    cardContainer(clickable = true).apply {
      addView(TextView(context).apply {
        text = entry.key
        textSize = 14f
        setTextColor(PRIMARY_TEXT)
        setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
      })
      addView(TextView(context).apply {
        text = entry.value
        textSize = 12f
        setTextColor(SECONDARY_TEXT)
        typeface = Typeface.MONOSPACE
        setPadding(0, dp(8), 0, 0)
        maxLines = 3
        ellipsize = TextUtils.TruncateAt.END
      })
      setOnClickListener { showValueDialog(entry.key, entry.value) }
    }

  private fun renderNetwork() {
    val records = NetworkManager.get().records
    val snapshot = synchronized(records) { records.toList().asReversed() }
    body.addView(LinearLayout(this).apply {
      gravity = Gravity.CENTER_VERTICAL
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(16), 0, dp(16), dp(8))
      addView(TextView(context).apply {
        text = resources.getQuantityString(
          R.plurals.mobile_diagnostics_request_count,
          snapshot.size,
          snapshot.size,
        )
        textSize = 12f
        setTextColor(MUTED_TEXT)
        typeface = Typeface.MONOSPACE
      }, LinearLayout.LayoutParams(0, WRAP, 1f))
      addView(actionButton(getString(R.string.mobile_diagnostics_clear)) {
        synchronized(records) { records.clear() }
        renderDestination(DESTINATION_NETWORK)
      })
    })

    val scroll = scrollingColumn()
    if (snapshot.isEmpty()) {
      scroll.column.addView(message(getString(R.string.mobile_diagnostics_no_requests)))
    }
    snapshot.forEach { record ->
      val request = record.mRequest
      val response = record.mResponse
      val method = request?.method ?: "HTTP"
      val statusCode = response?.status?.takeIf { it > 0 }
      val status = statusCode?.toString() ?: getString(R.string.mobile_diagnostics_pending)
      scroll.column.addView(cardContainer(clickable = true).apply {
        addView(LinearLayout(context).apply {
          gravity = Gravity.CENTER_VERTICAL
          orientation = LinearLayout.HORIZONTAL
          addView(badge(method, methodColor(method)))
          addView(TextView(context).apply {
            text = status
            textSize = 12f
            setTextColor(statusColor(statusCode))
            setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
            setPadding(dp(10), 0, 0, 0)
          })
        })
        addView(TextView(context).apply {
          text = request?.url.orEmpty()
          textSize = 12f
          setTextColor(PRIMARY_TEXT)
          typeface = Typeface.MONOSPACE
          setPadding(0, dp(9), 0, 0)
          maxLines = 3
          ellipsize = TextUtils.TruncateAt.END
        })
        setOnClickListener {
          showValueDialog(
            "$method  $status",
            buildString {
              append(request?.url.orEmpty())
              append("\n\n").append(getString(R.string.mobile_diagnostics_request_headers)).append('\n')
              append(request?.headers.orEmpty())
              append("\n\n").append(getString(R.string.mobile_diagnostics_request_body)).append('\n')
              append(request?.postData.orEmpty())
              append("\n\n").append(getString(R.string.mobile_diagnostics_response_headers)).append('\n')
              append(response?.headers.orEmpty())
              append("\n\n").append(getString(R.string.mobile_diagnostics_response_body)).append('\n')
              append(record.mResponseBody.orEmpty())
            },
          )
        }
      })
    }
    body.addView(scroll.view, LinearLayout.LayoutParams(MATCH, 0, 1f))
  }

  private fun renderOta() {
    val scroll = scrollingColumn()
    val controller = runCatching { UpdatesController.instance }.getOrNull()
    if (controller == null) {
      scroll.column.addView(message(getString(R.string.mobile_diagnostics_unavailable)))
      body.addView(scroll.view, LinearLayout.LayoutParams(MATCH, 0, 1f))
      return
    }

    val constants = controller.getConstantsForModule().toModuleConstantsMap()
    val commitTime = (constants["commitTime"] as? Number)?.toLong()
    val sourceBranch = MobileDiagnosticsUpdateInfo.sourceBranch(
      constants["manifestString"] as? String,
    )
    scroll.column.addView(cardContainer().apply {
      addView(TextView(context).apply {
        text = getString(R.string.mobile_diagnostics_current_build)
        textSize = 16f
        setTextColor(PRIMARY_TEXT)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(0, 0, 0, dp(4))
      })
      addView(runtimeInfoRow(R.string.mobile_diagnostics_branch, display(sourceBranch)))
      addView(runtimeInfoRow(R.string.mobile_diagnostics_update_id, display(constants["updateId"])))
      addView(runtimeInfoRow(
        R.string.mobile_diagnostics_published,
        commitTime?.let { DateFormat.getDateTimeInstance().format(Date(it)) } ?: "—",
      ))
      addView(runtimeInfoRow(R.string.mobile_diagnostics_channel, display(constants["channel"])))
      addView(runtimeInfoRow(R.string.mobile_diagnostics_runtime, display(constants["runtimeVersion"])))
      addView(runtimeInfoRow(
        R.string.mobile_diagnostics_source,
        getString(
          if (constants["isEmbeddedLaunch"] == true) {
            R.string.mobile_diagnostics_embedded
          } else {
            R.string.mobile_diagnostics_ota
          },
        ),
      ))
    })

    val status = TextView(this).apply {
      textSize = 12f
      setTextColor(MUTED_TEXT)
      gravity = Gravity.CENTER
      setPadding(dp(8), dp(12), dp(8), 0)
      visibility = View.GONE
    }
    scroll.column.addView(actionButton(
      getString(R.string.mobile_diagnostics_check_update),
      primary = true,
    ) {
      val button = it as TextView
      button.isEnabled = false
      button.alpha = 0.58f
      setStatus(status, getString(R.string.mobile_diagnostics_checking))
      scope.launch { checkAndApplyUpdate(controller, status, button) }
    }.apply {
      layoutParams = LinearLayout.LayoutParams(MATCH, dp(46)).apply { topMargin = dp(12) }
    })
    scroll.column.addView(status)
    body.addView(scroll.view, LinearLayout.LayoutParams(MATCH, 0, 1f))
  }

  private suspend fun checkAndApplyUpdate(
    controller: IUpdatesController,
    status: TextView,
    button: TextView,
  ) {
    runCatching {
      when (val check = controller.checkForUpdate()) {
        is IUpdatesController.CheckForUpdateResult.UpdateAvailable,
        is IUpdatesController.CheckForUpdateResult.RollBackToEmbedded -> {
          setStatus(status, getString(R.string.mobile_diagnostics_downloading))
          when (controller.fetchUpdate()) {
            is IUpdatesController.FetchUpdateResult.Success,
            is IUpdatesController.FetchUpdateResult.RollBackToEmbedded ->
              controller.relaunchReactApplicationForModule()
            is IUpdatesController.FetchUpdateResult.ErrorResult ->
              error(getString(R.string.mobile_diagnostics_download_failed))
            is IUpdatesController.FetchUpdateResult.Failure ->
              error(getString(R.string.mobile_diagnostics_download_failed))
          }
        }
        is IUpdatesController.CheckForUpdateResult.NoUpdateAvailable ->
          setStatus(status, getString(R.string.mobile_diagnostics_up_to_date))
        is IUpdatesController.CheckForUpdateResult.ErrorResult ->
          error(getString(R.string.mobile_diagnostics_check_failed))
      }
    }.onFailure {
      val error = it.message ?: getString(R.string.mobile_diagnostics_unavailable)
      setStatus(status, error)
      Toast.makeText(this, error, Toast.LENGTH_SHORT).show()
    }
    button.isEnabled = true
    button.alpha = 1f
  }

  private fun runtimeInfoRow(label: Int, value: String): View =
    LinearLayout(this).apply {
      gravity = Gravity.CENTER_VERTICAL
      orientation = LinearLayout.HORIZONTAL
      setPadding(0, dp(10), 0, dp(10))
      addView(TextView(context).apply {
        text = getString(label)
        textSize = 12f
        setTextColor(MUTED_TEXT)
      }, LinearLayout.LayoutParams(dp(92), WRAP))
      addView(TextView(context).apply {
        text = value
        textSize = 12f
        setTextColor(SECONDARY_TEXT)
        typeface = Typeface.MONOSPACE
        gravity = Gravity.END
        setTextIsSelectable(true)
      }, LinearLayout.LayoutParams(0, WRAP, 1f))
    }

  private fun scrollingColumn(): ScrollColumn {
    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), 0, dp(16), dp(36))
    }
    return ScrollColumn(ScrollView(this).apply {
      clipToPadding = false
      isFillViewport = true
      addView(column)
    }, column)
  }

  private fun cardContainer(clickable: Boolean = false) = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(dp(14), dp(13), dp(14), dp(13))
    background = if (clickable) {
      rippleBackground(RAISED, BORDER_MUTED, 12)
    } else {
      roundedBackground(RAISED, BORDER_MUTED, 12)
    }
    isClickable = clickable
    isFocusable = clickable
    layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = dp(8) }
  }

  private fun badge(value: String, color: Int) = TextView(this).apply {
    text = value.uppercase(Locale.ROOT)
    textSize = 10f
    setTextColor(Color.WHITE)
    setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
    gravity = Gravity.CENTER
    setPadding(dp(8), dp(3), dp(8), dp(3))
    background = roundedBackground(color, color, 5)
  }

  private fun actionButton(
    label: String,
    primary: Boolean = false,
    onClick: (View) -> Unit,
  ) = TextView(this).apply {
    text = label
    textSize = 12f
    gravity = Gravity.CENTER
    setTextColor(if (primary) PRIMARY_BUTTON_TEXT else ACCENT)
    setTypeface(typeface, Typeface.BOLD)
    setPadding(dp(14), dp(8), dp(14), dp(8))
    minimumHeight = dp(44)
    isClickable = true
    isFocusable = true
    background = rippleBackground(
      if (primary) ACCENT else RAISED,
      if (primary) ACCENT else BORDER,
      9,
    )
    setOnClickListener { onClick(it) }
  }

  private fun message(value: String) = TextView(this).apply {
    text = value
    textSize = 14f
    gravity = Gravity.CENTER
    setTextColor(MUTED_TEXT)
    setPadding(dp(12), dp(40), dp(12), dp(40))
  }

  private fun showValueDialog(title: String, value: String) {
    val content = TextView(this).apply {
      text = value
      textSize = 12f
      setTextColor(SECONDARY_TEXT)
      typeface = Typeface.MONOSPACE
      setTextIsSelectable(true)
      setPadding(dp(20), dp(8), dp(20), dp(20))
    }
    AlertDialog.Builder(this)
      .setTitle(title)
      .setView(ScrollView(this).apply { addView(content) })
      .setPositiveButton(android.R.string.ok, null)
      .show()
  }

  private fun setStatus(view: TextView, value: String) {
    view.text = value
    view.visibility = View.VISIBLE
  }

  private fun display(value: Any?): String = value?.toString()?.trim()
    ?.takeIf { it.isNotEmpty() && it != "null" } ?: "—"

  private fun roundedBackground(fill: Int, stroke: Int, radius: Int) =
    GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = dp(radius).toFloat()
      setColor(fill)
      setStroke(dp(1), stroke)
    }

  private fun rippleBackground(fill: Int, stroke: Int, radius: Int) =
    RippleDrawable(
      ColorStateList.valueOf(RIPPLE),
      roundedBackground(fill, stroke, radius),
      null,
    )

  private fun methodColor(method: String): Int = when (method.uppercase(Locale.ROOT)) {
    "GET" -> Color.rgb(29, 78, 216)
    "POST" -> Color.rgb(109, 40, 217)
    "PUT", "PATCH" -> Color.rgb(180, 83, 9)
    "DELETE" -> Color.rgb(185, 28, 28)
    else -> BORDER
  }

  private fun statusColor(status: Int?): Int = when {
    status != null && status in 200..299 -> ACCENT
    status != null && status in 300..399 -> Color.rgb(56, 189, 248)
    status != null && status in 400..499 -> Color.rgb(251, 191, 36)
    else -> DANGER
  }

  private fun finishAndRestorePanel() {
    MobileDiagnosticsDoKit.requestToolPanelRestore()
    finish()
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private data class ScrollColumn(val view: ScrollView, val column: LinearLayout)

  companion object {
    const val DESTINATION_NETWORK = "network"
    const val DESTINATION_STORAGE = "storage"
    const val DESTINATION_OTA = "ota"
    private const val EXTRA_DESTINATION = "mobileDiagnostics.destination"
    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
    private val SURFACE = Color.rgb(17, 24, 39)
    private val RAISED = Color.rgb(30, 41, 59)
    private val BORDER = Color.rgb(71, 85, 105)
    private val BORDER_MUTED = Color.rgb(51, 65, 85)
    private val PRIMARY_TEXT = Color.rgb(248, 250, 252)
    private val SECONDARY_TEXT = Color.rgb(203, 213, 225)
    private val MUTED_TEXT = Color.rgb(148, 163, 184)
    private val ACCENT = Color.rgb(34, 197, 94)
    private val DANGER = Color.rgb(252, 165, 165)
    private val RIPPLE = Color.argb(48, 255, 255, 255)
    private val PRIMARY_BUTTON_TEXT = Color.rgb(5, 46, 22)

    fun open(context: Context, destination: String) {
      context.startActivity(
        Intent(context, MobileDiagnosticsActivity::class.java)
          .putExtra(EXTRA_DESTINATION, destination),
      )
    }
  }
}
