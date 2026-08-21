package com.mobilediagnosticskit

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.didichuxing.doraemonkit.kit.network.NetworkManager
import expo.modules.updates.IUpdatesController
import expo.modules.updates.UpdatesController
import java.text.DateFormat
import java.util.Date
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
    window.statusBarColor = BACKGROUND
    window.navigationBarColor = BACKGROUND
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
      setBackgroundColor(BACKGROUND)
      setPadding(dp(16), dp(8), dp(16), dp(16))
    }
    val initialPadding = intArrayOf(
      root.paddingLeft,
      root.paddingTop,
      root.paddingRight,
      root.paddingBottom,
    )
    root.setOnApplyWindowInsetsListener { view, insets ->
      if (Build.VERSION.SDK_INT >= 30) {
        val safe = insets.getInsets(
          WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(),
        )
        view.setPadding(
          initialPadding[0] + safe.left,
          initialPadding[1] + safe.top,
          initialPadding[2] + safe.right,
          initialPadding[3] + safe.bottom,
        )
      } else {
        @Suppress("DEPRECATION")
        view.setPadding(
          initialPadding[0] + insets.systemWindowInsetLeft,
          initialPadding[1] + insets.systemWindowInsetTop,
          initialPadding[2] + insets.systemWindowInsetRight,
          initialPadding[3] + insets.systemWindowInsetBottom,
        )
      }
      insets
    }

    body = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
    }
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
    addView(Button(context).apply {
      text = getString(R.string.mobile_diagnostics_back)
      setOnClickListener { finishAndRestorePanel() }
    })
    addView(TextView(context).apply {
      text = title
      textSize = 22f
      setTextColor(Color.WHITE)
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
    entries.forEach { entry ->
      scroll.column.addView(card(entry.key, entry.value))
    }
    body.addView(scroll.view, LinearLayout.LayoutParams(MATCH, 0, 1f))
  }

  private fun renderNetwork() {
    val clear = Button(this).apply {
      text = getString(R.string.mobile_diagnostics_clear)
      setOnClickListener {
        val records = NetworkManager.get().records
        synchronized(records) { records.clear() }
        renderDestination(DESTINATION_NETWORK)
      }
    }
    body.addView(clear)

    val scroll = scrollingColumn()
    val records = NetworkManager.get().records
    val snapshot = synchronized(records) { records.toList().asReversed() }
    if (snapshot.isEmpty()) {
      scroll.column.addView(message(getString(R.string.mobile_diagnostics_no_requests)))
    }
    snapshot.forEach { record ->
      val request = record.mRequest
      val response = record.mResponse
      val summary = buildString {
        append(request?.method ?: "HTTP")
        append("  ")
        append(response?.status?.takeIf { it > 0 } ?: "Pending")
        append('\n')
        append(request?.url.orEmpty())
      }
      scroll.column.addView(card(summary, "").apply {
        setOnClickListener {
          AlertDialog.Builder(this@MobileDiagnosticsActivity)
            .setTitle(summary.lineSequence().first())
            .setMessage(
              buildString {
                append(request?.url.orEmpty())
                append("\n\nRequest headers\n")
                append(request?.headers.orEmpty())
                append("\n\nRequest body\n")
                append(request?.postData.orEmpty())
                append("\n\nResponse headers\n")
                append(response?.headers.orEmpty())
                append("\n\nResponse body\n")
                append(record.mResponseBody.orEmpty())
              },
            )
            .setPositiveButton(android.R.string.ok, null)
            .show()
        }
      })
    }
    body.addView(scroll.view, LinearLayout.LayoutParams(MATCH, 0, 1f))
  }

  private fun renderOta() {
    val status = TextView(this).apply {
      setTextColor(Color.WHITE)
      textSize = 15f
      setPadding(dp(4), dp(16), dp(4), dp(16))
    }
    val controller = runCatching { UpdatesController.instance }.getOrNull()
    if (controller == null) {
      status.text = getString(R.string.mobile_diagnostics_unavailable)
      body.addView(status)
      return
    }

    val constants = controller.getConstantsForModule().toModuleConstantsMap()
    val commitTime = (constants["commitTime"] as? Number)?.toLong()
    val sourceBranch = MobileDiagnosticsUpdateInfo.sourceBranch(
      constants["manifestString"] as? String,
    )
    status.text = buildString {
      append("Branch: ").append(sourceBranch ?: "—")
      append('\n')
      append("Update ID: ").append(constants["updateId"] ?: "Embedded build")
      append("\nPublished: ")
      append(commitTime?.let { DateFormat.getDateTimeInstance().format(Date(it)) } ?: "—")
      append("\nChannel: ").append(constants["channel"].toString().ifBlank { "—" })
      append("\nRuntime: ").append(constants["runtimeVersion"].toString().ifBlank { "—" })
      append("\nSource: ")
      append(if (constants["isEmbeddedLaunch"] == true) "Embedded" else "OTA")
    }
    body.addView(status)
    body.addView(Button(this).apply {
      text = getString(R.string.mobile_diagnostics_check_update)
      setOnClickListener {
        isEnabled = false
        status.append("\n\nChecking…")
        scope.launch { checkAndApplyUpdate(controller, status, this@apply) }
      }
    })
  }

  private suspend fun checkAndApplyUpdate(
    controller: IUpdatesController,
    status: TextView,
    button: Button,
  ) {
    runCatching {
      when (val check = controller.checkForUpdate()) {
        is IUpdatesController.CheckForUpdateResult.UpdateAvailable,
        is IUpdatesController.CheckForUpdateResult.RollBackToEmbedded -> {
          status.append("\nDownloading…")
          when (controller.fetchUpdate()) {
            is IUpdatesController.FetchUpdateResult.Success,
            is IUpdatesController.FetchUpdateResult.RollBackToEmbedded ->
              controller.relaunchReactApplicationForModule()
            is IUpdatesController.FetchUpdateResult.ErrorResult ->
              error("Update download failed")
            is IUpdatesController.FetchUpdateResult.Failure ->
              error("Update download failed")
          }
        }
        is IUpdatesController.CheckForUpdateResult.NoUpdateAvailable ->
          status.append("\nAlready up to date")
        is IUpdatesController.CheckForUpdateResult.ErrorResult ->
          error("Update check failed")
      }
    }.onFailure {
      status.append("\n${it.message ?: getString(R.string.mobile_diagnostics_unavailable)}")
      Toast.makeText(this, it.message, Toast.LENGTH_SHORT).show()
    }
    button.isEnabled = true
  }

  private fun scrollingColumn(): ScrollColumn {
    val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    return ScrollColumn(ScrollView(this).apply { addView(column) }, column)
  }

  private fun message(value: String) = TextView(this).apply {
    text = value
    textSize = 15f
    setTextColor(SECONDARY_TEXT)
    setPadding(dp(4), dp(24), dp(4), dp(24))
  }

  private fun card(title: String, value: String) = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(dp(14), dp(12), dp(14), dp(12))
    setBackgroundColor(CARD)
    addView(TextView(context).apply {
      text = title
      textSize = 15f
      setTextColor(Color.WHITE)
      setTypeface(typeface, Typeface.BOLD)
      setTextIsSelectable(true)
    })
    if (value.isNotEmpty()) addView(TextView(context).apply {
      text = value
      textSize = 13f
      setTextColor(SECONDARY_TEXT)
      setPadding(0, dp(8), 0, 0)
      setTextIsSelectable(true)
    })
    layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply {
      topMargin = dp(8)
    }
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
    private val BACKGROUND = Color.rgb(15, 23, 42)
    private val CARD = Color.rgb(30, 41, 59)
    private val SECONDARY_TEXT = Color.rgb(203, 213, 225)

    fun open(context: Context, destination: String) {
      context.startActivity(
        Intent(context, MobileDiagnosticsActivity::class.java)
          .putExtra(EXTRA_DESTINATION, destination),
      )
    }
  }
}
