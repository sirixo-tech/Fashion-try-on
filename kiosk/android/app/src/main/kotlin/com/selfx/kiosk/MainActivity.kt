package com.selfx.kiosk

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var jewelleryRegionDetector: JewelleryRegionDetector? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        jewelleryRegionDetector = JewelleryRegionDetector(applicationContext)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "selfx/jewellery_result_region")
            .setMethodCallHandler { call, result ->
                if (call.method == "detectHandRegion") {
                    val bytes = call.argument<ByteArray>("image")
                    if (bytes == null) {
                        result.success(null)
                    } else {
                        jewelleryRegionDetector?.detect(bytes, result) ?: result.success(null)
                    }
                } else {
                    result.notImplemented()
                }
            }
    }

    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "selfx/jewellery_result_region")
            .setMethodCallHandler(null)
        jewelleryRegionDetector?.close()
        jewelleryRegionDetector = null
        super.cleanUpFlutterEngine(flutterEngine)
    }
}
