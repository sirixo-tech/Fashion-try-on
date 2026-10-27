import 'package:flutter/material.dart';
import 'customer_theme.dart';

/// The reference-led welcome/auth treatment stays local to the entry flow.
ThemeData customerEntryTheme(BuildContext context) {
  final base = Theme.of(context);
  TextStyle heading(double size) => TextStyle(
    fontFamily: 'Roboto',
    fontSize: size,
    fontWeight: FontWeight.w500,
    height: 1.12,
    letterSpacing: -.9,
    color: CustomerColors.ink,
  );
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(12));
  final border = OutlineInputBorder(
    borderRadius: BorderRadius.circular(12),
    borderSide: const BorderSide(color: CustomerColors.line),
  );
  return base.copyWith(
    scaffoldBackgroundColor: CustomerColors.canvas,
    colorScheme: base.colorScheme.copyWith(onPrimary: Colors.white),
    textTheme: base.textTheme.copyWith(
      displayLarge: heading(42),
      headlineLarge: heading(34),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: CustomerColors.orange,
        foregroundColor: Colors.white,
        minimumSize: const Size(48, 54),
        shape: shape,
        textStyle: const TextStyle(
          fontFamily: 'Roboto',
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: CustomerColors.ink,
        backgroundColor: Colors.white,
        minimumSize: const Size(48, 52),
        side: const BorderSide(color: CustomerColors.line),
        shape: shape,
        textStyle: const TextStyle(fontFamily: 'Roboto'),
      ),
    ),
    inputDecorationTheme: base.inputDecorationTheme.copyWith(
      border: border,
      enabledBorder: border,
      focusedBorder: border.copyWith(
        borderSide: const BorderSide(color: CustomerColors.orange, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 17),
    ),
  );
}
