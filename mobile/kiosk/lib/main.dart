import 'package:flutter/material.dart';

import 'src/app/selfx_kiosk_app.dart';
import 'src/config/kiosk_bootstrap_config.dart';
import 'src/platform/kiosk_presentation.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final bootstrapConfig = await KioskBootstrapConfig.load();
  await configureKioskPresentation();
  runApp(SelfxKioskApp.production(bootstrapConfig: bootstrapConfig));
}
