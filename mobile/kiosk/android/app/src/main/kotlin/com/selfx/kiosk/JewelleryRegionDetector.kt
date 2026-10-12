package com.selfx.kiosk

import android.content.Context
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import io.flutter.plugin.common.MethodChannel
import java.util.concurrent.Executors

class JewelleryRegionDetector(private val context: Context) {
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var detector: HandLandmarker? = null

    fun detect(bytes: ByteArray, reply: MethodChannel.Result) {
        worker.execute {
            val region = try {
                detectRegion(bytes)
            } catch (_: Exception) {
                null
            }
            main.post { reply.success(region) }
        }
    }

    private fun detectRegion(bytes: ByteArray): Map<String, Float>? {
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
        try {
            val landmarker = detector ?: HandLandmarker.createFromOptions(
                context,
                HandLandmarker.HandLandmarkerOptions.builder()
                    .setBaseOptions(BaseOptions.builder().setModelAssetPath("hand_landmarker.task").build())
                    .setRunningMode(RunningMode.IMAGE)
                    .setNumHands(2)
                    .setMinHandDetectionConfidence(0.7f)
                    .setMinHandPresenceConfidence(0.7f)
                    .build()
            ).also { detector = it }
            val image = BitmapImageBuilder(bitmap).build()
            try {
                val regions = landmarker.detect(image).landmarks().mapNotNull { hand ->
                    if (hand.size != 21 || hand.any { it.x() !in 0f..1f || it.y() !in 0f..1f }) {
                        return@mapNotNull null
                    }
                    val left = hand.minOf { it.x() }
                    val top = hand.minOf { it.y() }
                    val right = hand.maxOf { it.x() }
                    val bottom = hand.maxOf { it.y() }
                    mapOf("left" to left, "top" to top, "right" to right, "bottom" to bottom)
                }.sortedByDescending { (it.getValue("right") - it.getValue("left")) * (it.getValue("bottom") - it.getValue("top")) }
                if (regions.isEmpty()) return null
                fun area(region: Map<String, Float>) =
                    (region.getValue("right") - region.getValue("left")) * (region.getValue("bottom") - region.getValue("top"))
                // Similar-sized hands make the intended jewellery target ambiguous.
                if (regions.size > 1 && area(regions[1]) > area(regions[0]) * 0.35f) return null
                return regions.first()
            } finally {
                image.close()
            }
        } finally {
            bitmap.recycle()
        }
    }

    fun close() {
        worker.execute {
            detector?.close()
            detector = null
        }
        worker.shutdown()
    }
}
