package com.mobilediagnosticskit

import java.util.LinkedHashMap

internal object MobileDiagnosticsImageStore {
  private const val MAX_TOTAL_BYTES = 16 * 1024 * 1024
  private const val MAX_ENTRIES = 16
  private val images = LinkedHashMap<Int, ByteArray>(MAX_ENTRIES, 0.75f, true)
  private var totalBytes = 0

  @Synchronized
  fun put(requestId: Int, bytes: ByteArray) {
    images.remove(requestId)?.let { totalBytes -= it.size }
    if (bytes.size > MAX_TOTAL_BYTES) return

    images[requestId] = bytes
    totalBytes += bytes.size
    removeEldestEntry()
  }

  @Synchronized
  fun get(requestId: Int): ByteArray? = images[requestId]

  @Synchronized
  fun clear() {
    images.clear()
    totalBytes = 0
  }

  private fun removeEldestEntry() {
    while (images.size > MAX_ENTRIES || totalBytes > MAX_TOTAL_BYTES) {
      val iterator = images.entries.iterator()
      if (!iterator.hasNext()) return
      val eldest = iterator.next()
      totalBytes -= eldest.value.size
      iterator.remove()
    }
  }
}
