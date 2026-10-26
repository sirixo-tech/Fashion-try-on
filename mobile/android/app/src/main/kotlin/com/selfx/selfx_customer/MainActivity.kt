package com.selfx.selfx_customer

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.os.Build
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.pm.PackageManager
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
    }
}
