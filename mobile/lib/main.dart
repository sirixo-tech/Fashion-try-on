import 'package:flutter/material.dart';
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
    runApp(
      MaterialApp(
        theme: customerTheme(),
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
                    const Text(
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
