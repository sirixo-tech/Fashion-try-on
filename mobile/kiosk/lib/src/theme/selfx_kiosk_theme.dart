import 'package:flutter/material.dart';

class SelfxKioskTokens {
  const SelfxKioskTokens._();

  static const primary = Color(0xFFFF7119);
  static const primaryHover = Color(0xFFE6600F);
  static const primaryPressed = Color(0xFFC84F0A);
  static const onPrimary = Color(0xFFFFFFFF);

  static const background = Color(0xFFF7F8FB);
  static const surface = Color(0xFFFFFFFF);
  static const elevatedSurface = Color(0xFFFFFFFF);
  static const glassSurface = Color(0xCCFFFFFF);
  static const strongGlassSurface = Color(0xEFFFFFFF);

  static const border = Color(0xFFDDE3EA);
  static const strongBorder = Color(0xFFB9C4D0);
  static const focusBorder = primary;

  static const textPrimary = Color(0xFF141821);
  static const textSecondary = Color(0xFF4C5565);
  static const textMuted = Color(0xFF717B8C);

  static const success = Color(0xFF18A058);
  static const warning = Color(0xFFD99000);
  static const danger = Color(0xFFD92D20);
  static const info = Color(0xFF2563EB);

  static const radiusSmall = 8.0;
  static const radiusMedium = 10.0;
  static const radiusLarge = 14.0;
  static const spacingSmall = 8.0;
  static const spacingMedium = 16.0;
  static const spacingLarge = 24.0;

  static const softShadow = [
    BoxShadow(
      color: Color(0x1A0F172A),
      blurRadius: 28,
      offset: Offset(0, 12),
    ),
  ];
  static const primaryGlassShadow = [
    BoxShadow(
      color: Color(0x45FF7119),
      blurRadius: 26,
      offset: Offset(0, 12),
    ),
  ];
  static const primaryGlassHighlight = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0x24FFFFFF), Color(0x00FFFFFF)],
  );
  static const neutralGlassHighlight = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0x8AFFFFFF), Color(0x18FFFFFF)],
  );
}

ThemeData buildSelfxKioskTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: SelfxKioskTokens.primary,
    brightness: Brightness.light,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme.copyWith(
      primary: SelfxKioskTokens.primary,
      onPrimary: SelfxKioskTokens.onPrimary,
      secondary: SelfxKioskTokens.info,
      error: SelfxKioskTokens.danger,
      surface: SelfxKioskTokens.surface,
      onSurface: SelfxKioskTokens.textPrimary,
      outline: SelfxKioskTokens.border,
    ),
    scaffoldBackgroundColor: SelfxKioskTokens.background,
    textTheme: const TextTheme(
      displaySmall: TextStyle(
        color: SelfxKioskTokens.textPrimary,
        fontSize: 36,
        fontWeight: FontWeight.w800,
      ),
      headlineMedium: TextStyle(
        color: SelfxKioskTokens.textPrimary,
        fontSize: 28,
        fontWeight: FontWeight.w800,
      ),
      titleLarge: TextStyle(
        color: SelfxKioskTokens.textPrimary,
        fontSize: 22,
        fontWeight: FontWeight.w700,
      ),
      titleMedium: TextStyle(
        color: SelfxKioskTokens.textPrimary,
        fontSize: 17,
        fontWeight: FontWeight.w700,
      ),
      bodyLarge: TextStyle(
        color: SelfxKioskTokens.textPrimary,
        fontSize: 18,
        height: 1.35,
      ),
      bodyMedium: TextStyle(
        color: SelfxKioskTokens.textSecondary,
        fontSize: 15,
        height: 1.35,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(180, 56),
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
        backgroundColor: SelfxKioskTokens.primary,
        foregroundColor: SelfxKioskTokens.onPrimary,
        disabledBackgroundColor: const Color(0xFFE5E7EB),
        disabledForegroundColor: SelfxKioskTokens.textMuted,
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusMedium),
        ),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size(180, 56),
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
        backgroundColor: SelfxKioskTokens.primary,
        foregroundColor: SelfxKioskTokens.onPrimary,
        disabledBackgroundColor: const Color(0xFFE5E7EB),
        disabledForegroundColor: SelfxKioskTokens.textMuted,
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusMedium),
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(180, 56),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 15),
        backgroundColor: SelfxKioskTokens.surface,
        foregroundColor: SelfxKioskTokens.textPrimary,
        side: const BorderSide(color: SelfxKioskTokens.border),
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusMedium),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: SelfxKioskTokens.textPrimary,
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusMedium),
        ),
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return SelfxKioskTokens.primary;
          }
          return SelfxKioskTokens.surface;
        }),
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return SelfxKioskTokens.onPrimary;
          }
          return SelfxKioskTokens.textPrimary;
        }),
        side: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const BorderSide(color: SelfxKioskTokens.primary);
          }
          return const BorderSide(color: SelfxKioskTokens.border);
        }),
        textStyle: WidgetStateProperty.all(
          const TextStyle(fontWeight: FontWeight.w800),
        ),
        shape: WidgetStateProperty.all(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusMedium),
          ),
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: SelfxKioskTokens.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusMedium),
        borderSide: const BorderSide(color: SelfxKioskTokens.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusMedium),
        borderSide: const BorderSide(color: SelfxKioskTokens.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusMedium),
        borderSide: const BorderSide(
          color: SelfxKioskTokens.focusBorder,
          width: 1.4,
        ),
      ),
      labelStyle: const TextStyle(color: SelfxKioskTokens.textSecondary),
    ),
    cardTheme: CardThemeData(
      color: SelfxKioskTokens.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SelfxKioskTokens.radiusMedium),
        side: const BorderSide(color: SelfxKioskTokens.border),
      ),
    ),
  );
}
