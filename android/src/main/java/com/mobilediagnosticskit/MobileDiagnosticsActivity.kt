package com.mobilediagnosticskit

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextUtils
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import com.didichuxing.doraemonkit.kit.network.NetworkManager
import com.didichuxing.doraemonkit.kit.network.bean.NetworkRecord
import expo.modules.updates.IUpdatesController
import expo.modules.updates.UpdatesController
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

class MobileDiagnosticsActivity : Activity() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
  private val mainHandler = Handler(Looper.getMainLooper())
  private lateinit var body: LinearLayout
  private var currentDestination = DESTINATION_STORAGE
  private var isResumed = false

  private var storageQuery = ""
  private var selectedStorageKey: String? = null

  private var networkQuery = ""
  private var networkFilter = FILTER_ALL
  private var selectedNetworkRecord: NetworkRecord? = null
  private var networkRequestMetric: TextView? = null
  private var networkErrorMetric: TextView? = null
  private var networkReceivedMetric: TextView? = null
  private var networkShowing: TextView? = null
  private var networkRecordsContainer: LinearLayout? = null
  private val networkFilterButtons = linkedMapOf<String, TextView>()

  private val networkRefreshRunnable = object : Runnable {
    override fun run() {
      if (!isResumed || currentDestination != DESTINATION_NETWORK || selectedNetworkRecord != null) {
        return
      }
      refreshNetworkContent()
      mainHandler.postDelayed(this, NETWORK_REFRESH_INTERVAL_MS)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.statusBarColor = SURFACE
    window.navigationBarColor = SURFACE
    setContentView(createScreen())
    renderDestination(intent.getStringExtra(EXTRA_DESTINATION) ?: DESTINATION_STORAGE)
  }

  override fun onResume() {
    super.onResume()
    isResumed = true
    scheduleNetworkRefresh()
  }

  override fun onPause() {
    isResumed = false
    mainHandler.removeCallbacks(networkRefreshRunnable)
    super.onPause()
  }

  @Deprecated("Deprecated in Android")
  override fun onBackPressed() {
    if (selectedNetworkRecord != null) {
      renderDestination(DESTINATION_NETWORK)
    } else {
      finishAndRestorePanel()
    }
  }

  override fun onDestroy() {
    mainHandler.removeCallbacks(networkRefreshRunnable)
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
    currentDestination = destination
    selectedNetworkRecord = null
    clearNetworkBindings()
    mainHandler.removeCallbacks(networkRefreshRunnable)
    body.removeAllViews()
    body.addView(header(destinationTitle(destination)))
    when (destination) {
      DESTINATION_NETWORK -> renderNetwork()
      DESTINATION_OTA -> renderOta()
      else -> renderStorage()
    }
    scheduleNetworkRefresh()
  }

  private fun destinationTitle(destination: String): String = when (destination) {
    DESTINATION_NETWORK -> getString(R.string.mobile_diagnostics_network)
    DESTINATION_OTA -> getString(R.string.mobile_diagnostics_expo_update)
    else -> getString(R.string.mobile_diagnostics_local_state)
  }

  private fun header(title: String): View = LinearLayout(this).apply {
    gravity = Gravity.CENTER_VERTICAL
    orientation = LinearLayout.HORIZONTAL
    setPadding(dp(18), dp(12), dp(18), dp(12))
    minimumHeight = dp(72)
    addView(TextView(context).apply {
      text = "‹"
      textSize = 32f
      gravity = Gravity.CENTER
      setTextColor(SECONDARY_TEXT)
      contentDescription = getString(R.string.mobile_diagnostics_back)
      isClickable = true
      isFocusable = true
      background = rippleBackground(RAISED, RAISED, 24)
      setOnClickListener { finishAndRestorePanel() }
    }, LinearLayout.LayoutParams(dp(44), dp(44)))
    addView(LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), 0, 0, 0)
      addView(TextView(context).apply {
        text = getString(R.string.mobile_diagnostics_eyebrow)
        textSize = 10f
        setTextColor(ACCENT)
        setTypeface(typeface, Typeface.BOLD)
      })
      addView(TextView(context).apply {
        text = title
        textSize = 22f
        setTextColor(PRIMARY_TEXT)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(0, dp(2), 0, 0)
      })
    }, LinearLayout.LayoutParams(0, WRAP, 1f))
  }

  private fun renderStorage() {
    val scroll = scrollingColumn()
    val entries = runCatching { MobileDiagnosticsStorage.readDefault(this) }
      .getOrElse {
        scroll.column.addView(message(getString(R.string.mobile_diagnostics_unavailable)))
        emptyList()
      }
    if (entries.none { it.key == selectedStorageKey }) selectedStorageKey = null

    scroll.column.addView(infoCard(
      getString(R.string.mobile_diagnostics_storage_security_title),
      getString(R.string.mobile_diagnostics_storage_security_body),
    ))
    scroll.column.addView(searchField(
      getString(R.string.mobile_diagnostics_storage_search),
      storageQuery,
    ) { query ->
      storageQuery = query
      updateStorageList(entries, storageList, scroll.view)
    }.withTopMargin(10))

    storageList = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    scroll.column.addView(storageList)
    updateStorageList(entries, storageList, scroll.view)
    body.addView(scroll.view, LinearLayout.LayoutParams(MATCH, 0, 1f))
  }

  private lateinit var storageList: LinearLayout

  private fun filterStorageEntries(
    entries: List<MobileDiagnosticsStorageEntry>,
    query: String,
  ): List<MobileDiagnosticsStorageEntry> {
    val needle = query.trim().lowercase(Locale.ROOT)
    return if (needle.isEmpty()) entries else entries.filter { entry ->
      entry.key.lowercase(Locale.ROOT).contains(needle) ||
        entry.value.lowercase(Locale.ROOT).contains(needle)
    }
  }

  private fun updateStorageList(
    entries: List<MobileDiagnosticsStorageEntry>,
    container: LinearLayout,
    scrollView: ScrollView,
  ) {
    container.removeAllViews()
    val filtered = filterStorageEntries(entries, storageQuery)
    if (filtered.isEmpty()) {
      container.addView(emptyState(
        getString(R.string.mobile_diagnostics_storage_empty_title),
        getString(R.string.mobile_diagnostics_storage_empty_body),
      ))
    } else {
      filtered.forEach { entry ->
        container.addView(storageCard(entry, entry.key == selectedStorageKey) {
          selectedStorageKey = entry.key
          updateStorageList(entries, container, scrollView)
          scrollView.post { scrollView.smoothScrollTo(0, container.bottom) }
        })
      }
    }
    entries.firstOrNull { it.key == selectedStorageKey }?.let { entry ->
      container.addView(renderStorageDetail(entry))
    }
  }

  private fun storageCard(
    entry: MobileDiagnosticsStorageEntry,
    selected: Boolean,
    onClick: () -> Unit,
  ): View = cardContainer(clickable = true, radius = 12).apply {
    if (selected) background = rippleBackground(RAISED_ACTIVE, ACCENT, 12)
    minimumHeight = dp(74)
    addView(LinearLayout(context).apply {
      gravity = Gravity.CENTER_VERTICAL
      orientation = LinearLayout.HORIZONTAL
      addView(TextView(context).apply {
        text = entry.key
        textSize = 15f
        setTextColor(PRIMARY_TEXT)
        setTypeface(typeface, Typeface.BOLD)
        maxLines = 2
        ellipsize = TextUtils.TruncateAt.END
      }, LinearLayout.LayoutParams(0, WRAP, 1f))
      addView(TextView(context).apply {
        text = storageKind(entry.value).uppercase(Locale.ROOT)
        textSize = 10f
        setTextColor(ACCENT)
        typeface = Typeface.MONOSPACE
        setPadding(dp(8), 0, 0, 0)
      })
    })
    addView(TextView(context).apply {
      text = compactPreview(entry.value)
      textSize = 11f
      setTextColor(SECONDARY_TEXT)
      typeface = Typeface.MONOSPACE
      setPadding(0, dp(8), 0, 0)
      maxLines = 3
      ellipsize = TextUtils.TruncateAt.END
    })
    setOnClickListener { onClick() }
  }

  private fun renderStorageDetail(entry: MobileDiagnosticsStorageEntry): View =
    cardContainer(fill = BACKGROUND, radius = 14).apply {
      setPadding(dp(13), dp(13), dp(13), dp(13))
      addView(LinearLayout(context).apply {
        gravity = Gravity.CENTER_VERTICAL
        orientation = LinearLayout.HORIZONTAL
        addView(LinearLayout(context).apply {
          orientation = LinearLayout.VERTICAL
          addView(TextView(context).apply {
            text = getString(R.string.mobile_diagnostics_storage_detail_title)
            textSize = 17f
            setTextColor(PRIMARY_TEXT)
            setTypeface(typeface, Typeface.BOLD)
          })
          addView(TextView(context).apply {
            text = entry.key
            textSize = 10f
            setTextColor(MUTED_TEXT)
            typeface = Typeface.MONOSPACE
            setPadding(0, dp(3), 0, 0)
          })
        }, LinearLayout.LayoutParams(0, WRAP, 1f))
        addView(actionButton(getString(R.string.mobile_diagnostics_refresh)) {
          renderDestination(DESTINATION_STORAGE)
        })
      })
      addView(TextView(context).apply {
        text = getString(R.string.mobile_diagnostics_storage_read_only)
        textSize = 12f
        setTextColor(SECONDARY_TEXT)
        setPadding(0, dp(11), 0, dp(4))
      })
      addStorageValueRows(this, entry.value)
    }

  private fun addStorageValueRows(container: LinearLayout, rawValue: String) {
    val parsed = runCatching { JSONTokener(rawValue).nextValue() }.getOrNull()
    if (parsed is JSONObject) {
      val keys = parsed.keys().asSequence().toList().sorted()
      if (keys.isEmpty()) {
        container.addView(message(getString(R.string.mobile_diagnostics_no_state)))
      } else {
        keys.forEach { key ->
          container.addView(fieldRow(key, prettyJsonValue(parsed.opt(key))))
        }
      }
    } else {
      container.addView(fieldRow(
        getString(R.string.mobile_diagnostics_value),
        prettyJsonValue(parsed ?: rawValue),
      ))
    }
  }

  private fun fieldRow(name: String, value: String): View = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    addView(LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(9), 0, dp(9))
      addView(TextView(context).apply {
        text = name
        textSize = 12f
        setTextColor(PRIMARY_TEXT)
        setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
        setTextIsSelectable(true)
      })
      addView(TextView(context).apply {
        text = value
        textSize = 11f
        setTextColor(SECONDARY_TEXT)
        typeface = Typeface.MONOSPACE
        setTextIsSelectable(true)
        setPadding(0, dp(4), 0, 0)
      })
    })
    addView(divider())
  }

  private fun storageKind(rawValue: String): String = when (
    runCatching { JSONTokener(rawValue).nextValue() }.getOrNull()
  ) {
    is JSONObject -> "object"
    is JSONArray -> "array"
    is Boolean -> "boolean"
    is Number -> "number"
    else -> "string"
  }

  private fun renderNetwork() {
    val scroll = scrollingColumn()
    scroll.column.addView(networkMetricsCard())
    scroll.column.addView(LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      addView(actionButton(getString(R.string.mobile_diagnostics_refresh)) {
        refreshNetworkContent()
      }, LinearLayout.LayoutParams(0, dp(44), 1f).apply { marginEnd = dp(4) })
      addView(actionButton(
        getString(R.string.mobile_diagnostics_clear),
        danger = true,
      ) {
        confirmClearRequests()
      }, LinearLayout.LayoutParams(0, dp(44), 1f).apply { marginStart = dp(4) })
    }.withTopMargin(10))
    scroll.column.addView(searchField(
      getString(R.string.mobile_diagnostics_network_search),
      networkQuery,
    ) { query ->
      networkQuery = query
      refreshNetworkContent()
    }.withTopMargin(10))
    scroll.column.addView(networkFilterStrip().withTopMargin(10))
    networkShowing = TextView(this).apply {
      textSize = 10f
      setTextColor(MUTED_TEXT)
      typeface = Typeface.MONOSPACE
      setPadding(0, dp(10), 0, 0)
    }
    scroll.column.addView(networkShowing)
    networkRecordsContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    scroll.column.addView(networkRecordsContainer)
    refreshNetworkContent()
    body.addView(scroll.view, LinearLayout.LayoutParams(MATCH, 0, 1f))
  }

  private fun networkMetricsCard(): View = LinearLayout(this).apply {
    gravity = Gravity.CENTER_VERTICAL
    orientation = LinearLayout.HORIZONTAL
    minimumHeight = dp(70)
    setPadding(dp(8), dp(8), dp(8), dp(8))
    background = roundedBackground(BACKGROUND, BORDER_MUTED, 8)
    networkRequestMetric = metricColumn(
      getString(R.string.mobile_diagnostics_network_requests),
    ).also { addView(it.first, equalWeightParams()) }.second
    networkErrorMetric = metricColumn(
      getString(R.string.mobile_diagnostics_network_errors),
      error = true,
    ).also { addView(it.first, equalWeightParams()) }.second
    networkReceivedMetric = metricColumn(
      getString(R.string.mobile_diagnostics_network_received),
    ).also { addView(it.first, equalWeightParams()) }.second
    addView(LinearLayout(context).apply {
      gravity = Gravity.CENTER
      orientation = LinearLayout.VERTICAL
      @Suppress("DEPRECATION")
      addView(Switch(context).apply {
        contentDescription = getString(R.string.mobile_diagnostics_network_capture)
        isChecked = NetworkManager.isActive()
        thumbTintList = ColorStateList(
          arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
          intArrayOf(Color.WHITE, SECONDARY_TEXT),
        )
        trackTintList = ColorStateList(
          arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
          intArrayOf(ACCENT, BORDER),
        )
        setOnCheckedChangeListener { _, enabled ->
          runCatching {
            if (enabled) NetworkManager.get().startMonitor()
            else NetworkManager.get().stopMonitor()
          }.onFailure {
            Toast.makeText(
              this@MobileDiagnosticsActivity,
              getString(R.string.mobile_diagnostics_unavailable),
              Toast.LENGTH_SHORT,
            ).show()
          }
          refreshNetworkContent()
        }
      })
      addView(TextView(context).apply {
        text = getString(R.string.mobile_diagnostics_network_capture)
        textSize = 10f
        setTextColor(MUTED_TEXT)
        setTypeface(typeface, Typeface.BOLD)
      })
    }, equalWeightParams())
  }

  private fun metricColumn(label: String, error: Boolean = false): Pair<View, TextView> {
    val value = TextView(this).apply {
      text = "0"
      textSize = 15f
      setTextColor(if (error) DANGER else PRIMARY_TEXT)
      setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
      gravity = Gravity.CENTER
    }
    val column = LinearLayout(this).apply {
      gravity = Gravity.CENTER
      orientation = LinearLayout.VERTICAL
      addView(value)
      addView(TextView(context).apply {
        text = label
        textSize = 10f
        setTextColor(MUTED_TEXT)
        setTypeface(typeface, Typeface.BOLD)
        gravity = Gravity.CENTER
        setPadding(0, dp(3), 0, 0)
      })
    }
    return column to value
  }

  private fun networkFilterStrip(): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(3), dp(3), dp(3), dp(3))
      background = roundedBackground(BACKGROUND, BACKGROUND, 7)
    }
    networkFilterButtons.clear()
    networkFilters().forEach { (filter, label) ->
      val button = TextView(this).apply {
        text = label
        textSize = 12f
        gravity = Gravity.CENTER
        setTypeface(typeface, Typeface.BOLD)
        minimumHeight = dp(36)
        minWidth = dp(58)
        setPadding(dp(12), 0, dp(12), 0)
        isClickable = true
        isFocusable = true
        setOnClickListener {
          networkFilter = filter
          updateNetworkFilterStyles()
          refreshNetworkContent()
        }
      }
      networkFilterButtons[filter] = button
      row.addView(button)
    }
    updateNetworkFilterStyles()
    return HorizontalScrollView(this).apply {
      isHorizontalScrollBarEnabled = false
      addView(row)
    }
  }

  private fun networkFilters(): List<Pair<String, String>> = listOf(
    FILTER_ALL to getString(R.string.mobile_diagnostics_filter_all),
    FILTER_FETCH to getString(R.string.mobile_diagnostics_filter_fetch),
    FILTER_IMAGE to getString(R.string.mobile_diagnostics_filter_image),
    FILTER_MEDIA to getString(R.string.mobile_diagnostics_filter_media),
    FILTER_OTHER to getString(R.string.mobile_diagnostics_filter_other),
    FILTER_ERRORS to getString(R.string.mobile_diagnostics_filter_errors),
  )

  private fun updateNetworkFilterStyles() {
    networkFilterButtons.forEach { (filter, button) ->
      val active = filter == networkFilter
      button.setTextColor(if (active) PRIMARY_TEXT else MUTED_TEXT)
      button.background = roundedBackground(
        if (active) RAISED_ACTIVE else BACKGROUND,
        if (active) RAISED_ACTIVE else BACKGROUND,
        5,
      )
    }
  }

  private fun refreshNetworkContent() {
    val container = networkRecordsContainer ?: return
    val records = NetworkManager.get().records
    val snapshot = synchronized(records) { records.toList().asReversed() }
    val filtered = filterNetworkRecords(snapshot, networkFilter, networkQuery)
    val errors = snapshot.count(::isNetworkError)
    val received = snapshot.sumOf { it.responseLength.toLong().coerceAtLeast(0L) }

    networkRequestMetric?.text = snapshot.size.toString()
    networkErrorMetric?.text = errors.toString()
    networkReceivedMetric?.text = formatBytes(received)
    networkShowing?.text = getString(
      R.string.mobile_diagnostics_network_showing,
      filtered.size,
      snapshot.size,
    )
    container.removeAllViews()
    if (filtered.isEmpty()) {
      container.addView(emptyState(
        getString(R.string.mobile_diagnostics_no_requests),
        getString(R.string.mobile_diagnostics_no_requests_body),
      ))
    } else {
      filtered.forEach { record -> container.addView(networkRequestCard(record)) }
    }
  }

  private fun filterNetworkRecords(
    records: List<NetworkRecord>,
    filter: String,
    query: String,
  ): List<NetworkRecord> {
    val needle = query.trim().lowercase(Locale.ROOT)
    return records.filter { record ->
      val matchesType = when (filter) {
        FILTER_ERRORS -> isNetworkError(record)
        FILTER_ALL -> true
        else -> networkResourceType(record) == filter
      }
      if (!matchesType) return@filter false
      if (needle.isEmpty()) return@filter true
      val request = record.mRequest
      val response = record.mResponse
      listOf(
        request?.url,
        request?.method,
        response?.status?.toString(),
        response?.mimeType,
        networkResourceType(record),
      ).joinToString(" ").lowercase(Locale.ROOT).contains(needle)
    }
  }

  private fun networkResourceType(record: NetworkRecord): String {
    val request = record.mRequest
    val mime = record.mResponse?.mimeType.orEmpty().lowercase(Locale.ROOT)
    val urlWithoutQuery = request?.url.orEmpty().substringBefore('?')
    if (mime.startsWith("image/") || IMAGE_EXTENSION.containsMatchIn(urlWithoutQuery)) {
      return FILTER_IMAGE
    }
    if (
      mime.startsWith("video/") ||
      mime.startsWith("audio/") ||
      MEDIA_EXTENSION.containsMatchIn(urlWithoutQuery)
    ) {
      return FILTER_MEDIA
    }
    if (
      mime.contains("json") ||
      mime.startsWith("text/") ||
      mime.contains("xml") ||
      FETCH_METHODS.contains(request?.method.orEmpty().uppercase(Locale.ROOT))
    ) {
      return FILTER_FETCH
    }
    return FILTER_OTHER
  }

  private fun isNetworkError(record: NetworkRecord): Boolean {
    val status = record.mResponse?.status ?: return true
    return status <= 0 || status >= 400
  }

  private fun networkRequestCard(record: NetworkRecord): View {
    val request = record.mRequest
    val method = request?.method.orEmpty().ifBlank { "HTTP" }
    val statusCode = record.mResponse?.status?.takeIf { it > 0 }
    val status = statusCode?.toString() ?: getString(R.string.mobile_diagnostics_pending)
    val uri = runCatching { Uri.parse(request?.url.orEmpty()) }.getOrNull()
    val host = uri?.host.orEmpty()
    val path = uri?.encodedPath.orEmpty().ifBlank { "/" }
    return cardContainer(clickable = true, radius = 8).apply {
      minimumHeight = dp(82)
      setPadding(dp(12), dp(12), dp(12), dp(12))
      addView(LinearLayout(context).apply {
        gravity = Gravity.CENTER_VERTICAL
        orientation = LinearLayout.HORIZONTAL
        addView(badge(method, methodColor(method)))
        addView(TextView(context).apply {
          text = status
          textSize = 12f
          setTextColor(statusColor(statusCode))
          setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
          setPadding(dp(8), 0, 0, 0)
        })
        addView(TextView(context).apply {
          text = host
          textSize = 11f
          setTextColor(MUTED_TEXT)
          gravity = Gravity.END
          maxLines = 1
          ellipsize = TextUtils.TruncateAt.END
          setPadding(dp(8), 0, 0, 0)
        }, LinearLayout.LayoutParams(0, WRAP, 1f))
      })
      addView(TextView(context).apply {
        text = path
        textSize = 13f
        setTextColor(PRIMARY_TEXT)
        setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
        setPadding(0, dp(7), 0, 0)
        maxLines = 2
        ellipsize = TextUtils.TruncateAt.END
      })
      addView(TextView(context).apply {
        text = getString(
          R.string.mobile_diagnostics_network_metadata,
          formatDuration((record.endTime - record.startTime).coerceAtLeast(0)),
          formatBytes(record.responseLength.toLong()),
        )
        textSize = 10f
        setTextColor(MUTED_TEXT)
        typeface = Typeface.MONOSPACE
        setPadding(0, dp(6), 0, 0)
      })
      contentDescription = "$method $path, $status, $host"
      setOnClickListener { renderNetworkDetail(record) }
    }
  }

  private fun renderNetworkDetail(record: NetworkRecord, responseTab: Boolean = false) {
    currentDestination = DESTINATION_NETWORK
    selectedNetworkRecord = record
    clearNetworkBindings()
    mainHandler.removeCallbacks(networkRefreshRunnable)
    body.removeAllViews()
    body.addView(header(destinationTitle(DESTINATION_NETWORK)))

    val detailRoot = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    detailRoot.addView(LinearLayout(this).apply {
      gravity = Gravity.CENTER_VERTICAL
      orientation = LinearLayout.HORIZONTAL
      minimumHeight = dp(52)
      setPadding(dp(16), dp(4), dp(16), dp(4))
      setBackgroundColor(SURFACE)
      addView(TextView(context).apply {
        text = "‹"
        textSize = 25f
        gravity = Gravity.CENTER
        setTextColor(SECONDARY_TEXT)
        contentDescription = getString(R.string.mobile_diagnostics_back_to_requests)
        isClickable = true
        isFocusable = true
        background = rippleBackground(RAISED, RAISED, 22)
        setOnClickListener { renderDestination(DESTINATION_NETWORK) }
      }, LinearLayout.LayoutParams(dp(44), dp(44)))
      addView(TextView(context).apply {
        text = getString(R.string.mobile_diagnostics_request_details)
        textSize = 16f
        setTextColor(PRIMARY_TEXT)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(dp(8), 0, 0, 0)
      }, LinearLayout.LayoutParams(0, WRAP, 1f))
    })
    detailRoot.addView(divider())

    val scroll = scrollingColumn(topPadding = 8)
    scroll.column.addView(networkSummaryCard(record))
    scroll.column.addView(networkDetailTabs(record, responseTab).withTopMargin(10))
    if (responseTab) addResponseSections(scroll.column, record)
    else addRequestSections(scroll.column, record)
    detailRoot.addView(scroll.view, LinearLayout.LayoutParams(MATCH, 0, 1f))
    body.addView(detailRoot, LinearLayout.LayoutParams(MATCH, 0, 1f))
  }

  private fun networkSummaryCard(record: NetworkRecord): View {
    val request = record.mRequest
    val method = request?.method.orEmpty().ifBlank { "HTTP" }
    val statusCode = record.mResponse?.status?.takeIf { it > 0 }
    val status = statusCode?.toString() ?: getString(R.string.mobile_diagnostics_pending)
    return cardContainer(fill = BACKGROUND, radius = 8, topMargin = 0).apply {
      setPadding(dp(12), dp(12), dp(12), dp(12))
      addView(LinearLayout(context).apply {
        gravity = Gravity.CENTER_VERTICAL
        orientation = LinearLayout.HORIZONTAL
        addView(badge(method, methodColor(method)))
        addView(TextView(context).apply {
          text = status
          textSize = 12f
          setTextColor(statusColor(statusCode))
          setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
          setPadding(dp(8), 0, 0, 0)
        })
        addView(View(context), LinearLayout.LayoutParams(0, 1, 1f))
        addView(actionButton(getString(R.string.mobile_diagnostics_copy_curl)) {
          copyToClipboard(createCurlCommand(record))
        }, LinearLayout.LayoutParams(WRAP, dp(36)).apply { marginStart = dp(8) })
      })
      addView(TextView(context).apply {
        text = request?.url.orEmpty()
        textSize = 11f
        setTextColor(SECONDARY_TEXT)
        typeface = Typeface.MONOSPACE
        setTextIsSelectable(true)
        setPadding(0, dp(10), 0, 0)
      })
    }
  }

  private fun networkDetailTabs(record: NetworkRecord, responseTab: Boolean): View =
    LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(3), dp(3), dp(3), dp(3))
      background = roundedBackground(BACKGROUND, BACKGROUND, 7)
      addView(detailTabButton(
        getString(R.string.mobile_diagnostics_request_tab),
        !responseTab,
      ) { renderNetworkDetail(record, false) }, equalWeightParams(height = 40))
      addView(detailTabButton(
        getString(R.string.mobile_diagnostics_response_tab),
        responseTab,
      ) { renderNetworkDetail(record, true) }, equalWeightParams(height = 40))
    }

  private fun detailTabButton(label: String, active: Boolean, onClick: () -> Unit): View =
    TextView(this).apply {
      text = label
      textSize = 12f
      gravity = Gravity.CENTER
      setTextColor(if (active) PRIMARY_TEXT else MUTED_TEXT)
      setTypeface(typeface, Typeface.BOLD)
      background = roundedBackground(
        if (active) RAISED_ACTIVE else BACKGROUND,
        if (active) RAISED_ACTIVE else BACKGROUND,
        5,
      )
      isClickable = true
      isFocusable = true
      setOnClickListener { onClick() }
    }

  private fun addRequestSections(container: LinearLayout, record: NetworkRecord) {
    val request = record.mRequest
    val duration = (record.endTime - record.startTime).coerceAtLeast(0)
    container.addView(collapsibleSection(
      getString(R.string.mobile_diagnostics_general),
      initiallyExpanded = true,
      content = keyValueRows(listOf(
        getString(R.string.mobile_diagnostics_request_url) to request?.url.orEmpty(),
        getString(R.string.mobile_diagnostics_method) to request?.method.orEmpty(),
        getString(R.string.mobile_diagnostics_started) to formatStartTime(record.startTime),
        getString(R.string.mobile_diagnostics_duration) to formatDuration(duration),
        getString(R.string.mobile_diagnostics_transferred) to getString(
          R.string.mobile_diagnostics_transfer_value,
          formatBytes(record.requestLength.toLong()),
          formatBytes(record.responseLength.toLong()),
        ),
      )),
    ).withTopMargin(10))
    container.addView(collapsibleSection(
      getString(R.string.mobile_diagnostics_request_headers),
      content = headersContent(request?.headers),
    ).withTopMargin(10))
    container.addView(collapsibleSection(
      getString(R.string.mobile_diagnostics_payload),
      initiallyExpanded = true,
      content = bodyContent(
        request?.postData.orEmpty(),
        binary = false,
        byteCount = record.requestLength.toLong(),
      ),
    ).withTopMargin(10))
  }

  private fun addResponseSections(container: LinearLayout, record: NetworkRecord) {
    val response = record.mResponse
    val duration = (record.endTime - record.startTime).coerceAtLeast(0)
    container.addView(collapsibleSection(
      getString(R.string.mobile_diagnostics_general),
      initiallyExpanded = true,
      content = keyValueRows(listOf(
        getString(R.string.mobile_diagnostics_status) to
          (response?.status?.takeIf { it > 0 }?.toString()
            ?: getString(R.string.mobile_diagnostics_pending)),
        getString(R.string.mobile_diagnostics_content_type) to
          response?.mimeType.orEmpty().ifBlank { "—" },
        getString(R.string.mobile_diagnostics_duration) to formatDuration(duration),
        getString(R.string.mobile_diagnostics_received) to
          formatBytes(record.responseLength.toLong()),
      )),
    ).withTopMargin(10))
    container.addView(collapsibleSection(
      getString(R.string.mobile_diagnostics_response_headers),
      content = headersContent(response?.headers),
    ).withTopMargin(10))
    container.addView(collapsibleSection(
      getString(R.string.mobile_diagnostics_response_body),
      initiallyExpanded = true,
      content = bodyContent(
        record.mResponseBody.orEmpty(),
        binary = record.mResponseBody.isNullOrEmpty() && record.responseLength.toLong() > 0L,
        byteCount = record.responseLength.toLong(),
      ),
    ).withTopMargin(10))
  }

  private fun collapsibleSection(
    title: String,
    initiallyExpanded: Boolean = false,
    content: View,
  ): View = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    background = roundedBackground(BACKGROUND, BORDER_MUTED, 8)
    val indicator = TextView(context).apply {
      text = if (initiallyExpanded) "−" else "+"
      textSize = 16f
      setTextColor(MUTED_TEXT)
      typeface = Typeface.MONOSPACE
    }
    val header = LinearLayout(context).apply {
      gravity = Gravity.CENTER_VERTICAL
      orientation = LinearLayout.HORIZONTAL
      minimumHeight = dp(44)
      setPadding(dp(12), 0, dp(12), 0)
      isClickable = true
      isFocusable = true
      addView(TextView(context).apply {
        text = title
        textSize = 12f
        setTextColor(PRIMARY_TEXT)
        setTypeface(typeface, Typeface.BOLD)
      }, LinearLayout.LayoutParams(0, WRAP, 1f))
      addView(indicator)
      setOnClickListener {
        val expanded = content.visibility != View.VISIBLE
        content.visibility = if (expanded) View.VISIBLE else View.GONE
        indicator.text = if (expanded) "−" else "+"
      }
    }
    addView(header)
    content.visibility = if (initiallyExpanded) View.VISIBLE else View.GONE
    addView(content)
  }

  private fun headersContent(rawHeaders: String?): View {
    val pairs = headerPairs(rawHeaders)
    return if (pairs.isEmpty()) {
      TextView(this).apply {
        text = getString(R.string.mobile_diagnostics_no_headers)
        textSize = 11f
        setTextColor(MUTED_TEXT)
        setPadding(dp(12), dp(12), dp(12), dp(12))
      }
    } else {
      keyValueRows(pairs)
    }
  }

  private fun headerPairs(rawHeaders: String?): List<Pair<String, String>> {
    val raw = rawHeaders?.trim().orEmpty()
    if (raw.isEmpty()) return emptyList()
    if (raw.startsWith("{") && raw.endsWith("}")) {
      runCatching { JSONObject(raw) }.getOrNull()?.let { json ->
        return json.keys().asSequence().toList().sorted().map { name ->
          name to json.opt(name).toString()
        }
      }
    }
    return raw.lineSequence().filter { it.isNotBlank() }.map { line ->
      val separator = line.indexOf(':')
      if (separator > 0) line.substring(0, separator).trim() to line.substring(separator + 1).trim()
      else getString(R.string.mobile_diagnostics_header) to line.trim()
    }.toList()
  }

  private fun keyValueRows(rows: List<Pair<String, String>>): View =
    LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), 0, dp(12), 0)
      rows.forEach { (name, value) ->
        addView(LinearLayout(context).apply {
          orientation = LinearLayout.VERTICAL
          setPadding(0, dp(9), 0, dp(9))
          addView(TextView(context).apply {
            text = name
            textSize = 10f
            setTextColor(NETWORK_BLUE)
            setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
            setTextIsSelectable(true)
          })
          addView(TextView(context).apply {
            text = value.ifBlank { "—" }
            textSize = 11f
            setTextColor(SECONDARY_TEXT)
            typeface = Typeface.MONOSPACE
            setTextIsSelectable(true)
            setPadding(0, dp(4), 0, 0)
          })
        })
        addView(divider())
      }
    }

  private fun bodyContent(bodyValue: String, binary: Boolean, byteCount: Long): View =
    LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      if (bodyValue.isNotEmpty()) {
        addView(LinearLayout(context).apply {
          gravity = Gravity.END
          setPadding(dp(8), dp(8), dp(8), 0)
          addView(actionButton(getString(R.string.mobile_diagnostics_copy_body)) {
            copyToClipboard(bodyValue)
          }, LinearLayout.LayoutParams(WRAP, dp(36)))
        })
      }
      addView(TextView(context).apply {
        text = formatNetworkBody(bodyValue, binary, byteCount)
        textSize = 11f
        setTextColor(SECONDARY_TEXT)
        typeface = Typeface.MONOSPACE
        setTextIsSelectable(true)
        setPadding(dp(10), dp(10), dp(10), dp(10))
        background = roundedBackground(RAISED, RAISED, 4)
      }, LinearLayout.LayoutParams(MATCH, WRAP).apply {
        setMargins(dp(10), dp(10), dp(10), dp(10))
      })
    }

  private fun formatNetworkBody(value: String, binary: Boolean, byteCount: Long): String {
    if (binary) {
      return getString(R.string.mobile_diagnostics_binary_body, formatBytes(byteCount))
    }
    if (value.isEmpty()) return getString(R.string.mobile_diagnostics_no_body)
    val formatted = prettyJsonValue(
      runCatching { JSONTokener(value).nextValue() }.getOrNull() ?: value,
    )
    return if (formatted.length <= MAX_BODY_CHARACTERS) formatted else {
      formatted.take(MAX_BODY_CHARACTERS) +
        "\n\n" + getString(R.string.mobile_diagnostics_body_truncated)
    }
  }

  private fun createCurlCommand(record: NetworkRecord): String {
    val request = record.mRequest
    val parts = mutableListOf(
      "curl ${shellQuote(request?.url.orEmpty())}",
      "  -X ${shellQuote(request?.method.orEmpty().uppercase(Locale.ROOT).ifBlank { "GET" })}",
    )
    headerPairs(request?.headers).forEach { (name, value) ->
      parts += "  -H ${shellQuote("$name: $value")}"
    }
    request?.postData?.takeIf { it.isNotEmpty() }?.let { bodyValue ->
      parts += "  --data-raw ${shellQuote(bodyValue)}"
    }
    return parts.joinToString(" \\\n")
  }

  private fun shellQuote(value: String): String = "'${value.replace("'", "'\\''")}'"

  private fun copyToClipboard(value: String) {
    runCatching {
      val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("Network request", value))
    }.onSuccess {
      Toast.makeText(this, getString(R.string.mobile_diagnostics_copied), Toast.LENGTH_SHORT).show()
    }.onFailure {
      Toast.makeText(this, getString(R.string.mobile_diagnostics_unavailable), Toast.LENGTH_SHORT).show()
    }
  }

  private fun confirmClearRequests() {
    AlertDialog.Builder(this)
      .setTitle(getString(R.string.mobile_diagnostics_clear_confirm_title))
      .setMessage(getString(R.string.mobile_diagnostics_clear_confirm_body))
      .setNegativeButton(getString(R.string.mobile_diagnostics_cancel), null)
      .setPositiveButton(getString(R.string.mobile_diagnostics_clear)) { _, _ ->
        val records = NetworkManager.get().records
        synchronized(records) { records.clear() }
        refreshNetworkContent()
      }
      .show()
  }

  private fun renderOta() {
    val scroll = scrollingColumn()
    val controller = runCatching { UpdatesController.instance }.getOrNull()
    val constants = controller?.getConstantsForModule()?.toModuleConstantsMap()
    val commitTime = (constants?.get("commitTime") as? Number)?.toLong()
    val sourceBranch = MobileDiagnosticsUpdateInfo.sourceBranch(
      constants?.get("manifestString") as? String,
    )
    scroll.column.addView(cardContainer(fill = BACKGROUND, radius = 14, topMargin = 0).apply {
      setPadding(dp(14), dp(10), dp(14), dp(10))
      addView(TextView(context).apply {
        text = getString(R.string.mobile_diagnostics_current_build)
        textSize = 16f
        setTextColor(PRIMARY_TEXT)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(0, dp(5), 0, dp(4))
      })
      addView(runtimeInfoRow(R.string.mobile_diagnostics_branch, display(sourceBranch)))
      addView(runtimeInfoRow(R.string.mobile_diagnostics_update_id, display(constants?.get("updateId"))))
      addView(runtimeInfoRow(
        R.string.mobile_diagnostics_published,
        commitTime?.let { DateFormat.getDateTimeInstance().format(Date(it)) } ?: "—",
      ))
      addView(runtimeInfoRow(R.string.mobile_diagnostics_channel, display(constants?.get("channel"))))
      addView(runtimeInfoRow(R.string.mobile_diagnostics_runtime, display(constants?.get("runtimeVersion"))))
      addView(runtimeInfoRow(
        R.string.mobile_diagnostics_source,
        if (constants == null) "—" else getString(
          if (constants["isEmbeddedLaunch"] == true) {
            R.string.mobile_diagnostics_embedded
          } else {
            R.string.mobile_diagnostics_ota
          },
        ),
      ))
    })

    val status = TextView(this).apply {
      text = getString(
        if (controller == null) R.string.mobile_diagnostics_unavailable
        else R.string.mobile_diagnostics_ota_ready,
      )
      textSize = 12f
      setTextColor(MUTED_TEXT)
      gravity = Gravity.CENTER
      setPadding(dp(8), dp(11), dp(8), 0)
    }
    scroll.column.addView(cardContainer(radius = 14).apply {
      setPadding(dp(17), dp(17), dp(17), dp(17))
      addView(TextView(context).apply {
        text = "↻"
        textSize = 27f
        gravity = Gravity.CENTER
        setTextColor(ACCENT)
        background = roundedBackground(ACCENT_SURFACE, ACCENT_SURFACE, 22)
      }, LinearLayout.LayoutParams(dp(44), dp(44)))
      addView(TextView(context).apply {
        text = getString(R.string.mobile_diagnostics_ota_title)
        textSize = 19f
        setTextColor(PRIMARY_TEXT)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(0, dp(14), 0, 0)
      })
      addView(TextView(context).apply {
        text = getString(R.string.mobile_diagnostics_ota_description)
        textSize = 13f
        setTextColor(SECONDARY_TEXT)
        setPadding(0, dp(7), 0, dp(16))
      })
      addView(actionButton(
        getString(R.string.mobile_diagnostics_check_update),
        primary = true,
      ) {
        val button = it as TextView
        val updates = controller ?: return@actionButton
        button.isEnabled = false
        button.alpha = 0.58f
        setStatus(status, getString(R.string.mobile_diagnostics_checking))
        scope.launch { checkAndApplyUpdate(updates, status, button) }
      }.apply {
        isEnabled = controller != null
        alpha = if (controller == null) 0.58f else 1f
      }, LinearLayout.LayoutParams(MATCH, dp(46)))
      addView(status)
    })
    scroll.column.addView(infoCard(
      getString(R.string.mobile_diagnostics_network_privacy_title),
      getString(R.string.mobile_diagnostics_network_privacy_body),
    ).withTopMargin(10))
    body.addView(scroll.view, LinearLayout.LayoutParams(MATCH, 0, 1f))
  }

  private suspend fun checkAndApplyUpdate(
    controller: IUpdatesController,
    status: TextView,
    button: TextView,
  ) {
    runCatching {
      when (controller.checkForUpdate()) {
        is IUpdatesController.CheckForUpdateResult.UpdateAvailable,
        is IUpdatesController.CheckForUpdateResult.RollBackToEmbedded -> {
          setStatus(status, getString(R.string.mobile_diagnostics_downloading))
          when (controller.fetchUpdate()) {
            is IUpdatesController.FetchUpdateResult.Success,
            is IUpdatesController.FetchUpdateResult.RollBackToEmbedded ->
              controller.relaunchReactApplicationForModule()
            is IUpdatesController.FetchUpdateResult.ErrorResult,
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
      orientation = LinearLayout.VERTICAL
      addView(divider())
      addView(LinearLayout(context).apply {
        gravity = Gravity.TOP
        orientation = LinearLayout.HORIZONTAL
        setPadding(0, dp(9), 0, dp(9))
        addView(TextView(context).apply {
          text = getString(label)
          textSize = 11f
          setTextColor(MUTED_TEXT)
        }, LinearLayout.LayoutParams(dp(94), WRAP))
        addView(TextView(context).apply {
          text = value
          textSize = 11f
          setTextColor(SECONDARY_TEXT)
          typeface = Typeface.MONOSPACE
          gravity = Gravity.END
          setTextIsSelectable(true)
        }, LinearLayout.LayoutParams(0, WRAP, 1f))
      })
    }

  private fun scrollingColumn(topPadding: Int = 0): ScrollColumn {
    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(topPadding), dp(16), dp(36))
    }
    return ScrollColumn(ScrollView(this).apply {
      clipToPadding = false
      isFillViewport = true
      addView(column)
    }, column)
  }

  private fun searchField(
    hint: String,
    initialValue: String,
    onChange: (String) -> Unit,
  ): EditText = EditText(this).apply {
    setText(initialValue)
    setSelection(text.length)
    setHint(hint)
    textSize = 14f
    setTextColor(PRIMARY_TEXT)
    setHintTextColor(MUTED_TEXT)
    setSingleLine(true)
    inputType = InputType.TYPE_CLASS_TEXT
    minimumHeight = dp(44)
    setPadding(dp(13), dp(8), dp(13), dp(8))
    background = roundedBackground(BACKGROUND, BORDER_MUTED, 9)
    addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(value: CharSequence?, start: Int, count: Int, after: Int) = Unit
      override fun onTextChanged(value: CharSequence?, start: Int, before: Int, count: Int) {
        onChange(value?.toString().orEmpty())
      }
      override fun afterTextChanged(value: Editable?) = Unit
    })
  }

  private fun infoCard(title: String, value: String): View =
    cardContainer(fill = ACCENT_SURFACE, stroke = ACCENT_BORDER, radius = 12, topMargin = 0).apply {
      setPadding(dp(13), dp(13), dp(13), dp(13))
      addView(TextView(context).apply {
        text = title
        textSize = 13f
        setTextColor(ACCENT)
        setTypeface(typeface, Typeface.BOLD)
      })
      addView(TextView(context).apply {
        text = value
        textSize = 12f
        setTextColor(SECONDARY_TEXT)
        setPadding(0, dp(5), 0, 0)
      })
    }

  private fun cardContainer(
    clickable: Boolean = false,
    fill: Int = RAISED,
    stroke: Int = BORDER_MUTED,
    radius: Int = 12,
    topMargin: Int = 8,
  ) = LinearLayout(this).apply {
    orientation = LinearLayout.VERTICAL
    setPadding(dp(14), dp(13), dp(14), dp(13))
    background = if (clickable) rippleBackground(fill, stroke, radius)
    else roundedBackground(fill, stroke, radius)
    isClickable = clickable
    isFocusable = clickable
    layoutParams = LinearLayout.LayoutParams(MATCH, WRAP).apply { this.topMargin = dp(topMargin) }
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
    danger: Boolean = false,
    onClick: (View) -> Unit,
  ) = TextView(this).apply {
    text = label
    textSize = 12f
    gravity = Gravity.CENTER
    setTextColor(when {
      primary -> PRIMARY_BUTTON_TEXT
      danger -> DANGER
      else -> ACCENT
    })
    setTypeface(typeface, Typeface.BOLD)
    setPadding(dp(14), dp(8), dp(14), dp(8))
    minimumHeight = dp(44)
    isClickable = true
    isFocusable = true
    background = rippleBackground(
      if (primary) ACCENT else RAISED,
      if (primary) ACCENT else BORDER_MUTED,
      9,
    )
    setOnClickListener { onClick(it) }
  }

  private fun emptyState(title: String, value: String): View =
    LinearLayout(this).apply {
      gravity = Gravity.CENTER
      orientation = LinearLayout.VERTICAL
      setPadding(dp(18), dp(40), dp(18), dp(40))
      addView(TextView(context).apply {
        text = title
        textSize = 15f
        setTextColor(SECONDARY_TEXT)
        setTypeface(typeface, Typeface.BOLD)
        gravity = Gravity.CENTER
      })
      addView(TextView(context).apply {
        text = value
        textSize = 12f
        setTextColor(MUTED_TEXT)
        gravity = Gravity.CENTER
        setPadding(0, dp(6), 0, 0)
      })
    }

  private fun message(value: String) = TextView(this).apply {
    text = value
    textSize = 14f
    gravity = Gravity.CENTER
    setTextColor(MUTED_TEXT)
    setPadding(dp(12), dp(40), dp(12), dp(40))
  }

  private fun setStatus(view: TextView, value: String) {
    view.text = value
    view.visibility = View.VISIBLE
  }

  private fun display(value: Any?): String = value?.toString()?.trim()
    ?.takeIf { it.isNotEmpty() && it != "null" } ?: "—"

  private fun compactPreview(value: String): String = value
    .replace(Regex("\\s+"), " ")
    .trim()

  private fun prettyJsonValue(value: Any?): String = when (value) {
    is JSONObject -> value.toString(2)
    is JSONArray -> value.toString(2)
    null, JSONObject.NULL -> "null"
    else -> value.toString()
  }

  private fun formatBytes(bytes: Long): String {
    val safe = bytes.coerceAtLeast(0L).toDouble()
    return when {
      safe >= 1024.0 * 1024.0 -> String.format(Locale.ROOT, "%.1f MB", safe / (1024.0 * 1024.0))
      safe >= 1024.0 -> String.format(Locale.ROOT, "%.1f KB", safe / 1024.0)
      else -> "${safe.toLong()} B"
    }
  }

  private fun formatDuration(milliseconds: Long): String = when {
    milliseconds <= 0L -> "—"
    milliseconds < 1000L -> "$milliseconds ms"
    else -> String.format(Locale.ROOT, "%.2f s", milliseconds / 1000.0)
  }

  private fun formatStartTime(timestamp: Long): String {
    if (timestamp <= 0L) return "—"
    return SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault()).format(Date(timestamp))
  }

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

  private fun scheduleNetworkRefresh() {
    mainHandler.removeCallbacks(networkRefreshRunnable)
    if (isResumed && currentDestination == DESTINATION_NETWORK && selectedNetworkRecord == null) {
      mainHandler.postDelayed(networkRefreshRunnable, NETWORK_REFRESH_INTERVAL_MS)
    }
  }

  private fun clearNetworkBindings() {
    networkRequestMetric = null
    networkErrorMetric = null
    networkReceivedMetric = null
    networkShowing = null
    networkRecordsContainer = null
    networkFilterButtons.clear()
  }

  private fun finishAndRestorePanel() {
    MobileDiagnosticsDoKit.requestToolPanelRestore()
    finish()
  }

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

  private fun divider(): View = View(this).apply {
    setBackgroundColor(BORDER_MUTED)
    layoutParams = LinearLayout.LayoutParams(MATCH, dp(1))
  }

  private fun View.withTopMargin(value: Int): View = apply {
    layoutParams = (layoutParams as? LinearLayout.LayoutParams
      ?: LinearLayout.LayoutParams(MATCH, WRAP)).apply { topMargin = dp(value) }
  }

  private fun equalWeightParams(height: Int = WRAP) =
    LinearLayout.LayoutParams(0, if (height == WRAP) WRAP else dp(height), 1f)

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private data class ScrollColumn(val view: ScrollView, val column: LinearLayout)

  companion object {
    const val DESTINATION_NETWORK = "network"
    const val DESTINATION_STORAGE = "storage"
    const val DESTINATION_OTA = "ota"
    private const val EXTRA_DESTINATION = "mobileDiagnostics.destination"
    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT
    private const val FILTER_ALL = "all"
    private const val FILTER_FETCH = "fetch"
    private const val FILTER_IMAGE = "image"
    private const val FILTER_MEDIA = "media"
    private const val FILTER_OTHER = "other"
    private const val FILTER_ERRORS = "errors"
    private const val NETWORK_REFRESH_INTERVAL_MS = 1_000L
    private const val MAX_BODY_CHARACTERS = 120_000
    private val FETCH_METHODS = setOf("GET", "POST", "PUT", "PATCH", "DELETE")
    private val IMAGE_EXTENSION = Regex("\\.(?:png|jpe?g|gif|webp|svg|avif|heic)$", RegexOption.IGNORE_CASE)
    private val MEDIA_EXTENSION = Regex("\\.(?:mp4|mov|m4v|webm|mp3|m4a|wav|aac|ogg)$", RegexOption.IGNORE_CASE)
    private val SURFACE = Color.rgb(17, 24, 39)
    private val BACKGROUND = Color.rgb(15, 23, 42)
    private val RAISED = Color.rgb(30, 41, 59)
    private val RAISED_ACTIVE = Color.rgb(38, 52, 73)
    private val BORDER = Color.rgb(71, 85, 105)
    private val BORDER_MUTED = Color.rgb(51, 65, 85)
    private val PRIMARY_TEXT = Color.rgb(248, 250, 252)
    private val SECONDARY_TEXT = Color.rgb(203, 213, 225)
    private val MUTED_TEXT = Color.rgb(148, 163, 184)
    private val ACCENT = Color.rgb(34, 197, 94)
    private val ACCENT_SURFACE = Color.rgb(18, 50, 34)
    private val ACCENT_BORDER = Color.rgb(31, 97, 58)
    private val DANGER = Color.rgb(252, 165, 165)
    private val NETWORK_BLUE = Color.rgb(96, 165, 250)
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
