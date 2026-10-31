import 'package:flutter/material.dart';
import '../l10n/customer_copy.dart';
import '../services/customer_app_info.dart';
import 'customer_theme.dart';
import 'customer_home_back.dart';

class CustomerAboutScreen extends StatefulWidget {
  const CustomerAboutScreen({super.key});
  @override
  State<CustomerAboutScreen> createState() => _CustomerAboutScreenState();
}

class _CustomerAboutScreenState extends State<CustomerAboutScreen> {
  late Future<CustomerInstalledApp> info = CustomerInstalledApp.load();
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      leading: const CustomerHomeBackButton(),
      title: const CustomerText('About SelfX'),
    ),
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const Align(
            alignment: AlignmentDirectional.centerStart,
            child: CustomerBrand(),
          ),
          const SizedBox(height: 32),
          CustomerText(
            'A little more possibility',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 16),
          const CustomerText(
            'SelfX brings personal and Store-sponsored Try-On together in one place. Customer app.',
          ),
          const SizedBox(height: 28),
          FutureBuilder<CustomerInstalledApp>(
            future: info,
            builder: (context, snapshot) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Material(
                  color: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(22),
                    side: const BorderSide(color: CustomerColors.line),
                  ),
                  child: ListTile(
                    title: const CustomerText('App version'),
                    subtitle: snapshot.hasData
                        ? Text(
                            snapshot.data!.display,
                            textDirection: TextDirection.ltr,
                          )
                        : CustomerText(
                            snapshot.hasError
                                ? 'Version unavailable'
                                : 'Loading…',
                          ),
                    trailing: snapshot.hasError
                        ? IconButton(
                            tooltip: tr(context, 'Retry'),
                            onPressed: () => setState(
                              () => info = CustomerInstalledApp.load(),
                            ),
                            icon: const Icon(Icons.refresh_rounded),
                          )
                        : null,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
