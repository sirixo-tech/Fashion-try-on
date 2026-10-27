import 'dart:ui';
import 'package:country_picker/country_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:phone_numbers_parser/phone_numbers_parser.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../l10n/customer_copy.dart';

abstract interface class CustomerCountryStore {
  Future<String?> read();
  Future<void> write(String countryCode);
}

class LocalCustomerCountryStore implements CustomerCountryStore {
  static const key = 'selfx.customer.country.v1';
  SharedPreferencesAsync? _preferences;
  SharedPreferencesAsync get preferences =>
      _preferences ??= SharedPreferencesAsync();
  @override
  Future<String?> read() => preferences.getString(key);
  @override
  Future<void> write(String countryCode) =>
      preferences.setString(key, countryCode);
}

class CustomerCountrySelection extends ChangeNotifier {
  static final countries = CountryService();
  final CustomerCountryStore store;
  Country? selected;
  bool _disposed = false;
  int _revision = 0;
  Future<void>? _initializing, _writes;
  CustomerCountrySelection({
    CustomerCountryStore? store,
    List<Locale>? deviceLocales,
  }) : store = store ?? LocalCustomerCountryStore() {
    for (final locale in deviceLocales ?? PlatformDispatcher.instance.locales) {
      selected = countries.findByCode(locale.countryCode);
      if (selected != null) break;
    }
  }
  Future<void> initialize() => _initializing ??= _load();
  Future<void> _load() async {
    final revision = _revision;
    try {
      final saved = countries.findByCode(await store.read());
      if (!_disposed && revision == _revision && saved != null) {
        selected = saved;
        notifyListeners();
      }
    } catch (_) {
      /* Device region remains usable when preferences are unavailable. */
    }
  }

  Future<bool> choose(Country country) async {
    if (_disposed) return false;
    _revision++;
    selected = country;
    notifyListeners();
    final write = (_writes ?? Future<void>.value()).then(
      (_) => store.write(country.countryCode),
    );
    _writes = write.then<void>((_) {}, onError: (Object _) {});
    try {
      await write;
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

PhoneNumber? parseCustomerPhone(String input, Country? country) {
  final normalized = const CustomerCodeFormatter()
      .formatEditUpdate(TextEditingValue.empty, TextEditingValue(text: input))
      .text
      .trim();
  if (normalized.isEmpty || !RegExp(r'^[+\d\s().-]+$').hasMatch(normalized)) {
    return null;
  }
  PhoneNumber? valid(String value, {IsoCode? destination}) {
    try {
      final parsed = PhoneNumber.parse(value, destinationCountry: destination);
      return parsed.isValid() &&
              RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(parsed.international)
          ? parsed
          : null;
    } catch (_) {
      return null;
    }
  }

  if (normalized.startsWith('+')) return valid(normalized);
  if (country == null) return null;
  final iso = IsoCode.values
      .where((value) => value.name == country.countryCode)
      .firstOrNull;
  if (iso == null) return null;
  final national = valid(normalized, destination: iso);
  if (national != null) return national;
  // Accept a pasted international number missing '+', without doubling its prefix.
  final digits = normalized.replaceAll(RegExp(r'\D'), '');
  final pasted = digits.startsWith(country.phoneCode)
      ? valid('+$digits')
      : null;
  return pasted ?? valid('+${country.phoneCode}$digits');
}
