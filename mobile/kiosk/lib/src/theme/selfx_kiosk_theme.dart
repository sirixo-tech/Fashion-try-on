import 'package:flutter/material.dart';

ThemeData buildSelfxKioskTheme() {
  const seed = Color(0xFF0D5C75);
  const ink = Color(0xFF102A43);

  final scheme = ColorScheme.fromSeed(
    seedColor: seed,
    brightness: Brightness.light,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme.copyWith(
      primary: seed,
      secondary: const Color(0xFF2F855A),
      error: const Color(0xFFC53030),
      surface: const Color(0xFFF7FAFC),
    ),
    scaffoldBackgroundColor: const Color(0xFFF7FAFC),
    textTheme: const TextTheme(
      displaySmall: TextStyle(
        color: ink,
        fontSize: 36,
        fontWeight: FontWeight.w800,
      ),
      headlineMedium: TextStyle(
        color: ink,
        fontSize: 28,
        fontWeight: FontWeight.w800,
      ),
      titleLarge: TextStyle(
        color: ink,
        fontSize: 22,
        fontWeight: FontWeight.w700,
      ),
      bodyLarge: TextStyle(color: ink, fontSize: 18, height: 1.35),
      bodyMedium: TextStyle(color: ink, fontSize: 15, height: 1.35),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size(220, 64),
        textStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(180, 56),
        textStyle: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: const BorderSide(color: Color(0xFFD9E2EC)),
      ),
    ),
  );
}
