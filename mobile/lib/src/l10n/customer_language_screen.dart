import 'package:flutter/material.dart';
import '../auth/customer_controller.dart';
import 'customer_copy.dart';
import 'customer_language.dart';

class CustomerLanguageScreen extends StatefulWidget {
  final CustomerController controller;
  const CustomerLanguageScreen({super.key, required this.controller});
  @override
  State<CustomerLanguageScreen> createState() => _CustomerLanguageScreenState();
}

class _CustomerLanguageScreenState extends State<CustomerLanguageScreen> {
  String query = '';
  bool failed = false;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.controller,
    builder: (context, _) => Scaffold(
      appBar: AppBar(title: const CustomerText('Language')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          CustomerText(
            'Choose your language',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          const CustomerText(
            'Changes apply immediately. Your language is saved to this device and your account.',
          ),
          const SizedBox(height: 20),
          TextField(
            decoration: InputDecoration(
              labelText: tr(context, 'Search languages'),
              prefixIcon: const Icon(Icons.search),
            ),
            onChanged: (value) =>
                setState(() => query = value.trim().toLowerCase()),
          ),
          if (widget.controller.languageSaving) ...[
            const SizedBox(height: 12),
            const LinearProgressIndicator(),
            const CustomerText('Saving language…'),
          ],
          if (failed)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: CustomerText(
                'Could not save your language. Please try again.',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          const SizedBox(height: 12),
          for (final item in CustomerLanguage.all.where(
            (item) => '${item.code} ${item.name} ${item.nativeName}'
                .toLowerCase()
                .contains(query),
          ))
            ListTile(
              key: ValueKey('language-${item.code}'),
              // Endonyms and English names make it possible to recover from an unfamiliar language.
              title: Text(item.nativeName, locale: Locale(item.code)),
              subtitle: item.nativeName == item.name
                  ? null
                  : Text(item.name, textDirection: TextDirection.ltr),
              leading: widget.controller.language == item.code
                  ? const Icon(Icons.check_circle, color: Color(0xFFFF7119))
                  : const Icon(Icons.circle_outlined),
              selected: widget.controller.language == item.code,
              enabled: !widget.controller.languageSaving,
              onTap: () async {
                setState(() => failed = false);
                try {
                  await widget.controller.changeLanguage(item.code);
                } catch (_) {
                  if (mounted) setState(() => failed = true);
                }
              },
            ),
        ],
      ),
    ),
  );
}
