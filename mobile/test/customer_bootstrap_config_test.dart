import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:selfx_customer/src/auth/customer_api.dart';
import 'package:selfx_customer/src/config/customer_bootstrap_config.dart';

class _ConfigBundle extends CachingAssetBundle {
  _ConfigBundle(this.source);
  final String source;
  int reads = 0;

  @override
  Future<ByteData> load(String key) async {
    reads++;
    expect(key, CustomerBootstrapConfig.assetPath);
    return ByteData.sublistView(Uint8List.fromList(utf8.encode(source)));
  }
}

class _MissingBundle extends CachingAssetBundle {
  @override
  Future<ByteData> load(String key) async => throw StateError('Missing asset');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'uses the packaged production origin with no build-time override',
    () async {
      final config = await CustomerBootstrapConfig.load(apiBaseUrlOverride: '');
      expect(config.apiBaseUrl, 'https://selfxapi-production.up.railway.app');
      final client = MockClient((request) async {
        expect(
          request.url.toString(),
          '${config.apiBaseUrl}/api/v1/customer/auth/capabilities',
        );
        expect(request.followRedirects, isFalse);
        return http.Response('{"enabled":false}', 200);
      });
      addTearDown(client.close);
      final api = HttpCustomerApi(config.apiBaseUrl, client: client);
      expect(await api.request('/auth/capabilities', method: 'GET'), {
        'enabled': false,
      });
    },
  );

  test(
    'prefers an explicit override without reading the bundled asset',
    () async {
      final bundle = _ConfigBundle('not JSON');
      final config = await CustomerBootstrapConfig.load(
        bundle: bundle,
        apiBaseUrlOverride: '  https://staging.selfx.invalid  ',
      );
      expect(config.apiBaseUrl, 'https://staging.selfx.invalid');
      expect(bundle.reads, 0);
    },
  );

  test('blank overrides fall back to the bundled configuration', () async {
    final bundle = _ConfigBundle(
      '{"selfxCustomerApiBaseUrl":" https://selfx.invalid "}',
    );
    final config = await CustomerBootstrapConfig.load(
      bundle: bundle,
      apiBaseUrlOverride: '  ',
    );
    expect(config.apiBaseUrl, 'https://selfx.invalid');
    expect(bundle.reads, 1);
  });

  test(
    'rejects malformed, missing and incorrectly typed configuration',
    () async {
      for (final source in [
        'not JSON',
        '[]',
        'null',
        '{}',
        '{"selfxCustomerApiBaseUrl":42}',
        '{"selfxCustomerApiBaseUrl":" "}',
      ]) {
        await expectLater(
          CustomerBootstrapConfig.load(
            bundle: _ConfigBundle(source),
            apiBaseUrlOverride: '',
          ),
          throwsFormatException,
        );
      }
      await expectLater(
        CustomerBootstrapConfig.load(
          bundle: _MissingBundle(),
          apiBaseUrlOverride: '',
        ),
        throwsStateError,
      );
    },
  );

  test(
    'keeps unsafe origins blocked for both overrides and bundled configuration',
    () async {
      final client = MockClient(
        (_) async => fail('No network request is permitted'),
      );
      addTearDown(client.close);
      for (final url in [
        'http://example.invalid',
        'https://user:secret@example.invalid',
        'https://example.invalid/api',
        'https://example.invalid?token=x',
        'https://example.invalid#fragment',
      ]) {
        for (final useOverride in [true, false]) {
          final config = await CustomerBootstrapConfig.load(
            bundle: _ConfigBundle(jsonEncode({'selfxCustomerApiBaseUrl': url})),
            apiBaseUrlOverride: useOverride ? url : '',
          );
          expect(
            () => HttpCustomerApi(config.apiBaseUrl, client: client),
            throwsA(isA<CustomerApiException>()),
          );
        }
      }
    },
  );
}
