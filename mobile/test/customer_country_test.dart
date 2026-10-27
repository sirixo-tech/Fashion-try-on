import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:selfx_customer/src/services/customer_country.dart';

class MemoryCountryStore implements CustomerCountryStore {
  String? value;
  MemoryCountryStore([this.value]);
  @override
  Future<String?> read() async => value;
  @override
  Future<void> write(String countryCode) async {
    value = countryCode;
  }
}

class DelayedCountryStore extends MemoryCountryStore {
  final loaded = Completer<String?>();
  @override
  Future<String?> read() => loaded.future;
}

void main() {
  test(
    'device region defaults without GPS and remembered manual choices take priority',
    () async {
      final store = MemoryCountryStore();
      final selection = CustomerCountrySelection(
        store: store,
        deviceLocales: const [Locale('en', 'IN')],
      );
      expect(selection.selected?.countryCode, 'IN');
      await selection.initialize();
      await selection.choose(
        CustomerCountrySelection.countries.findByCode('GB')!,
      );
      expect(store.value, 'GB');
      final reopened = CustomerCountrySelection(
        store: store,
        deviceLocales: const [Locale('en', 'IN')],
      );
      await reopened.initialize();
      expect(reopened.selected?.countryCode, 'GB');
      selection.dispose();
      reopened.dispose();
    },
  );
  test(
    'unknown region is not guessed and a late preference read cannot undo a new choice',
    () async {
      final store = DelayedCountryStore();
      final selection = CustomerCountrySelection(
        store: store,
        deviceLocales: const [Locale('en')],
      );
      expect(selection.selected, isNull);
      final initializing = selection.initialize();
      await selection.choose(
        CustomerCountrySelection.countries.findByCode('IN')!,
      );
      store.loaded.complete('US');
      await initializing;
      expect(selection.selected?.countryCode, 'IN');
      selection.dispose();
    },
  );
  test(
    'normalizes national, international, missing plus, trunk prefixes and localized digits without doubled country codes',
    () {
      final countries = CustomerCountrySelection.countries;
      final indian = countries.findByCode('IN');
      for (final input in [
        '9989093455',
        '+91 99890 93455',
        '919989093455',
        '९९८९०९३४५५',
        '٩٩٨٩٠٩٣٤٥٥',
      ]) {
        expect(
          parseCustomerPhone(input, indian)?.international,
          '+919989093455',
          reason: input,
        );
      }
      expect(
        parseCustomerPhone(
          '020 7946 0018',
          countries.findByCode('GB'),
        )?.international,
        '+442079460018',
      );
      expect(
        parseCustomerPhone(
          '(202) 555-0119',
          countries.findByCode('US'),
        )?.international,
        '+12025550119',
      );
      expect(
        parseCustomerPhone('+91 9989093455', null)?.international,
        '+919989093455',
      );
      for (final input in [
        '',
        '123',
        'hello',
        '+999123456789',
        '+91++9989093455',
      ]) {
        expect(parseCustomerPhone(input, indian), isNull);
      }
      expect(parseCustomerPhone('9989093455', null), isNull);
    },
  );
}
