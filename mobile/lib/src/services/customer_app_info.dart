import 'package:package_info_plus/package_info_plus.dart';

class CustomerInstalledApp {
  final String version, build;
  const CustomerInstalledApp(this.version, this.build);
  String get display => build.isEmpty ? version : '$version ($build)';
  static Future<CustomerInstalledApp> load() async {
    final info = await PackageInfo.fromPlatform();
    if (info.version.trim().isEmpty) throw StateError('Version unavailable');
    return CustomerInstalledApp(info.version, info.buildNumber);
  }
}
