import 'package:flutter/material.dart';
import 'src/auth/customer_api.dart';
import 'src/auth/customer_controller.dart';
import 'src/auth/customer_identity.dart';
import 'src/auth/session_store.dart';
import 'src/customer_app.dart';
import 'src/ui/customer_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  const apiUrl = String.fromEnvironment('SELFX_API_BASE_URL');
  try {
    final controller = CustomerController(
      api: HttpCustomerApi(apiUrl),
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
