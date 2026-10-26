import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'src/l10n/customer_copy.dart';
import 'src/l10n/customer_language.dart';
import 'src/auth/customer_api.dart';
import 'src/auth/customer_controller.dart';
import 'src/auth/customer_identity.dart';
import 'src/auth/session_store.dart';
import 'src/config/customer_bootstrap_config.dart';
import 'src/customer_app.dart';
import 'src/ui/customer_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    final config = await CustomerBootstrapConfig.load();
    final controller = CustomerController(
      api: HttpCustomerApi(config.apiBaseUrl),
      store: SecureCustomerSessionStore(),
      identity: NativeCustomerIdentity(),
    );
    runApp(CustomerApp(controller: controller));
    controller.initialize();
  } catch (_) {
    var language = 'en';
    try {
      language = CustomerLanguage.normalize(
        await LocalCustomerLanguageStore().read(),
      );
    } catch (_) {}
    runApp(
      MaterialApp(
        theme: customerTheme(language),
        locale: Locale(language),
        supportedLocales: CustomerLanguage.locales,
        localizationsDelegates: const [
          CustomerCopy.delegate,
          ...GlobalMaterialLocalizations.delegates,
        ],
        home: Scaffold(
          body: SafeArea(
            child: Center(
              child: Padding(
                padding: EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CustomerBrand(),
                    const SizedBox(height: 28),
                    const CustomerText(
                      'SelfX needs a secure API connection before it can open. Please install a configured app build.',
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
