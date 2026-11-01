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
          const SizedBox(height: 28),
          CustomerText(
            'Meet your personal fitting room. Explore how an outfit could look on you.',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          const CustomerText(
            'Choose photos you own or have permission to use. Virtual Try-On is a visual preview; fit and detail can vary.',
          ),
          const SizedBox(height: 24),
          _AboutInfoCard(
            icon: Icons.checkroom_outlined,
            title: 'Personal',
            description:
                'Personal free trial credits. Store-sponsored usage is separate.',
          ),
          const SizedBox(height: 12),
          _AboutInfoCard(
            icon: Icons.storefront_outlined,
            title: 'Store-sponsored Try-On',
            description:
                'Scan a participating Store’s SelfX QR. Its products and sponsorship will appear before you try on.',
          ),
          const SizedBox(height: 12),
          _AboutInfoCard(
            icon: Icons.bookmark_border_rounded,
            title: 'Saved',
            description:
                'Find your tried-on outfits and results in Saved. Mobile results stay for 30 days; download your favourites before they expire.',
          ),
          const SizedBox(height: 24),
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

class _AboutInfoCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;

  const _AboutInfoCard({
    required this.icon,
    required this.title,
    required this.description,
  });

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(20),
      side: const BorderSide(color: CustomerColors.line),
    ),
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: CustomerColors.orange),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CustomerText(
                  title,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 6),
                CustomerText(description),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
