import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let sharing = FlutterMethodChannel(
      name: "com.selfx.customer/sharing",
      binaryMessenger: engineBridge.applicationRegistrar.binaryMessenger
    )
    sharing.setMethodCallHandler { [weak self] call, result in
      guard call.method == "shareLook" else {
        result(FlutterMethodNotImplemented)
        return
      }
      guard let arguments = call.arguments as? [String: Any],
            let image = arguments["image"] as? FlutterStandardTypedData,
            let mimeType = arguments["mimeType"] as? String,
            let fileExtension = ["image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"][mimeType],
            !image.data.isEmpty, image.data.count <= 20 * 1024 * 1024 else {
        result(FlutterError(code: "LOOK_SHARE_INVALID", message: "This look cannot be shared.", details: nil))
        return
      }
      guard let self = self, let presenter = self.window?.rootViewController else {
        result(FlutterError(code: "LOOK_SHARE_FAILED", message: "This look could not be shared.", details: nil))
        return
      }
      let file = FileManager.default.temporaryDirectory
        .appendingPathComponent("selfx-look-\(UUID().uuidString).\(fileExtension)")
      do {
        try image.data.write(to: file, options: .atomic)
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        if let popover = sheet.popoverPresentationController {
          popover.sourceView = presenter.view
          popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
          popover.permittedArrowDirections = []
        }
        sheet.completionWithItemsHandler = { _, _, _, _ in
          try? FileManager.default.removeItem(at: file)
        }
        presenter.present(sheet, animated: true)
        result(true)
      } catch {
        result(FlutterError(code: "LOOK_SHARE_FAILED", message: "This look could not be shared.", details: nil))
      }
    }
  }
}
