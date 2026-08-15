import 'package:flutter/material.dart';

class SelfxKioskTokens {
  const SelfxKioskTokens._();

  static const headingFontFamily = 'Manrope';
  static const bodyFontFamily = 'Inter';

  static const primary = Color(0xFFFF7119);
  static const primaryHover = Color(0xFFE6600F);
  static const primaryPressed = Color(0xFFC84F0A);
  static const onPrimary = Color(0xFFFFFFFF);

  static const background = Color(0xFFF7F8FB);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceElevated = Color(0xFFFFFFFF);

  static const border = Color(0xFFDDE3EA);
  static const borderStrong = Color(0xFFB9C4D0);
  static const focusBorder = primary;

  static const textPrimary = Color(0xFF141821);
  static const textSecondary = Color(0xFF4C5565);
  static const textMuted = Color(0xFF717B8C);

  static const success = Color(0xFF18A058);
  static const warning = Color(0xFFD99000);
  static const danger = Color(0xFFD92D20);
  static const info = Color(0xFF2563EB);

  static const buttonPrimary = primary;
  static const buttonSecondary = surface;
  static const buttonDanger = danger;
  static const buttonGhost = Color(0x00FFFFFF);

  static const radiusSmall = 8.0;
  static const radiusMedium = 10.0;
  static const radiusLarge = 14.0;
  static const cardRadius = radiusMedium;
  static const buttonRadius = radiusMedium;
  static const spacingSmall = 8.0;
  static const spacingMedium = 16.0;
  static const spacingLarge = 24.0;

  static const cardShadow = [
    BoxShadow(
      color: Color(0x140F172A),
      blurRadius: 22,
      offset: Offset(0, 10),
    ),
  ];
  static const softShadow = [
    BoxShadow(
      color: Color(0x1A0F172A),
      blurRadius: 28,
      offset: Offset(0, 12),
    ),
  ];
  static const primaryActionShadow = [
    BoxShadow(
      color: Color(0x30FF7119),
      blurRadius: 20,
      offset: Offset(0, 8),
    ),
  ];
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
        fontFamily: SelfxKioskTokens.headingFontFamily,
        fontSize: 48,
        fontWeight: FontWeight.w700,
        height: 1.08,
      ),
      headlineMedium: TextStyle(
        color: SelfxKioskTokens.textPrimary,
        fontFamily: SelfxKioskTokens.headingFontFamily,
        fontSize: 34,
        fontWeight: FontWeight.w700,
        height: 1.12,
      ),
      headlineSmall: TextStyle(
        color: SelfxKioskTokens.textPrimary,
        fontFamily: SelfxKioskTokens.headingFontFamily,
        fontSize: 30,
        fontWeight: FontWeight.w700,
        height: 1.14,
      ),
      titleLarge: TextStyle(
        color: SelfxKioskTokens.textPrimary,
        fontFamily: SelfxKioskTokens.headingFontFamily,
        fontSize: 24,
        fontWeight: FontWeight.w600,
        height: 1.18,
      ),
      titleMedium: TextStyle(
        color: SelfxKioskTokens.textPrimary,
        fontFamily: SelfxKioskTokens.headingFontFamily,
        fontSize: 22,
        fontWeight: FontWeight.w600,
        height: 1.2,
      ),
      bodyLarge: TextStyle(
        color: SelfxKioskTokens.textPrimary,
        fontFamily: SelfxKioskTokens.bodyFontFamily,
        fontSize: 19,
        height: 1.35,
      ),
      bodyMedium: TextStyle(
        color: SelfxKioskTokens.textSecondary,
        fontFamily: SelfxKioskTokens.bodyFontFamily,
        fontSize: 17,
        height: 1.35,
      ),
      labelLarge: TextStyle(
        color: SelfxKioskTokens.textPrimary,
        fontFamily: SelfxKioskTokens.bodyFontFamily,
        fontSize: 19,
        fontWeight: FontWeight.w600,
        height: 1.2,
      ),
      labelMedium: TextStyle(
        color: SelfxKioskTokens.textSecondary,
        fontFamily: SelfxKioskTokens.bodyFontFamily,
        fontSize: 15,
        fontWeight: FontWeight.w500,
        height: 1.2,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(180, 56),
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
        backgroundColor: SelfxKioskTokens.primary,
        foregroundColor: SelfxKioskTokens.onPrimary,
        side: const BorderSide(color: SelfxKioskTokens.primary),
        disabledBackgroundColor: const Color(0xFFE5E7EB),
        disabledForegroundColor: SelfxKioskTokens.textMuted,
        textStyle: const TextStyle(
          fontFamily: SelfxKioskTokens.bodyFontFamily,
          fontSize: 19,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SelfxKioskTokens.buttonRadius),
        ),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size(180, 56),
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
        backgroundColor: SelfxKioskTokens.primary,
        foregroundColor: SelfxKioskTokens.onPrimary,
        side: const BorderSide(color: SelfxKioskTokens.primary),
        disabledBackgroundColor: const Color(0xFFE5E7EB),
        disabledForegroundColor: SelfxKioskTokens.textMuted,
        elevation: 0,
        shadowColor: Colors.transparent,
        textStyle: const TextStyle(
          fontFamily: SelfxKioskTokens.bodyFontFamily,
          fontSize: 19,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SelfxKioskTokens.buttonRadius),
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
        textStyle: const TextStyle(
          fontFamily: SelfxKioskTokens.bodyFontFamily,
          fontSize: 19,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SelfxKioskTokens.buttonRadius),
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: SelfxKioskTokens.textPrimary,
        textStyle: const TextStyle(
          fontFamily: SelfxKioskTokens.bodyFontFamily,
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SelfxKioskTokens.buttonRadius),
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
          const TextStyle(
            fontFamily: SelfxKioskTokens.bodyFontFamily,
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        shape: WidgetStateProperty.all(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(SelfxKioskTokens.buttonRadius),
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
      labelStyle: const TextStyle(
        color: SelfxKioskTokens.textSecondary,
        fontFamily: SelfxKioskTokens.bodyFontFamily,
        fontSize: 15,
        fontWeight: FontWeight.w500,
      ),
    ),
    cardTheme: CardThemeData(
      color: SelfxKioskTokens.surface,
      elevation: 1,
      shadowColor: const Color(0x1A0F172A),
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(SelfxKioskTokens.cardRadius),
        side: const BorderSide(color: SelfxKioskTokens.border),
      ),
    ),
  );
}
