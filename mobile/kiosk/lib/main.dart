import 'package:flutter/material.dart';

import 'src/app/selfx_kiosk_app.dart';
import 'src/platform/kiosk_presentation.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await configureKioskPresentation();
  runApp(SelfxKioskApp.production());
}
