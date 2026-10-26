import 'dart:io';

import 'package:flutter/services.dart';

Future<void> configureKioskPresentation() async {
  if (!Platform.isAndroid) {
    return;
  }

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
}
