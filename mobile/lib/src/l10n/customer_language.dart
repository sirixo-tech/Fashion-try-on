import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CustomerLanguage {
  final String code, name, nativeName;
  const CustomerLanguage(this.code, this.name, this.nativeName);
  String get shortName => switch (code) {
    'hi' => 'HIN',
    'te' => 'TEL',
    'ta' => 'TAM',
    'kn' => 'KAN',
    _ => code.toUpperCase(),
  };
  static const all = [
    CustomerLanguage('en', 'English', 'English'),
    CustomerLanguage('hi', 'Hindi', 'हिन्दी'),
    CustomerLanguage('ta', 'Tamil', 'தமிழ்'),
    CustomerLanguage('te', 'Telugu', 'తెలుగు'),
    CustomerLanguage('es', 'Spanish', 'Español'),
    CustomerLanguage('ar', 'Arabic', 'العربية'),
    CustomerLanguage('kn', 'Kannada', 'ಕನ್ನಡ'),
    CustomerLanguage('bn', 'Bengali', 'বাংলা'),
    CustomerLanguage('mr', 'Marathi', 'मराठी'),
    CustomerLanguage('ml', 'Malayalam', 'മലയാളം'),
    CustomerLanguage('gu', 'Gujarati', 'ગુજરાતી'),
    CustomerLanguage('ur', 'Urdu', 'اردو'),
    CustomerLanguage('fr', 'French', 'Français'),
    CustomerLanguage('pt', 'Portuguese', 'Português'),
    CustomerLanguage('de', 'German', 'Deutsch'),
    CustomerLanguage('zh', 'Chinese', '简体中文'),
    CustomerLanguage('ja', 'Japanese', '日本語'),
    CustomerLanguage('ko', 'Korean', '한국어'),
    CustomerLanguage('ru', 'Russian', 'Русский'),
    CustomerLanguage('id', 'Indonesian', 'Bahasa Indonesia'),
  ];
  static bool supports(String code) => all.any((item) => item.code == code);
  static String normalize(String? code) => supports(code ?? '') ? code! : 'en';
  static CustomerLanguage find(String code) =>
      all.firstWhere((item) => item.code == normalize(code));
  static List<Locale> get locales =>
      all.map((item) => Locale(item.code)).toList(growable: false);
}

abstract interface class CustomerLanguageStore {
  Future<String?> read();
  Future<void> write(String code);
}

class LocalCustomerLanguageStore implements CustomerLanguageStore {
  static const key = 'selfx.customer.language.v1';
  SharedPreferencesAsync? _preferences;
  SharedPreferencesAsync get preferences =>
      _preferences ??= SharedPreferencesAsync();
  LocalCustomerLanguageStore([this._preferences]);
  @override
  Future<String?> read() => preferences.getString(key);
  @override
  Future<void> write(String code) => preferences.setString(key, code);
}
