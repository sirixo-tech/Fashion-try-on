import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

export 'customer_brand.dart';

abstract final class CustomerColors {
  static const orange = Color(0xFFFF7119);
  static const ink = Color(0xFF24211F);
  static const muted = Color(0xFF77716A);
  static const canvas = Color(0xFFFAF7F2);
  static const line = Color(0xFFE7E0D7);
  static const tint = Color(0xFFFFECE0);
}

ThemeData customerTheme() {
  const text = TextTheme(
    displayLarge: TextStyle(
      fontFamily: 'serif',
      fontSize: 48,
      height: 1.06,
      letterSpacing: -1.8,
      color: CustomerColors.ink,
    ),
    headlineLarge: TextStyle(
      fontFamily: 'serif',
      fontSize: 36,
      height: 1.12,
      letterSpacing: -1,
      color: CustomerColors.ink,
    ),
    headlineMedium: TextStyle(
      fontSize: 26,
      fontWeight: FontWeight.w600,
      letterSpacing: -.7,
      color: CustomerColors.ink,
    ),
    titleLarge: TextStyle(
      fontSize: 20,
      fontWeight: FontWeight.w600,
      letterSpacing: -.4,
      color: CustomerColors.ink,
    ),
    titleMedium: TextStyle(
      fontSize: 16,
      fontWeight: FontWeight.w600,
      color: CustomerColors.ink,
    ),
    bodyLarge: TextStyle(fontSize: 16, height: 1.6, color: CustomerColors.ink),
    bodyMedium: TextStyle(fontSize: 14, height: 1.5, color: CustomerColors.ink),
    bodySmall: TextStyle(
      fontSize: 12,
      height: 1.5,
      color: CustomerColors.muted,
    ),
  );
  final scheme =
      ColorScheme.fromSeed(
        seedColor: CustomerColors.orange,
        brightness: Brightness.light,
      ).copyWith(
        primary: CustomerColors.orange,
        onPrimary: CustomerColors.ink,
        surface: CustomerColors.canvas,
        onSurface: CustomerColors.ink,
      );
  return ThemeData(
    fontFamily: 'Roboto',
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Colors.transparent,
    textTheme: text,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      foregroundColor: CustomerColors.ink,
      surfaceTintColor: Colors.transparent,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 19),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: CustomerColors.line),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: CustomerColors.line),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(18),
        borderSide: const BorderSide(color: CustomerColors.orange, width: 1.5),
      ),
      labelStyle: const TextStyle(color: CustomerColors.muted),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: CustomerColors.orange,
        foregroundColor: CustomerColors.ink,
        minimumSize: const Size(48, 56),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(
          fontFamily: 'Roboto',
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        textStyle: const TextStyle(fontFamily: 'Roboto'),
        foregroundColor: CustomerColors.ink,
        backgroundColor: Colors.white,
        minimumSize: const Size(48, 54),
        side: const BorderSide(color: CustomerColors.line),
        shape: const StadiumBorder(),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: CustomerColors.ink,
        textStyle: const TextStyle(
          fontFamily: 'Roboto',
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    dividerColor: CustomerColors.line,
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: CustomerColors.ink,
        borderRadius: BorderRadius.circular(10),
      ),
      textStyle: const TextStyle(
        color: Colors.white,
        fontSize: 12,
        height: 1.4,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
    ),
  );
}

class CustomerNotice extends StatelessWidget {
  final String message;
  final bool error;
  const CustomerNotice(this.message, {super.key, this.error = false});
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: error ? const Color(0xFFFFEDE9) : CustomerColors.tint,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        message,
        style: TextStyle(
          fontSize: 13,
          height: 1.5,
          color: error ? const Color(0xFF9A3025) : CustomerColors.ink,
        ),
      ),
    ),
  );
}

Future<void> customerInfo(
  BuildContext context,
  String title,
  String message, {
  String? address,
}) async {
  final uri = Uri.tryParse(address ?? '');
  if (uri != null &&
      uri.scheme == 'https' &&
      uri.host.isNotEmpty &&
      uri.userInfo.isEmpty) {
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    } catch (_) {
      /* The readable in-app information remains available. */
    }
  }
  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: CustomerColors.canvas,
    builder: (context) => SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          24,
          8,
          24,
          24 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 16),
            Text(message, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Got it'),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
