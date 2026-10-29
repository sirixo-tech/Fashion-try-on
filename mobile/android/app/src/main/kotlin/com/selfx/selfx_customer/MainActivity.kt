package com.selfx.selfx_customer

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.os.Build
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
import android.content.Intent
import android.net.Uri
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import java.io.ByteArrayOutputStream
import java.io.File
import androidx.core.content.FileProvider
import java.security.MessageDigest

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel("selfx_updates", "SelfX Try-On updates", NotificationManager.IMPORTANCE_DEFAULT)
            )
        }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.selfx.customer/services").setMethodCallHandler { call, result ->
            if (call.method != "appInfo") { result.notImplemented(); return@setMethodCallHandler }
            try {
                @Suppress("DEPRECATION")
                val info = packageManager.getPackageInfo(packageName, if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES)
                @Suppress("DEPRECATION")
                val signers = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
                val signature = signers?.singleOrNull() ?: throw IllegalStateException("Unexpected signing identity")
                val digest = MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it.toInt() and 0xff) }
                val architecture = Build.SUPPORTED_ABIS.firstNotNullOfOrNull { abi -> when (abi) { "arm64-v8a" -> "ARM64"; "armeabi-v7a" -> "ARM32"; "x86_64" -> "X86_64"; else -> null } } ?: "UNIVERSAL"
                @Suppress("DEPRECATION")
                val versionCode = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
                result.success(mapOf("versionCode" to versionCode, "versionName" to info.versionName, "packageName" to packageName,
                    "signerSha256" to digest, "architecture" to architecture, "sdk" to Build.VERSION.SDK_INT))
            } catch (_: Exception) { result.error("APP_INFO_UNAVAILABLE", "Unable to read this app's update identity.", null) }
        }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.selfx.customer/upi").setMethodCallHandler { call, result ->
            val raw = call.argument<String>("uri")
            val uri = try { Uri.parse(raw) } catch (_: Exception) { null }
            if (uri?.scheme != "upi" || uri.host != "pay") {
                result.error("INVALID_UPI_PAYMENT", "Invalid UPI payment address.", null)
                return@setMethodCallHandler
            }
            val intent = Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_DEFAULT)
            when (call.method) {
                "apps" -> {
                    val apps = packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
                        .distinctBy { it.activityInfo.packageName }
                        .map { info ->
                            mapOf(
                                "name" to info.loadLabel(packageManager).toString(),
                                "package" to info.activityInfo.packageName,
                                "icon" to iconBytes(info.loadIcon(packageManager)),
                            )
                        }
                    result.success(apps)
                }
                "open" -> {
                    val selected = call.argument<String>("package")
                    if (selected.isNullOrBlank() || !packageManager.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
                            .any { it.activityInfo.packageName == selected }) {
                        result.error("UPI_APP_UNAVAILABLE", "This payment app is not installed.", null)
                        return@setMethodCallHandler
                    }
                    try {
                        startActivity(intent.setPackage(selected))
                        result.success(true)
                    } catch (_: Exception) {
                        result.error("UPI_APP_UNAVAILABLE", "This payment app could not be opened.", null)
                    }
                }
                "shareQr" -> {
                    val bytes = call.argument<ByteArray>("png")
                    if (bytes == null || bytes.isEmpty() || bytes.size > 262144) {
                        result.error("INVALID_PAYMENT_QR", "The payment QR could not be shared.", null)
                        return@setMethodCallHandler
                    }
                    try {
                        val directory = File(cacheDir, "shared_payments").apply { mkdirs() }
                        val file = File(directory, "selfx-payment-qr.png")
                        file.writeBytes(bytes)
                        val content = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
                        val share = Intent(Intent.ACTION_SEND).apply {
                            type = "image/png"
                            putExtra(Intent.EXTRA_STREAM, content)
                            putExtra(Intent.EXTRA_TEXT, "SelfX payment QR. Complete this payment before it expires.")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        startActivity(Intent.createChooser(share, "Share payment QR"))
                        result.success(true)
                    } catch (_: Exception) {
                        result.error("PAYMENT_QR_SHARE_FAILED", "The payment QR could not be shared.", null)
                    }
                }
                "shareLink" -> {
                    try {
                        val share = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, "SelfX payment link (expires soon): $raw")
                        }
                        startActivity(Intent.createChooser(share, "Share payment link"))
                        result.success(true)
                    } catch (_: Exception) {
                        result.error("PAYMENT_LINK_SHARE_FAILED", "The payment link could not be shared.", null)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun iconBytes(drawable: Drawable): ByteArray {
        val size = 96
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        drawable.setBounds(0, 0, size, size)
        drawable.draw(canvas)
        return ByteArrayOutputStream().use { stream ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
            stream.toByteArray()
        }
    }
}
